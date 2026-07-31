# Security notes & accepted advisories

## Posture summary (production stack, `deploy/`)

- Single origin behind Caddy (TLS + HSTS + nosniff/frame/referrer headers);
  MySQL on an internal-only docker network, no published ports; Swagger off in
  production; request bodies never logged (PHI); pino JSON logs with request ids.
- Auth: bcrypt(12), 15m access + rotating hashed refresh tokens with ATOMIC
  rotation and reuse detection (a replayed token outside a 30s two-tab grace
  window revokes the user's whole session family), constant-work login (dummy
  bcrypt compare on unknown email), server-side revocation on logout/password
  change/deactivation/admin reset, login throttle 10/min keyed on the REAL
  client IP (`trust proxy` = Caddy), forced password rotation for new/reset
  accounts, RBAC guard (`manage:users` admin-only), per-user data scoping in
  every service. Self-registration can be disabled with `ALLOW_REGISTRATION=false`.
- Tenancy: patients (PHI) and reports are strictly per-user (`ownerId` FK +
  service-level filters); report↔patient links are ownership-checked; the RIS
  worklist comes only from the caller's own integration.
- Data lifecycle: signed (FINAL) reports are immutable and re-signing is
  rejected; users with reports/patients on record cannot be hard-deleted
  (DB FK RESTRICT + service check) — deactivation is the removal path; expired
  refresh tokens and abandoned empty drafts are swept periodically.
- XSS: all template/report HTML is sanitized with DOMPurify at every
  `innerHTML` trust boundary, plus a Content-Security-Policy served by Caddy
  (no remote scripts, no cross-origin exfil targets, no framing).
- Validation: global whitelist + `forbidNonWhitelisted`; `.docx` extract capped
  at 15 MB and magic-byte checked; AI routes body-limited (50 MB) and throttled
  30/min; everything else 1 MB.
- Integration credentials encrypted at rest with AES-256-GCM
  (`CREDENTIALS_KEY`), never returned in plaintext (masked placeholders).
- Audit log rows: login/logout/password change, user CRUD, template CRUD,
  integration CRUD, report sign.

## Known limitations (documented, not yet mitigated)

- **CSP allows inline scripts**: the policy ships `script-src 'unsafe-inline'
  'unsafe-eval'` because Next.js hydration needs it without nonce plumbing.
  DOMPurify is the primary XSS defense; tighten to nonces with `next.config`
  CSP support when practical.
- **Tokens in localStorage**: standard SPA trade-off; XSS in the app would
  expose tokens. Mitigated by DOMPurify sanitization, CSP, short access TTL +
  atomic rotation + reuse detection + revocation. Moving the refresh token to
  an httpOnly cookie is the long-term fix.
- **Access-token staleness**: permissions/active are baked into 15-minute
  access tokens; deactivating a user leaves their current access token valid
  until expiry (refresh is revoked immediately).
- **In-memory rate limiter**: per-node only. Fine for the single-VPS deploy;
  switch the throttler to Redis storage before running multiple API nodes.
- **Gemini / PHI**: dictation audio and report text transit Google's
  Generative Language API. A BAA with Google (or a Vertex AI deployment) is the
  operator's responsibility before storing real PHI.

## Accepted (documented) advisories

### postcss < 8.5.10 via `next@16.2.x` (GHSA-qx2v-qp2m-jg93, moderate)
- `next` exact-pins `postcss@8.4.31` internally; npm overrides do not take effect
  against it, and the bump only lands in Next 16.3.
- **Why accepted:** the advisory is an XSS in postcss's CSS *stringify* output,
  exploitable only when compiling untrusted CSS. RadScribe compiles only its own
  authored stylesheets at **build time**; no user-supplied CSS is ever processed.
- **Action:** re-run `npm audit` after upgrading to Next 16.3+ and remove this
  entry once clean.

## Fixed
- `multer` DoS advisories (GHSA-72gw-mp4g-v24j, GHSA-3p4h-7m6x-2hcm): forced
  `multer@^2.2.0` via `overrides` in `backend/package.json` (Nest 11 still pins
  2.1.1). Remove the override when `@nestjs/platform-express` bumps it.
- `js-yaml` merge-key DoS (GHSA-h67p-54hq-rp68): resolved by `npm audit fix`.
