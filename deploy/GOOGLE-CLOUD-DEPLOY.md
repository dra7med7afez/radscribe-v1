# Deploy RadScribe on Google Cloud — step by step

This guide deploys the full production stack (Caddy with automatic HTTPS →
Next.js web + NestJS API → MySQL + Redis, nightly offsite backups) on a single **Compute
Engine VM**. The stack is plain Docker Compose, so a VM is the simplest and
cheapest fit — no Kubernetes or Cloud Run rework needed.

**What you need before starting**

- A Google account with billing enabled on Google Cloud.
- A domain name you control (e.g. `radscribe.example.com`).
- A Gemini API key (from [Google AI Studio](https://aistudio.google.com/apikey)).
- Optional: a Google OAuth Web client ID if you want "Sign in with Google".

Estimated cost: an `e2-medium` VM (2 vCPU / 4 GB) + 30 GB disk + static IP is
roughly **$28–35/month**.

---

## Step 1 — Create a project and enable Compute Engine

In the [Cloud Console](https://console.cloud.google.com), or with the
[gcloud CLI](https://cloud.google.com/sdk/docs/install):

```bash
gcloud projects create radscribe-prod --name="RadScribe"
gcloud config set project radscribe-prod
# link billing in the console: Billing → Link a billing account
gcloud services enable compute.googleapis.com
```

## Step 2 — Reserve a static external IP

The domain must point at an IP that never changes:

```bash
gcloud compute addresses create radscribe-ip --region=us-central1
gcloud compute addresses describe radscribe-ip --region=us-central1 --format="get(address)"
```

Note the printed IP — you'll use it in Steps 3 and 4. (Pick a region close to
your users and use the same one everywhere.)

## Step 3 — Create the VM

```bash
gcloud compute instances create radscribe \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-balanced \
  --address=radscribe-ip \
  --tags=http-server,https-server
```

Console equivalent: **Compute Engine → Create instance**, machine type
`e2-medium`, Ubuntu 24.04 LTS, 30 GB disk, tick **Allow HTTP traffic** and
**Allow HTTPS traffic**, and under *Networking → External IPv4* select the
reserved `radscribe-ip`.

Don't use a smaller machine: the Docker image builds (Next.js + TypeScript)
need the 4 GB of RAM. `e2-small` will OOM during `npm run build`.

## Step 4 — Firewall

The `http-server` / `https-server` tags create allow rules for ports 80 and
443 automatically in the default VPC. Verify:

```bash
gcloud compute firewall-rules list --format="table(name,targetTags.list(),allowed[].map().firewall_rule().list())"
```

You need exactly three things open: **22 (SSH), 80, 443**. Nothing else —
MySQL is on an internal Docker network and is never published.

## Step 5 — Point your domain at the VM

At your DNS provider, create an **A record**:

| Type | Name | Value |
|---|---|---|
| A | `radscribe` (or `@`) | the static IP from Step 2 |

Wait until `nslookup radscribe.example.com` returns the IP before Step 9 —
Caddy can only obtain the Let's Encrypt certificate once DNS resolves.

## Step 6 — SSH in and install Docker

```bash
gcloud compute ssh radscribe --zone=us-central1-a
```

(Or use the **SSH** button in the console.) Then on the VM:

```bash
# Docker Engine + compose plugin (official repository)
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# run docker without sudo (re-login after this)
sudo usermod -aG docker $USER
exit
```

SSH back in so the group change takes effect, then `docker ps` should work
without sudo.

## Step 7 — Get the code onto the VM

```bash
git clone <your-repo-url> radscribe
cd radscribe/deploy
```

For a private GitHub repo, either use a fine-grained personal access token in
the clone URL, or `gh auth login`, or add the VM's SSH key as a deploy key.

## Step 8 — Configure secrets

```bash
cp .env.production.example .env.production
nano .env.production
```

Fill in every value. Generate each secret with `openssl rand -hex 32`
(hex only — base64 characters break the database URL). You must set:

| Variable | What |
|---|---|
| `DOMAIN` | `radscribe.example.com` (no `https://`, no trailing slash) |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` | two distinct generated secrets |
| `REDIS_PASSWORD` | generated secret for internal distributed throttling |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | two distinct generated secrets |
| `CREDENTIALS_KEY` | generated secret (encrypts stored integration credentials) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first admin login — set **both** |
| `BACKUP_S3_URI`, `BACKUP_AWS_*` | private S3-compatible offsite destination and least-privilege credentials |
| `GEMINI_API_KEY` | from Google AI Studio |
| `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | optional, same value in both; empty hides the Google button |

The API now **refuses to boot in production** if the JWT secrets or
`CREDENTIALS_KEY` are missing, so a half-filled file fails fast instead of
running on dev defaults.

If you use Google Sign-In: in **Cloud Console → APIs & Services →
Credentials → your OAuth Web client**, add `https://<your-domain>` to
*Authorized JavaScript origins*.

## Step 9 — Launch

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d mysql redis
docker compose -f docker-compose.prod.yml --env-file .env.production --profile bootstrap run --rm bootstrap
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

First build takes ~5–10 minutes. Then verify:

```bash
docker compose -f docker-compose.prod.yml ps        # all services "healthy"
curl -fsS https://<your-domain>/api/health          # {"status":"ok"}
```

The explicit one-time bootstrap command creates the platform administrator,
roles, and starter templates. Normal API starts apply migrations but never
seed privileged accounts. Open `https://<your-domain>`, sign in as the admin,
rotate the bootstrap password, enroll an authenticator under **Account**, then
create radiologist accounts under
**Account → Team** — each gets a temporary password rotated on first login.

## Step 10 — Verify offsite backups (required)

The `backup` container writes a nightly `mysqldump`, keeps 14 days locally,
and uploads every successful dump to the required `BACKUP_S3_URI`. For Google
Cloud Storage, configure an S3-compatible endpoint/credential or use another
private S3-compatible object store. Verify object encryption, versioning or
immutability, failure alerting, and a restore into an isolated scratch
database before launch.

Also consider a **disk snapshot schedule**: Compute Engine → Snapshots →
Create snapshot schedule → attach to the VM's disk (daily, keep 7).

## Day-2 operations

All commands from `~/radscribe/deploy` on the VM:

| Task | Command |
|---|---|
| Status | `docker compose -f docker-compose.prod.yml ps` |
| API logs | `docker compose -f docker-compose.prod.yml logs -f api` |
| Deploy an update | `git pull && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build` |
| Rollback | `git checkout <previous-tag>` then the same `up -d --build` |
| Stop everything | `docker compose -f docker-compose.prod.yml down` (data survives in volumes) |

Restore procedure is in [README.md](README.md) §5 — test it before you need it.

## Troubleshooting

- **Browser shows a certificate error / site unreachable** — DNS hasn't
  propagated or port 443 is blocked. Check `nslookup <domain>` returns the
  static IP, and `docker compose ... logs caddy` for ACME errors. Caddy
  retries automatically once DNS is correct.
- **502 from Caddy** — the API or web container is unhealthy. Check
  `docker compose ... ps` and the failing service's logs. A boot-time crash
  saying `Refusing to start in production without: ...` means
  `.env.production` is missing a required secret.
- **Build killed / OOM** — machine too small. Use `e2-medium` or larger, or
  add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`.
- **`api` restarts in a loop with a Prisma URL error** — a special character
  in `MYSQL_PASSWORD`. Regenerate it with `openssl rand -hex 32`, update
  `.env.production`, then `down` and `up -d` again (if MySQL already
  initialized with the old password, you must also update the user in MySQL
  or wipe the `mysql_data` volume on a fresh install).

## Compliance note

Dictation audio and report text transit Google's Generative Language API.
For real patient data (PHI/HIPAA), a BAA with Google — or moving the AI calls
to Vertex AI — is the operator's responsibility. See README.md §6 for the
full security posture.
