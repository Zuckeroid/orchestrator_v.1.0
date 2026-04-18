# Orchestrator

Backend and admin UI for provisioning My Storage users from billing events.

## VPS deployment

1. Clone the repository:

```bash
cd /opt
git clone https://github.com/Zuckeroid/orchestrator.git
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
- Postgres and Redis are bound to `127.0.0.1`.

5. Admin UI settings:

Use these values in the settings band:

- `API base URL`: `/api/v1`
- `Admin key`: value of `ADMIN_API_KEY`
- `Actor`: `admin`
- `Webhook key`: value of `WEBHOOK_API_KEY`
- `Webhook secret`: value of `WEBHOOK_SIGNING_SECRET`

## Notes

The compose file uses named volumes for Postgres and Redis. If you add these
volumes to an already running VPS with important data in old containers, export
the database before recreating containers.
