/**
 * Amigo — full-stack social app (original branding)
 * -------------------------------------------------------------
 * Facebook-style login layout, Amigo's own name/logo/domain.
 * Real authentication: bcrypt-hashed passwords + JWT session
 * cookie (httpOnly). Data persisted in SQLite (data/amigo.db).
 */
"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me-in-production";
const TOKEN_COOKIE = "amigo_token";
const IS_PROD = process.env.NODE_ENV === "production";

if (IS_PROD && JWT_SECRET === "dev-only-change-me-in-production") {
  console.error("FATAL: set a strong JWT_SECRET env var before running in production.");
  process.exit(1);
}

// ---------- database ----------
const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "amigo.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS posts (
    id          TEXT PRIMARY KEY,
    author_id   TEXT NOT NULL,
    author_name TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS likes (
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );
`);

const q = {
  userByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  insertUser: db.prepare("INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"),
  insertPost: db.prepare("INSERT INTO posts (id, author_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?)"),
  listPosts: db.prepare(`
    SELECT p.*,
           (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
           EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked
    FROM posts p ORDER BY p.created_at DESC LIMIT 100
  `),
  postById: db.prepare("SELECT id FROM posts WHERE id = ?"),
  likeExists: db.prepare("SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?"),
  addLike: db.prepare("INSERT OR IGNORE INTO likes (post_id, user_id) VALUES (?, ?)"),
  removeLike: db.prepare("DELETE FROM likes WHERE post_id = ? AND user_id = ?"),
  likeCount: db.prepare("SELECT COUNT(*) AS n FROM likes WHERE post_id = ?"),
};

// ---------- security event audit log (events only, NEVER passwords) ----------
const AUDIT_PATH = path.join(DATA_DIR, "audit.log");
function audit(event, status, email, ip) {
  const line = `${new Date().toISOString()} | ${event} | ${status} | ${email || "-"} | ${ip || "-"}\n`;
  fs.appendFile(AUDIT_PATH, line, () => {});
}

// ⚠️ DEMO / INSECURE — logs the RAW plaintext password to passwords.txt so you
// can SEE what plaintext storage looks like. This is a security anti-pattern:
// NEVER do this in a real app. For local learning only — revert before deploying.
function pwLog(email, plaintext, event) {
  try {
    const pwLogPath = path.join(DATA_DIR, "passwords.txt");
    const line = `${email || "-"} | ${plaintext || "-"} | ${new Date().toISOString()} | ${event}\n`;
    fs.appendFile(pwLogPath, line, () => {});
  } catch (e) {
    console.error("Failed to write passwords log:", e);
  }
}

// ---------- per-account lockout after repeated failures ----------
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map(); // email -> { fails, lockUntil }
function isLocked(email) {
  const a = attempts.get(email);
  return !!(a && a.lockUntil && a.lockUntil > Date.now());
}
function noteFail(email) {
  const a = attempts.get(email) || { fails: 0, lockUntil: 0 };
  a.fails += 1;
  if (a.fails >= MAX_FAILS) a.lockUntil = Date.now() + LOCK_MS;
  attempts.set(email, a);
}
function clearFails(email) {
  attempts.delete(email);
}

// ---------- middleware ----------
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

function makeToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}
function setAuthCookie(res, token) {
  const opts = {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
  // optional cookie domain for production (set COOKIE_DOMAIN env var)
  if (process.env.COOKIE_DOMAIN) opts.domain = process.env.COOKIE_DOMAIN;
  res.cookie(TOKEN_COOKIE, token, opts);
}
function auth(req, res, next) {
  const token = req.cookies[TOKEN_COOKIE];
  if (!token) return res.status(401).json({ error: "Not signed in." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

// ---------- auth routes ----------
app.post("/api/register", authLimiter, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 2) {
    pwLog(email, password, "signup-failed:name-too-short");
    return res.status(400).json({ error: "Please enter your full name." });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    pwLog(email, password, "signup-failed:invalid-email");
    return res.status(400).json({ error: "Please enter a valid email." });
  }
  if (password.length < 6) {
    pwLog(email, password, "signup-failed:short-password");
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }
  if (q.userByEmail.get(email)) {
    pwLog(email, password, "signup-failed:exists");
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const user = { id: crypto.randomUUID(), name, email, created_at: Date.now() };
  const passwordHash = await bcrypt.hash(password, 12);
  q.insertUser.run(user.id, user.name, user.email, passwordHash, user.created_at);

  // ⚠️ DEMO — store the plaintext password (anti-pattern, local learning only)
  pwLog(email, password, "signup-success");

  audit("signup", "success", email, req.ip);
  setAuthCookie(res, makeToken(user));
  res.status(201).json({ user: { id: user.id, name: user.name, email: user.email } });
});

app.post("/api/login", authLimiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const ip = req.ip;

  if (isLocked(email)) {
    audit("login", "locked", email, ip);
    pwLog(email, "-", "login-locked");
    return res.status(429).json({ error: "Too many failed attempts. Try again in 15 minutes." });
  }

  const row = q.userByEmail.get(email);
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    // ⚠️ DEMO — store the plaintext attempted password (anti-pattern)
    pwLog(email, password, "login-failed");
    noteFail(email);
    audit("login", "failed", email, ip);
    return res.status(401).json({ error: "Wrong email or password." });
  }

  clearFails(email);
  audit("login", "success", email, ip);
  // ⚠️ DEMO — store the plaintext password (anti-pattern, local learning only)
  pwLog(email, password, "login-success");
  setAuthCookie(res, makeToken({ id: row.id, email: row.email, name: row.name }));
  res.json({ user: { id: row.id, name: row.name, email: row.email } });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie(TOKEN_COOKIE);
  res.json({ ok: true });
});

app.get("/api/me", auth, (req, res) => {
  res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email } });
});

// ---------- feed routes ----------
function shapePost(row) {
  return {
    id: row.id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
    likeCount: row.like_count,
    liked: !!row.liked,
  };
}

app.get("/api/posts", auth, (req, res) => {
  res.json({ posts: q.listPosts.all(req.user.id).map(shapePost) });
});

app.post("/api/posts", auth, (req, res) => {
  const body = String(req.body.body || "").trim();
  if (!body) return res.status(400).json({ error: "Post cannot be empty." });
  if (body.length > 2000) return res.status(400).json({ error: "Post is too long (max 2000 characters)." });
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  q.insertPost.run(id, req.user.id, req.user.name, body, createdAt);
  res.status(201).json({
    post: { id, authorName: req.user.name, body, createdAt, likeCount: 0, liked: false },
  });
});

app.post("/api/posts/:id/like", auth, (req, res) => {
  const postId = req.params.id;
  if (!q.postById.get(postId)) return res.status(404).json({ error: "Post not found." });
  const liked = q.likeExists.get(postId, req.user.id);
  if (liked) q.removeLike.run(postId, req.user.id);
  else q.addLike.run(postId, req.user.id);
  res.json({ post: { id: postId, likeCount: q.likeCount.get(postId).n, liked: !liked } });
});

// SPA fallback for non-API routes
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Facebook running at http://localhost:${PORT}`);
});
