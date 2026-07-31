# RadScribe — Full Production Rebuild Prompt (v3)

> **How to use this document:** hand it to an AI coding agent or a dev team as the single
> source of truth. It describes WHAT to build (features, behavior contracts, API surface,
> data model, deployment) and leaves HOW it looks open — you have freedom over visual
> design, colors, and workflow ergonomics, as long as the result stays **minimal and
> modern**. Everything else is a requirement, not a suggestion.

---

## 1. Product

**RadScribe** is an AI-powered voice-dictation reporting workstation for radiology.
A radiologist opens a report template (CT Chest, Echo, Mammogram…), dictates findings
into a microphone, and the app transcribes the speech, structures it with an LLM, and
merges it into the correct organ/region of a fully editable report. The finished report
is copied, exported to Word, or sent onward in seconds.

**Target customers — both must be first-class:**

1. **Individual radiologists** — sign up / get an account, personal templates, personal
   settings, personal usage stats. Zero-admin experience.
2. **Radiology centers** — an admin manages a team of radiologist accounts, global
   (center-wide) templates that individuals can personalize, per-user usage analytics.

**Non-negotiable principles (learned the hard way — do not regress):**

- **No fake AI output, ever.** If the LLM or backend is unavailable, dictation surfaces a
  clear error. Never fabricate a transcript or a structured result with heuristics.
- **The report is 100% template-driven.** There is no hard-coded report skeleton
  (no fixed "Technique"/"Impression" fields, no canonical section order). Sections,
  names, order, kind, and grouped-vs-flat layout all come from template data.
- **The API key never reaches the browser.** All LLM calls proxy through the backend.
- **Everything in the report is editable** — every section heading, every finding,
  every normal sentence, the patient block. A radiologist must never hit read-only text.

---

## 2. Tech Stack

| Layer     | Choice | Notes |
|-----------|--------|-------|
| Frontend  | Next.js (App Router) + React + TypeScript + Tailwind CSS | SPA-style app behind auth; `output: 'standalone'` for Docker |
| Rich text | TipTap for prose blocks; controlled `contentEditable` for findings rows | see §6 |
| State     | Zustand stores (report, ui, auth, usage) | narrow selectors — the left panel must NOT re-render per editor keystroke |
| Backend   | NestJS + Prisma + MySQL 8 | REST, global prefix `/api`, typed DTOs, `class-validator` with `forbidNonWhitelisted` |
| AI        | Google Gemini (`gemini-3.1-flash-lite` or newer flash-class model), key in `backend/.env` as `GEMINI_API_KEY` | 60s timeout, 2 retries, structured-output JSON schema |
| Auth      | JWT access + refresh (revocable), bcrypt cost 12 | roles: ADMIN, RADIOLOGIST |
| Logging   | nestjs-pino JSON logs with request ids + global exception filter | |
| Deploy    | Docker Compose: Caddy (auto-HTTPS, single origin) → web + api, internal-only MySQL, nightly backup sidecar | no Redis — not needed |
| Tests     | Vitest (frontend), Jest (backend) | see §12 |

Dev ports: frontend **5173**, backend **4000**, MySQL on host **127.0.0.1:3307**
(3306 is often taken by a host mysqld — bind dev DB to loopback:3307).

---

## 3. Design Direction (your freedom — within these rails)

You may redesign layout, colors, and micro-workflow. Constraints:

- **Minimal and modern.** Neutral near-white/near-black base, ONE accent color used
  sparingly (primary actions, active states, record indicator). Generous whitespace,
  8px spacing grid, subtle borders over shadows, rounded-lg max. A single clean sans
  (e.g. Inter/Geist). Optional dark mode.
- **The report page is the product.** Two-zone workspace: a slim dictation/control rail
  and a large paper-like report canvas that reads like the final Word document
  (WYSIWYG — what the editor shows is exactly what exports, same bullets, same bold,
  same indents).
- **Calm, not clinical-software-cluttered.** No dense toolbars; tools appear on
  hover/selection where possible. Recording state must be unmistakable (pulsing accent).
- Keyboard-first where cheap: focus report search, start/stop mic, Finish.

---

## 4. Application Map (pages)

All pages behind auth except Login/Change-password.

1. **Login** — email + password; dev-only credential prefill; forced
   change-password screen when `mustChangePassword` is set.
2. **Workspace / Reports** (home) — template selector (search + modality filter),
   patient info block, the report editor, dictation rail, Finish flow.
3. **Templates** — library of global + personal templates; **New template** flow:
   upload `.docx` or paste text → AI analysis → editable review → save.
4. **Patients** — lightweight patient list (name, ID, age/sex, study) used to fill the
   report patient block. Not an EMR; keep it thin.
5. **Analytics** — server-backed usage: reports completed today/total, breakdown by
   action (Copy / Extract / Send), recent activity list. Admins see per-user stats.
6. **Integrations** — placeholder-grade "send report to…" targets (e.g. webhook/email
   endpoint records), scoped per owner.
7. **Settings** — bullet shapes & list presets, dictation mode (verbatim/concise),
   workflow (Instant/Review), account (change password), synced server-side.
8. **Users** (admin only) — team management: create/deactivate users, reset passwords,
   roles.
9. **Help** — short task-oriented topics matching the actual current features.

---

## 5. Data Model (Prisma / MySQL)

```
User            id, email(unique), passwordHash, name, role(ADMIN|RADIOLOGIST),
                active, mustChangePassword, settings(Json), createdAt
Session/Refresh revocable refresh tokens (logout revokes; password change revokes ALL)
Template        id, slug, name, modality, ownerId(nullable → null = GLOBAL),
                sections(Json), createdAt, updatedAt
Patient         id, ownerId, name, mrn, age, sex, study, createdAt
ReportEvent     id, userId, action(COPY|EXTRACT|SEND), reportTitle, createdAt
AiUsage         id, userId, kind(TRANSCRIBE|STRUCTURE|ANALYZE), model, tokens?, createdAt
Integration     id, ownerId, type, config(Json), createdAt
```

**Template.sections JSON shape** (the heart of the app):

```ts
type TemplateSection = {
  id: string;                    // stable, e.g. "ct-chest-findings-1"
  name: string;                  // editable heading
  kind: "prose" | "findings";
  isConclusion?: boolean;        // or detected by name ~ /impression|conclusion|opinion/
  defaultText?: string;          // prose default
  bulletStyle?: ListStyle;       // per-section override of global marker
  findings?: TemplateFinding[];  // for kind:"findings"
};
type TemplateFinding = {
  region: string;                // organ/region, e.g. "Liver"
  normalText: string;           // the normal default sentence
  subpoints?: string[];          // parameters, e.g. Echo measurements
  children?: TemplateFinding[];  // nesting allowed in the BUILDER only (max 2 levels);
};                               // live report flattens children into subpoint lines
```

Grouped-vs-flat is derived: a findings section whose findings carry regions is
"grouped" (organ-labelled rows); region-less findings render flat.

**Template ownership rules:** global templates (ownerId null) are seeded and
admin-editable; when a non-admin edits a global, save the result as a **personal copy**
that overrides the global for that user. Ship **25 seed templates** covering
CT / MRI / US / Echo (with measurement subpoints) / Mammography / DEXA / PET / NM /
Fluoroscopy as `prisma/seed-templates.json`, seeded create-once (non-destructive).

---

## 6. The Report Editor (behavior contract)

- **Sections render in template order.** Prose sections are TipTap blocks; findings
  sections are rows of findings.
- **Grouped finding row** renders as ONE inline editable line:
  `{bullet} **Organ:** finding text` — bullet + bold organ + colon + text are a single
  selectable/deletable run (a radiologist can select the whole finding with the mouse).
  Under the hood, region and text stay separate in the store (parse the line back on
  input) so dictation, revert, and export are unaffected.
- **Multiple findings for one organ:** organ headline line, then each finding as its own
  bullet beneath. **Subpoints/parameters** render slightly indented under the finding
  with their own marker; they persist through dictation (dictation touches items only).
- **Bullets are a system, not a hardcode:** 7 shapes (disc •, circle ◦, square ▪,
  hollow-square ▫, dash –, arrow →, diamond ◆) + checkbox + ordered styles
  (decimal / lower-alpha / upper-roman / lower-roman). Three independent settings:
  organ / finding / subpoint marker, plus curated list-preset hierarchies in a toolbar
  gallery. Per-section `bulletStyle` overrides the global. Small geometric glyphs render
  ~1.3× via transform-scale about center (so the line-box doesn't inflate and the glyph
  stays level with the text). Gap between marker and text: 3 spaces (≈0.75em flex gap in
  editor, `&nbsp;&nbsp;&nbsp;` in export).
- **Insert-bullet tool:** inserts a literal editable glyph at the caret (not a `<ul>`);
  in prose, a paragraph starting with a bullet glyph auto-continues on Enter and
  Tab/Shift-Tab indents and swaps the glyph per level.
- **Box tool:** wrap a block or a whole finding in a bordered box (survives export).
- **Caret dictation:** whenever the caret sits in any report editable, float a small
  mic icon above it; click → record → transcribe (grammar/punctuation only, NOT
  structured) → insert at the saved caret position.
- **Section headings** are bold, near-black, and editable in place.
- **Finding images:** attach images to a finding; export floats them beside it.
- **Export = editor.** One shared formatter produces HTML (for clipboard + `.doc`
  extract) and plain text, mirroring exactly the editor's markers, scales, gaps, bold
  organ labels, hanging indents, boxed content, and a labeled patient block at top.
  Emit section headings as bold `<p>` (NOT `<h1-3>`) so Word shows no collapse chevrons.

---

## 7. Dictation Pipeline (behavior contract)

**Two API calls, always:** `POST /api/ai/transcribe` (audio → clean text) then
`POST /api/ai/structure` (text + section descriptors → structured results), followed by
client-side merge (`insertStructured`). No single-call combined endpoint.

**Workflows (user-facing toggle):**
- **Instant** — mic stop → transcribe → structure → merged into the report automatically.
  A "Type instead" text fallback is available here.
- **Review** — each dictated take APPENDS into an editable review textarea; the user can
  fix wording, then **Apply** runs structure+insert and clears the box. (There is no
  wake-word/ambient/live mode — it was built and deliberately removed. Don't add one.)

**Structuring modes:** `verbatim` (keep the radiologist's wording) and `concise`
(tighten phrasing). No "academic" mode.

**Merge rules (`insertStructured`) — these are the product:**
- Route each structured result to its section; within a grouped findings section, match
  the target finding by region: exact match → containment → shared first word
  (handles multi-word regions like "Heart and Vessels").
- **Abnormal replaces normal:** a dictated abnormal finding REPLACES the region's normal
  default text — in any template, including AI-imported ones.
- **One consolidated paragraph per region:** re-dictating about a region UPDATES that
  finding in place (merges into its paragraph); it never spawns duplicate rows.
- **Subpoint routing:** results can target a specific subpoint id and update it in place.
- **Conclusion folding:** if the template has NO dedicated conclusion/impression section,
  fold each result's impression into its finding's bullet text; otherwise route
  impressions to the conclusion section.

**Token discipline (accuracy-safe):** the structure call sends each section's descriptor,
but current text ONLY for abnormal findings (normal ones are at template default and get
replaced, so omit their text); don't repeat region lists redundantly. Put the static
instructions in `systemInstruction` so the provider's implicit prompt caching applies.

**Prompt conventions:** medical style — Roman numerals where conventional (cranial
nerves "CN VII", Couinaud segments "segment VIII", tumor stage "stage III"); Arabic
numerals for measurements, counts, scores (BI-RADS 4), spinal levels (L4-L5).

**Failure = error, not fallback:** if Gemini fails or no key is configured, throw
(HTTP 503) and show the error in the UI. Transcribe must throw too — never return "".

---

## 8. AI Template Creation

**New template** accepts a `.docx` upload (server-side extraction; 15MB cap + magic-byte
check) or pasted text → `POST /api/templates/analyze` → Gemini (temperature 0, JSON
response schema) returns the section model:

- Detects prose vs findings sections, including optional ones (Comparison,
  Recommendation, Measurements, Contrast, Protocol, Addendum).
- Detects nested findings (`children`, schema capped at 2 levels) and each section's
  bullet/numbering style; preserves placeholders verbatim.
- Frontend safety net: if the model returns a findings section with empty `findings[]`,
  recover them with a local text parse of that section.

**Review step = a Word-like document editor,** not a stack of forms: one continuous
inline-editable document (bold headings, prose, findings) with drag-and-drop reorder of
sections and findings (dnd-kit), children managed with ↑↓/add/remove, and minimal hover
chrome (kind toggle, grouped toggle, bullet-style picker, delete). Saving persists to
the backend so imported templates survive reloads.

---

## 9. Finish Flow & Usage

One accent **Finish** button opens a centered modal with three actions:
- **Copy** — rich HTML to clipboard.
- **Extract** — download `.doc` (HTML-based Word file) named after the report.
- **Send** — dispatch to a configured integration.

Each action records a `ReportEvent` server-side (`POST /usage`), then closes. Analytics
reads `/usage/summary`. Keep a per-user localStorage mirror keyed by email as an offline
view only — and guard against cross-user leaks on account switch (re-hydrate when the
storage key changes).

---

## 10. Backend API Surface

```
POST   /api/auth/login | /refresh | /logout | /change-password
GET    /api/users/me            PATCH /api/users/me/settings
CRUD   /api/users               (admin, manage:users permission)
CRUD   /api/templates           (+ POST /api/templates/analyze)
CRUD   /api/patients
POST   /api/ai/transcribe       POST /api/ai/structure
POST   /api/usage               GET /api/usage /api/usage/summary
CRUD   /api/integrations
GET    /api/health
POST   /api/reports/extract     (docx assembly if done server-side)
```

Security posture: validation pipe (`whitelist` + `forbidNonWhitelisted`), login
throttling, AI endpoints throttled 30/min, scoped body limits (50MB only on /api/ai and
extract; small default elsewhere), password policy ≥10 chars with letter+digit,
changing password revokes all sessions and reissues tokens, Swagger disabled in prod,
integrations and patients scoped by ownerId, AiUsage rows tagged with userId.
Seed one admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env (unset password ⇒
`mustChangePassword=true`).

---

## 11. Deployment (`deploy/`)

- `docker-compose.prod.yml`: **Caddy** terminates TLS (auto-HTTPS via domain env) and
  serves ONE origin — `/` → web (Next standalone image, `Dockerfile.web`), `/api` → api.
  MySQL on the internal network only (no published port). **Backup sidecar**: nightly
  `mysqldump`, 14-day retention. No Redis.
- API image: multi-stage Node build; **install `openssl` in every stage** (Prisma engine
  requirement); container boot runs `prisma migrate deploy && node dist/prisma/seed.js`
  (compile the seed — don't exclude it from tsconfig.build; keep prisma CLI as a prod
  dependency). Use **migrations**, never `db push`, from day one.
- `.env.production.example` documenting: `DOMAIN`, `DATABASE_URL`
  (**host must be the compose service name `mysql`, not `localhost`** — a `localhost`
  URL inside the api container was a real production outage), `JWT_SECRET`s,
  `GEMINI_API_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
- `release.sh` (build, migrate, restart) + a runbook `README.md`: first deploy, backup
  restore, rotating the Gemini key, adding a user.
- Frontend must tolerate transient backend blips: keep the cached session and per-user
  template cache; do NOT ship an offline demo login.

---

## 12. Build Plan (phases — each ends compiling, typechecked, and demoable)

1. **Foundation** — repos/monorepo layout (`radscribe/` web, `backend/` api, `deploy/`),
   Prisma schema + 0_init migration, auth (login/refresh/logout/change-password, roles,
   throttle), health endpoint, pino logging, app shell + login UI, dev compose
   (MySQL on 127.0.0.1:3307).
2. **Templates** — backend CRUD + global/personal override rules + 25 seeds; frontend
   template hydration with per-user cache; template selector; templates page.
3. **Report editor** — template-driven sections, grouped/flat findings rows, subpoints,
   bullet system + presets, editable headings/patient block, insert-bullet + box tools,
   shared export formatter (Copy/Extract parity with editor).
4. **Dictation** — audio capture, `/ai/transcribe` + `/ai/structure` with Gemini
   (structured output, retries, timeout, throttle, no fallback), `insertStructured`
   merge contract (§7), Instant/Review workflows, caret dictation, verbatim/concise.
5. **Template AI creation** — `/templates/analyze` + docx extraction guards + the
   Word-like review editor with drag-drop; persisted imports.
6. **Accounts & analytics** — users admin CRUD + team UI, server-side settings sync,
   usage events + Analytics page, integrations + Send, patients page, Finish modal,
   Help content.
7. **Hardening & deploy** — validation/limits/audit pass, tests (frontend: the
   `insertStructured` contract, bullet rendering, template text parsing; backend:
   permissions, Gemini retry/refusal paths, "no fake fallback" guarantees),
   `npm audit` clean, prod compose + Caddy + backups + runbook, release script,
   smoke-test the full loop on the deployed stack.

**Definition of done:** a fresh machine with Docker + a domain + a Gemini key can run
`deploy/release.sh` and get: HTTPS login → pick CT Chest → dictate "there is a 6 mm
nodule in the right upper lobe" → the Lungs finding's normal text is replaced by the
structured abnormal finding → Finish → Extract produces a Word file identical to the
editor — while a second (radiologist) account sees its own templates, settings, and
usage, and the admin sees team management and per-user analytics.
