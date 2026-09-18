# Amigo

A **Facebook-style social app** with its **own branding** (name, logo, and domain are Amigo's — not Facebook's). Full-stack: an Express + SQLite backend with real authentication, and a vanilla-JS front-end that matches the current split-screen login layout.

> Not affiliated with Facebook / Meta. No Facebook logos, images, or copy are used — only the general layout style. Don't rebrand this to impersonate a real service.

## Features

- Split-screen login page (collage + headline on the left, form on the right), light **and** dark theme, responsive to phone width.
- Real authentication: register / log in / log out.
  - Passwords hashed with **bcrypt** (cost 12), never stored in plain text.
  - Sessions carried in a signed **JWT** inside an `httpOnly`, `sameSite` cookie (`secure` in production).
  - **Rate limiting** on the login and register endpoints.
- A home **feed** after login: create posts, like / unlike, newest first.
- Persistent **SQLite** database (`data/amigo.db`, WAL mode) — no external services to run.

## Project structure

```
amigo/
├─ server.js          # Express backend + REST API (auth, posts)
├─ package.json
├─ .env.example       # copy to .env for production
├─ public/            # front-end, served by Express
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
└─ data/amigo.db      # created automatically on first run
```

## Run

Requires **Node.js 18+**.

```bash
cd amigo
npm install
npm start
```

Open **http://localhost:3000**, create an account, and you're in.
Development with auto-reload: `npm run dev`.

## API

| Method | Route                 | Auth | Body                          |
|--------|-----------------------|------|-------------------------------|
| POST   | `/api/register`       | –    | `{ name, email, password }`   |
| POST   | `/api/login`          | –    | `{ email, password }`         |
| POST   | `/api/logout`         | –    | –                             |
| GET    | `/api/me`             | ✅   | –                             |
| GET    | `/api/posts`          | ✅   | –                             |
| POST   | `/api/posts`          | ✅   | `{ body }`                    |
| POST   | `/api/posts/:id/like` | ✅   | –                             |

Auth is a cookie session, so the browser sends it automatically; API clients should keep the cookie jar.

## Deploy to production

It's a standard Node web service.

1. **Set env vars** (see `.env.example`):
   - `JWT_SECRET` — a long random string. Generate one:
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
     The server refuses to start in production with the default secret.
   - `NODE_ENV=production` — enables the `secure` cookie flag (serve over HTTPS).
   - `PORT` is provided by most hosts.
2. **Start command:** `npm start`.
3. Works on Render, Railway, Fly.io, a VPS, etc. Put it behind HTTPS.
4. **Persist `data/`** — mount a volume so the SQLite file survives restarts/redeploys. For high traffic or multiple instances, move to Postgres/MySQL.

## Possible next steps

- Email verification and password reset.
- Comments, profiles, avatars, image uploads.
- Move from SQLite to a networked database when you outgrow a single instance.
