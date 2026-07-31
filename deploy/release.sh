#!/usr/bin/env bash
# RadScribe release: complete local quality gates, then deploy to the VPS.
# Usage: ./release.sh user@your-vps [remote-dir]
set -euo pipefail

HOST="${1:?usage: ./release.sh user@host [remote-dir]}"
REMOTE_DIR="${2:-~/radscribe}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Quality gates"
(cd "$ROOT/backend" && npx prisma validate && npm run typecheck && npm test -- --runInBand && npm run build && npm audit --omit=dev --audit-level=high)
(cd "$ROOT/radscribe" && npm run typecheck && npm run lint && npm test && npm run build && npm audit --omit=dev --audit-level=high)
(cd "$ROOT/radscribe-admin" && npm run lint && npm test && npm audit --omit=dev --audit-level=high)

echo "==> Sync sources to $HOST:$REMOTE_DIR"
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude dist --exclude .git \
  --include '.env.production.example' --exclude '.env' --exclude '.env.*' \
  "$ROOT/" "$HOST:$REMOTE_DIR/"

echo "==> Build & restart on the VPS"
ssh "$HOST" "cd $REMOTE_DIR/deploy && docker compose -f docker-compose.prod.yml --env-file .env.production config --quiet && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build"

echo "==> Health"
ssh "$HOST" "cd $REMOTE_DIR/deploy && docker compose -f docker-compose.prod.yml ps"
echo "Done. Check https://\$DOMAIN"
