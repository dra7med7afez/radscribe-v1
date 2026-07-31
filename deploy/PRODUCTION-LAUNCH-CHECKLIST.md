# Production launch checklist

Do not launch RadScribe with real clinical data until every item below has an
identified owner and recorded evidence.

1. Run CI on the exact release commit. Require green backend, web, admin,
   container-build, schema-validation, test, lint, and production dependency
   audit jobs before tagging the release.
2. Before applying `20260728100000_integrity_constraints` to an existing
   database, query for duplicate `(organizationId, mrn)` patient records.
   Reconcile duplicates through an approved clinical data process; do not
   delete or merge patient records automatically. Also verify that every
   `ReportVersion.signedById`, `AiUsage.userId`, and `AiUsage.reportId`
   references an existing row (nullable AI references may be set to null after
   review). Take and verify a backup, then run `prisma migrate deploy` in
   staging before production.
3. Run the one-time `bootstrap` Compose job with unique `ADMIN_EMAIL` and a
   strong `ADMIN_PASSWORD`; sign in, rotate that password, enroll TOTP MFA,
   sign out, and prove password plus MFA login works. Keep
   `REQUIRE_PRIVILEGED_MFA=true`.
4. Keep `ALLOW_REGISTRATION=false` until an account approval, identity
   verification, and support process is approved.
5. Set distinct 32+ character JWT secrets, `CREDENTIALS_KEY`, database
   passwords, and `REDIS_PASSWORD`; store them in
   a managed secret store, rotate them according to policy, and restrict access.
6. Deploy under HTTPS with a real domain, verify HSTS/CSP headers, and confirm
   MySQL and Redis have no public network path. If the separate admin console
   is used, host it on a sibling subdomain covered by `CORS_ORIGIN` so the
   Strict refresh cookie remains same-site.
7. Configure encrypted offsite database backups, backup-success/failure
   alerting, retention, and a documented RPO/RTO. Complete and record a
   restore drill into an isolated environment.
8. Configure centralized structured-log retention, `/api/health` uptime
   checks, authenticated `/api/health/details` readiness checks,
   alert routing, and an incident-response owner. Do not put PHI in log
   queries, tickets, or alerts.
9. Obtain legal/privacy approval, a risk assessment, and required provider
   agreements. If AI will receive audio or report text, set
   `AI_PHI_APPROVED=true` only after the exact provider, account, region, model
   and data-use terms are approved; otherwise leave AI disabled.
10. Perform clinical validation with radiologists: patient identity selection,
   report signing, final-report retrieval, correction/addendum policy,
   downtime workflow, and user training.
11. External integrations are intentionally disabled. Before enabling one,
   implement and independently validate its FHIR/HL7/DICOM/webhook adapter,
   credential rotation, TLS, patient matching, acknowledgement/retry/dead
   letter behavior, audit trail, monitoring, and rollback plan in non-prod.
12. Complete manual desktop and mobile accessibility regression, keyboard-only
    navigation, session timeout, MFA, report conflict, offline/reconnect,
    signed-report download/copy, addendum, and cross-tenant authorization
    tests in staging.
13. Run a measured load test against staging with production-like API and
    database sizing. Confirm Redis throttling is shared across at least two API
    replicas and set capacity/latency/error-rate launch thresholds.
14. Document incident response, breach notification, downtime reporting,
    account recovery/MFA reset, key rotation, retention/deletion, and support
    ownership. Obtain an explicit clinical and security launch sign-off.
