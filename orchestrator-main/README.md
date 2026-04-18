# Orchestrator

Backend and admin UI for provisioning My Storage users from billing events.

## VPS deployment

1. Clone the repository:

```bash
cd /opt
git clone https://github.com/Zuckeroid/orchestrator_v.1.0.git orchestrator
cd orchestrator/orchestrator-main
```

2. Create `.env`:

```bash
cp .env.production.example .env
nano .env
```

Generate strong secrets on the VPS:

```bash
openssl rand -hex 32
```

Set at least:

- `ADMIN_API_KEY`
- `ADMIN_UI_BASIC_AUTH_PASSWORD`
- `WEBHOOK_API_KEY`
- `WEBHOOK_SIGNING_SECRET`
- `DATA_ENCRYPTION_KEY`
- `DB_PASS`
- `BILLING_API_KEY`
- `ADMIN_UI_ORIGIN`

3. Start services:

```bash
docker compose up -d --build
docker compose ps
curl -s http://127.0.0.1:3000/api/v1/health
```

4. Firewall baseline:

```bash
ufw allow OpenSSH
ufw allow 8080/tcp
ufw deny 3000/tcp
ufw deny 5432/tcp
ufw deny 6379/tcp
ufw enable
ufw status verbose
```

With the default compose settings:

- Admin UI is available on `http://YOUR_ORCHESTRATOR_HOST:8080`.
- API is bound to `127.0.0.1:3000`.
- Admin UI proxies browser requests from `/api/v1` to the API container.
- The proxy injects `X-Admin-Api-Key` from `ADMIN_API_KEY`.
- Admin UI and proxied admin API requests are protected by Basic Auth.
- `/api/v1/webhook/billing` is not protected by Basic Auth, so the billing
  system can call it. It is still protected by the webhook API key and signature.
- Postgres and Redis are bound to `127.0.0.1`.

5. Admin UI settings:

Open `http://YOUR_ORCHESTRATOR_HOST:8080` and pass Basic Auth with:

- username: value of `ADMIN_UI_BASIC_AUTH_USER`
- password: value of `ADMIN_UI_BASIC_AUTH_PASSWORD`

Then use these values in the settings band:

- `API base URL`: `/api/v1`
- `Admin key`: leave empty when using the VPS proxy
- `Actor`: `admin`

## Notes

The compose file uses named volumes for Postgres and Redis. If you add these
volumes to an already running VPS with important data in old containers, export
the database before recreating containers.
