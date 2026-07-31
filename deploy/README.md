# RadScribe — production deployment runbook

Single-VPS deployment: Caddy (automatic HTTPS) → Next.js web + NestJS API,
MySQL and Redis on an internal-only network, nightly encrypted offsite backups. One domain: the app at
`https://<domain>`, the API proxied at `https://<domain>/api` (same origin —
no CORS exposure).

> Deploying on **Google Cloud**? Follow the step-by-step guide in
> [GOOGLE-CLOUD-DEPLOY.md](GOOGLE-CLOUD-DEPLOY.md) — it covers the VM,
> firewall, DNS, and offsite backups; then this runbook applies for day-2 ops.

## 1. Provision

- Any Docker-capable VPS (2 vCPU / 4 GB is comfortable). Install Docker Engine
  + the compose plugin.
- Open ONLY ports **22, 80, 443** in the provider firewall.
- DNS: an **A record** for your domain (e.g. `radscribe.example.com`) pointing
  at the VPS IP. Caddy gets the Let's Encrypt certificate automatically once
  DNS resolves.

## 2. Configure

```bash
# on the VPS
git clone <your-repo> radscribe && cd radscribe/deploy
cp .env.production.example .env.production
openssl rand -base64 48   # run per secret and paste into .env.production
nano .env.production      # DOMAIN, MySQL passwords, JWT secrets,
                          # ADMIN_EMAIL + ADMIN_PASSWORD, CREDENTIALS_KEY,
                          # REDIS_PASSWORD, backup credentials,
                          # optional GEMINI_API_KEY + AI_PHI_APPROVED
```

Set **both** `ADMIN_EMAIL` and `ADMIN_PASSWORD`; there is no fallback account
or default password. Leave `ALLOW_REGISTRATION=false` unless a documented
account-provisioning process permits self-registration. If AI is enabled, set
`AI_PHI_APPROVED=true` only after the required provider/PHI approval.

## 3. Launch

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d mysql
docker compose -f docker-compose.prod.yml --env-file .env.production --profile bootstrap run --rm bootstrap
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml ps          # all healthy?
curl -fsS https://<domain>/api/health                 # {"status":"ok"}
```

The one-time bootstrap job creates the administrator, roles, and starter
templates. Normal API startups run migrations but never seed accounts. Sign in,
then create radiologist accounts from
**Account → Team** — each gets a temporary password and must rotate it on
first login.

## 4. Operate

| Task | Command (from `deploy/`) |
|---|---|
| Status / health | `docker compose -f docker-compose.prod.yml ps` |
| API logs (JSON) | `docker compose -f docker-compose.prod.yml logs -f api` |
| Redeploy after code change | `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build` |
| Stop everything | `docker compose -f docker-compose.prod.yml down` |

Or run `deploy/release.sh user@vps` from a dev machine: it typechecks, tests,
rsyncs the sources (never `.env*`), rebuilds, and shows health.

## 5. Backups & restore

The `backup` sidecar writes `radscribe-<timestamp>.sql.gz` to the `backups`
volume nightly, keeps 14 days locally, and requires an encrypted S3-compatible
offsite destination. Configure a failure webhook and object-store
versioning/immutability before launch.

```bash
# list backups
docker compose -f docker-compose.prod.yml exec backup ls -lh /backups
# copy one off the VPS for a restore drill
docker cp "$(docker compose -f docker-compose.prod.yml ps -q backup)":/backups/<file> .
# RESTORE into the running mysql (destructive — confirm the file first!)
gunzip < radscribe-<ts>.sql.gz | docker compose -f docker-compose.prod.yml exec -T mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" radscribe
```

Test a restore into a scratch database before you need it for real.

## 6. Security posture

- Only Caddy is internet-facing; MySQL has **no published ports** (internal
  network with `internal: true`). Redis is also internal-only and provides
  distributed API throttling.
- TLS + HSTS + security headers at the proxy; Swagger is disabled in
  production; request bodies are never logged (PHI).
- JWT: 15-minute access tokens, rotating hashed refresh tokens; logout and
  password changes revoke sessions server-side.
- The Gemini key lives only in `.env.production` on the VPS. **HIPAA note:**
  dictation audio and report text transit Google's Generative Language API —
  a BAA with Google (or moving to Vertex AI) is the operator's responsibility.
- Privileged administration requires an enrolled TOTP authenticator in
  production. Bootstrap the platform administrator, sign in, and enroll MFA
  before assigning or changing users, plans, or billing.

## 7. Update / rollback

```bash
git pull && cd deploy
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
# rollback = git checkout <previous-tag> && same up -d --build
# (migrations are additive so far; restore a backup if a migration must be undone)
```
