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
