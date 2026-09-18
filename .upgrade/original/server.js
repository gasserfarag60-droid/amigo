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

// ---------- middleware ----------
app.set("trust proxy", 1);
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
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
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
  if (name.length < 2) return res.status(400).json({ error: "Please enter your full name." });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Please enter a valid email." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (q.userByEmail.get(email)) return res.status(409).json({ error: "An account with that email already exists." });

  const user = { id: crypto.randomUUID(), name, email, created_at: Date.now() };
  const passwordHash = await bcrypt.hash(password, 12);
  q.insertUser.run(user.id, user.name, user.email, passwordHash, user.created_at);

  setAuthCookie(res, makeToken(user));
  res.status(201).json({ user: { id: user.id, name: user.name, email: user.email } });
});

app.post("/api/login", authLimiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const row = q.userByEmail.get(email);
  if (!row || !(await bcrypt.compare(password, row.password_hash)))
    return res.status(401).json({ error: "Wrong email or password." });

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
  console.log(`Amigo running at http://localhost:${PORT}`);
});
