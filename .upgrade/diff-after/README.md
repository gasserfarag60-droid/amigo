# Amigo

A responsive social app with an English / Egyptian Arabic interface, light/dark themes, local artwork, posts, likes, search, own-post filtering, link sharing, and owner-only post deletion.

## Run locally

Requires Node.js **22.9+** (tested on Node 24).

```powershell
cd C:\amigo
npm install
npm start
```

Open **http://localhost:3000**. The local server binds to 127.0.0.1 by default.
You can copy .env.example to .env; npm start and npm run dev load it automatically.

```powershell
npm test
npm run users:list
```

The users command is a **local operator command**, not an HTTP endpoint. It displays account IDs, names, emails and creation dates, never password hashes. Keep terminal output private.

## Where data is stored

- **data/amigo.db**: SQLite. The users.password_hash column stores a salted bcrypt hash with work factor **12**. Existing bcrypt accounts remain usable.
- **data/passwords**: a private JSON-lines authentication audit file, named as requested. Each entry includes timestamp, operation (login / sign_up), normalized email where valid, success/failure, HTTP status and request ID.
- No submitted password, failed password guess, password hash, cookie or session token is copied into the audit file. Hashes remain in the account table only.
- The audit file is created when the server starts. It starts empty; real login/signup attempts populate it. Requests rejected before JSON parsing may have a null email.
- Logs rotate at 2 MiB, keeping three prior files. Implement time-based retention to fit your operational requirements.
- Audit files and the database are outside public/ and are not served over HTTP.
- On this Windows installation, data/ access is limited to the current operator, SYSTEM and Administrators. POSIX installations also need appropriate owner/permission configuration and a restrictive service umask.

Example audit **schema** (not a real event):

```json
{"timestamp":"2026-09-18T18:00:00.000Z","operation":"login","email":"member@example.test","result":"success","status":200,"request_id":"generated-uuid"}
```

## Authentication and request hardening

- Opaque random session cookies; only SHA-256 session-token digests are stored server-side. Password hashes still use bcrypt, **not SHA-256**.
- Sessions rotate at signup/login and are invalidated server-side at logout.
- 30-minute idle timeout and seven-day maximum authenticated lifetime.
- HTTP-only, SameSite=Strict cookies; production additionally uses Secure and the __Host- cookie prefix.
- Session-bound CSRF tokens on all mutation routes, with Origin and Fetch Metadata checks.
- Call GET /api/csrf before authentication. Send its csrfToken in X-CSRF-Token and keep the cookie jar.
- Signup/login return a new csrfToken; replace the old token in clients.
- IP-based request, auth and write rate limits. Login failures also have a persistent per-account throttle (10 attempts per 15 minutes).
- No implicit trust in X-Forwarded-For. Set TRUST_PROXY only to the addresses/CIDRs of your actual trusted reverse proxies.
- New passwords require at least 12 characters and at most 72 UTF-8 bytes (bcrypt limit). Existing shorter passwords can still log in.
- Parameterized SQL, body/type/length checks, 16 KiB JSON limit, generic server errors and no-store API responses.
- Strict CSP, clickjacking protection, MIME no-sniff, cross-origin isolation headers, and HSTS in production.
- Frontend renders account names and posts with textContent; no user-provided HTML is inserted.
- The replacement collage is public/assets/login-collage.webp, copied byte-for-byte from the supplied WebP.
- All browser assets are local. No external fonts, analytics or third-party requests are used.

## Production requirements and remaining work

These changes improve protection; they are **not a claim of immunity from compromise**.

1. Set NODE_ENV=production and APP_ORIGIN=https://your-real-domain.example. The server rejects HTTP production origins.
2. Terminate TLS at a maintained reverse proxy; restrict direct backend access. Set HOST and TRUST_PROXY to match the actual network.
3. Use a dedicated least-privileged service identity and private database/log/backups permissions. Do not expose the project directory with another static server.
4. Back up SQLite using its online backup facility, not by copying only the database while WAL writes are active.
5. Maintain dependencies, OS, TLS and incident monitoring; put network-level abuse/DDoS controls at the edge.
6. Add email verification, verified email recovery, MFA/passkeys and a reviewed admin authorization model before a public rollout that needs these features. They are **not implemented** here.
7. Signup currently returns 409 for an existing account; this exposes account existence. A fully enumeration-resistant signup flow needs email verification/out-of-band confirmation.
8. IP limits are process-local; SQLite and audit rotation are designed for **one application process**. Use shared rate-limit/session infrastructure and centralized logging for multiple workers/instances.
9. Feed/search currently cover the most recent 100 posts. This is not a full-text/paginated archive.
10. UI supports English and Arabic; server validation/error strings currently remain English.

The old JWT cookies are no longer accepted after upgrade. Users sign in again; account records, posts and likes are retained. The existing jsonwebtoken dependency is retained for compatibility with source rollback.

## Verification and rollback

- VERIFICATION.txt: exact commands, observed results, hashes, limitations and rollback evidence.
- DIFF.patch: source diff, excluding private databases and logs.
- .upgrade/original/: original source snapshot, with original-hashes.json.
- .upgrade/reports/: test transcripts and desktop/mobile screenshots.
- ROLLBACK.sh: tested source rollback, runnable with Git Bash.

```powershell
# Stop the Amigo process first. Then restore tracked source files:
& 'C:\Program Files\Git\bin\bash.exe' C:/amigo/ROLLBACK.sh
npm start
```

Rollback checks all original hashes and refuses to overwrite files changed since this upgrade. It restores original tracked source and removes only the added files listed in its manifest. It does **not** delete user data, restore an old database over current data, weaken data permissions, or remove this verification bundle. Additive security tables can remain in SQLite; the original app ignores them.

Rollback intentionally restores the original security behavior, including the previous CSRF and logout-replay weaknesses. Use it only for recovery, not as a security improvement.

## References

- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [Express production security](https://expressjs.com/en/advanced/best-practice-security/)
