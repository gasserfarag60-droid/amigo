"use strict";
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const { rateLimit } = require("express-rate-limit");
const Database = require("better-sqlite3");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const IS_PROD = process.env.NODE_ENV === "production";
const configuredOrigin = process.env.APP_ORIGIN || (IS_PROD ? "" : "http://localhost:" + PORT);
let APP_ORIGIN;
try {
  const url = new URL(configuredOrigin);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash || (IS_PROD && url.protocol !== "https:")) throw new Error();
  APP_ORIGIN = url.origin;
} catch {
  console.error("FATAL: APP_ORIGIN must be a single origin (HTTPS required in production).");
  process.exit(1);
}
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const AUDIT_FILE = path.join(DATA_DIR, "passwords");
const COOKIE = IS_PROD ? "__Host-amigo_session" : "amigo_session";
const SESSION_MAX = 7 * 24 * 60 * 60 * 1000;
const SESSION_IDLE = 30 * 60 * 1000;
const WINDOW = 15 * 60 * 1000;
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const random = () => crypto.randomBytes(32).toString("hex");
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
fs.closeSync(fs.openSync(AUDIT_FILE, "a", 0o600));

const db = new Database(path.join(DATA_DIR, "amigo.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY, author_id TEXT NOT NULL, author_name TEXT NOT NULL,
    body TEXT NOT NULL, created_at INTEGER NOT NULL,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS likes (
    post_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS amigo_sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT, csrf TEXT NOT NULL,
    created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS login_attempts (
    account_key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS posts_created_idx ON posts(created_at DESC);
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON amigo_sessions(expires_at);
`);
const q = {
  userByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  userById: db.prepare("SELECT id, name, email FROM users WHERE id = ?"),
  insertUser: db.prepare("INSERT INTO users (id,name,email,password_hash,created_at) VALUES (?,?,?,?,?)"),
  session: db.prepare("SELECT * FROM amigo_sessions WHERE token_hash = ?"),
  newSession: db.prepare("INSERT INTO amigo_sessions VALUES (?,?,?,?,?,?)"),
  deleteSession: db.prepare("DELETE FROM amigo_sessions WHERE token_hash = ?"),
  touchSession: db.prepare("UPDATE amigo_sessions SET last_seen = ? WHERE token_hash = ?"),
  attempts: db.prepare("SELECT * FROM login_attempts WHERE account_key = ?"),
  bumpAttempt: db.prepare(`INSERT INTO login_attempts VALUES (?,1,?)
    ON CONFLICT(account_key) DO UPDATE SET count=CASE WHEN expires_at < ? THEN 1 ELSE count+1 END,
    expires_at=CASE WHEN expires_at < ? THEN excluded.expires_at ELSE expires_at END`),
  clearAttempts: db.prepare("DELETE FROM login_attempts WHERE account_key = ?"),
  insertPost: db.prepare("INSERT INTO posts VALUES (?,?,?,?,?)"),
  listPosts: db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
      EXISTS(SELECT 1 FROM likes l WHERE l.post_id=p.id AND l.user_id=?) AS liked
    FROM posts p ORDER BY p.created_at DESC LIMIT 100
  `),
  postById: db.prepare("SELECT id,author_id FROM posts WHERE id=?"),
  deletePost: db.prepare("DELETE FROM posts WHERE id=? AND author_id=?"),
  likeExists: db.prepare("SELECT 1 FROM likes WHERE post_id=? AND user_id=?"),
  addLike: db.prepare("INSERT OR IGNORE INTO likes VALUES (?,?)"),
  removeLike: db.prepare("DELETE FROM likes WHERE post_id=? AND user_id=?"),
  likeCount: db.prepare("SELECT COUNT(*) AS n FROM likes WHERE post_id=?"),
};
const dummyHash = bcrypt.hashSync(random(), 12);
const cookieOptions = { httpOnly: true, secure: IS_PROD, sameSite: "strict", path: "/" };

function writeAudit(record) {
  try {
    if (fs.statSync(AUDIT_FILE).size >= 2 * 1024 * 1024) {
      if (fs.existsSync(AUDIT_FILE + ".3")) fs.unlinkSync(AUDIT_FILE + ".3");
      for (let i = 2; i >= 1; i--) {
        if (fs.existsSync(AUDIT_FILE + "." + i)) fs.renameSync(AUDIT_FILE + "." + i, AUDIT_FILE + "." + (i + 1));
      }
      fs.renameSync(AUDIT_FILE, AUDIT_FILE + ".1");
    }
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(record) + "\n", { mode: 0o600 });
  } catch { console.error("AUDIT_WRITE_FAILED: check data directory access and disk space."); }
}
function getEmail(body) {
  return typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
}
function validEmail(email) { return /^[^\s@\x00-\x1f]+@[^\s@\x00-\x1f]+\.[^\s@\x00-\x1f]+$/.test(email); }
function validPassword(password, register = false) {
  return typeof password === "string" && password.length >= (register ? 12 : 1) &&
    Buffer.byteLength(password, "utf8") <= 72 && !password.includes("\0");
}
function readSession(req) {
  const token = req.cookies[COOKIE];
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = q.session.get(sha(token));
  if (!session) return null;
  const now = Date.now();
  if (session.expires_at <= now || session.last_seen + SESSION_IDLE <= now) {
    q.deleteSession.run(session.token_hash); return null;
  }
  q.touchSession.run(now, session.token_hash);
  return session;
}
function createSession(req, res, userId = null) {
  if (req.session) q.deleteSession.run(req.session.token_hash);
  const token = random(), csrf = random(), now = Date.now();
  const lifetime = userId ? SESSION_MAX : SESSION_IDLE;
  q.newSession.run(sha(token), userId, csrf, now, now, now + lifetime);
  req.session = { token_hash: sha(token), user_id: userId, csrf, created_at: now, last_seen: now, expires_at: now + lifetime };
  res.cookie(COOKIE, token, { ...cookieOptions, maxAge: lifetime });
  return csrf;
}
function auth(req, res, next) {
  if (!req.session?.user_id) return res.status(401).json({ error: "Please log in to continue.", code: "AUTH_REQUIRED" });
  req.user = q.userById.get(req.session.user_id);
  if (!req.user) return res.status(401).json({ error: "Please log in again.", code: "AUTH_REQUIRED" });
  next();
}
function csrfGuard(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("Sec-Fetch-Site") === "cross-site" || (req.get("Origin") && req.get("Origin") !== APP_ORIGIN))
    return res.status(403).json({ error: "This request came from a different site.", code: "CSRF" });
  const token = req.get("X-CSRF-Token");
  if (!req.session || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token) ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(req.session.csrf)))
    return res.status(403).json({ error: "Your form expired. Refresh the page and try again.", code: "CSRF" });
  if (!req.is("application/json")) return res.status(415).json({ error: "Send application/json." });
  next();
}

app.disable("x-powered-by");
// Trust only explicitly configured proxy addresses, never an arbitrary forwarded IP.
app.set("trust proxy", process.env.TRUST_PROXY ? process.env.TRUST_PROXY.split(",").map(s => s.trim()) : false);
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.set({
    "X-Request-ID": req.requestId,
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" + (IS_PROD ? "; upgrade-insecure-requests" : ""),
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin", "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Resource-Policy": "same-origin",
  });
  if (IS_PROD) res.set("Strict-Transport-Security", "max-age=31536000");
  next();
});
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (["/login", "/register"].includes(req.path) && req.method === "POST") {
    const operation = req.path === "/login" ? "login" : "sign_up";
    res.on("finish", () => writeAudit({
      timestamp: new Date().toISOString(), operation,
      email: validEmail(getEmail(req.body)) ? getEmail(req.body) : null,
      result: res.statusCode < 400 ? "success" : "failure",
      status: res.statusCode, request_id: req.requestId,
      // Passwords and hashes are intentionally absent. Hashes belong only in users.password_hash.
    }));
  }
  next();
});
app.use("/api", rateLimit({ windowMs: WINDOW, limit: 300, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." } }));
app.use("/api", express.json({ limit: "16kb", strict: true }));
app.use(cookieParser());
app.use("/api", (req, res, next) => { req.session = readSession(req); next(); });
app.use("/api", csrfGuard);
const authLimiter = rateLimit({ windowMs: WINDOW, limit: 20, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please try again in 15 minutes." } });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 40, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Please slow down and try again in a minute." } });
app.get("/api/csrf", (req, res) => {
  if (!req.session) createSession(req, res);
  res.json({ csrfToken: req.session.csrf });
});
app.post("/api/register", authLimiter, asyncRoute(async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = getEmail(req.body), password = req.body?.password;
  if (name.length < 2 || name.length > 80 || /[\x00-\x1f]/.test(name))
    return res.status(400).json({ error: "Use a name between 2 and 80 characters." });
  if (typeof req.body?.email !== "string" || req.body.email.trim().length > 254 || !validEmail(email))
    return res.status(400).json({ error: "Please enter a valid email address." });
  if (!validPassword(password, true))
    return res.status(400).json({ error: "Use at least 12 characters and at most 72 UTF-8 bytes for your password." });
  // Hash on both paths to avoid a cheap account-existence timing probe.
  const passwordHash = await bcrypt.hash(password, 12);
  if (q.userByEmail.get(email)) return res.status(409).json({ error: "Unable to create this account. Try logging in or use another email." });
  const user = { id: crypto.randomUUID(), name, email };
  try { q.insertUser.run(user.id, name, email, passwordHash, Date.now()); }
  catch (err) {
    if (err.code?.startsWith("SQLITE_CONSTRAINT")) return res.status(409).json({ error: "Unable to create this account. Try logging in or use another email." });
    throw err;
  }
  const csrfToken = createSession(req, res, user.id);
  res.status(201).json({ user, csrfToken });
}));
app.post("/api/login", authLimiter, asyncRoute(async (req, res) => {
  const email = getEmail(req.body), password = req.body?.password, accountKey = sha(email);
  const attempts = q.attempts.get(accountKey), now = Date.now();
  if (attempts && attempts.expires_at > now && attempts.count >= 10) {
    res.set("Retry-After", String(Math.ceil((attempts.expires_at - now) / 1000)));
    return res.status(429).json({ error: "Too many sign-in attempts. Please try again later." });
  }
  // Reserve an attempt before awaiting bcrypt so concurrent requests share the limit.
  q.bumpAttempt.run(accountKey, now + WINDOW, now, now);
  const row = validEmail(email) ? q.userByEmail.get(email) : null;
  const valid = validPassword(password);
  const match = await bcrypt.compare(valid ? password : "invalid-input", row?.password_hash || dummyHash);
  if (!valid || !row || !match) return res.status(401).json({ error: "Wrong email or password." });
  q.clearAttempts.run(accountKey);
  const csrfToken = createSession(req, res, row.id);
  res.json({ user: { id: row.id, name: row.name, email: row.email }, csrfToken });
}));
app.post("/api/logout", (req, res) => {
  if (req.session) q.deleteSession.run(req.session.token_hash);
  res.clearCookie(COOKIE, cookieOptions);
  res.clearCookie("amigo_token", { path: "/" });
  res.json({ ok: true });
});
app.get("/api/me", auth, (req, res) => res.json({ user: req.user }));
function shapePost(row, userId) {
  return { id: row.id, authorName: row.author_name, body: row.body, createdAt: row.created_at,
    likeCount: row.like_count || 0, liked: !!row.liked, mine: row.author_id === userId };
}
app.get("/api/posts", auth, (req, res) => res.json({ posts: q.listPosts.all(req.user.id).map(p => shapePost(p, req.user.id)) }));
app.post("/api/posts", auth, writeLimiter, (req, res) => {
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body || body.length > 2000) return res.status(400).json({ error: "Write between 1 and 2,000 characters." });
  const id = crypto.randomUUID(), now = Date.now();
  q.insertPost.run(id, req.user.id, req.user.name, body, now);
  res.status(201).json({ post: { id, authorName: req.user.name, body, createdAt: now, likeCount: 0, liked: false, mine: true } });
});
const toggleLike = db.transaction((postId, userId) => {
  const liked = !!q.likeExists.get(postId, userId);
  if (liked) q.removeLike.run(postId, userId); else q.addLike.run(postId, userId);
  return { id: postId, likeCount: q.likeCount.get(postId).n, liked: !liked };
});
app.post("/api/posts/:id/like", auth, writeLimiter, (req, res) => {
  if (!q.postById.get(req.params.id)) return res.status(404).json({ error: "Post not found." });
  res.json({ post: toggleLike(req.params.id, req.user.id) });
});
app.delete("/api/posts/:id", auth, writeLimiter, (req, res) => {
  const post = q.postById.get(req.params.id);
  if (!post) return res.status(404).json({ error: "Post not found." });
  if (post.author_id !== req.user.id) return res.status(403).json({ error: "You can only delete your own posts." });
  db.transaction(() => {
    db.prepare("DELETE FROM likes WHERE post_id=?").run(post.id);
    q.deletePost.run(post.id, req.user.id);
  })();
  res.json({ ok: true });
});
app.use("/api", (req, res) => res.status(404).json({ error: "Endpoint not found." }));
// No catch-all that might pretend a private file is an available page.
app.use(express.static(path.join(__dirname, "public"), { dotfiles: "deny", index: "index.html", maxAge: 0 }));
app.use((req, res) => res.status(404).type("text").send("Not found."));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Request is too large." });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
  console.error("REQUEST_FAILED", req.requestId, err.code || err.name);
  res.status(500).json({ error: "Something went wrong. Please try again.", requestId: req.requestId });
});
const cleanup = setInterval(() => {
  const now = Date.now();
  db.prepare("DELETE FROM amigo_sessions WHERE expires_at<=? OR last_seen<=?").run(now, now - SESSION_IDLE);
  db.prepare("DELETE FROM login_attempts WHERE expires_at<=?").run(now);
}, 5 * 60 * 1000);
cleanup.unref();
const server = app.listen(PORT, HOST, () => console.log("Amigo running at " + APP_ORIGIN));
server.on("error", err => { console.error("SERVER_START_FAILED", err.code); clearInterval(cleanup); db.close(); process.exitCode = 1; });
function shutdown() { clearInterval(cleanup); server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(1), 5000).unref(); }
process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
