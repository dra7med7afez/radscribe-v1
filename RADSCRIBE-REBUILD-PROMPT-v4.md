# RadScribe — Full Production Rebuild Prompt (v4)

> **How to use this document:** hand it to an AI coding agent or a dev team as the single
> source of truth. It describes WHAT to build (features, behavior contracts, API surface,
> data model, deployment) and leaves HOW it looks open — you have freedom over visual
> design, colors, and workflow ergonomics, as long as the result stays **minimal and
> modern**. Everything else is a requirement, not a suggestion.
>
> v4 supersedes v3. New since v3: self-service signup with Individual/Organization
> account types, Google Sign-In, push-to-talk dictation (keyboard + foot pedal),
> report-level undo/redo, Settings as a modal + profile menu, radiologist signature
> block, the Word-style Bullets split button, box-tool line hoisting, Word-safe image
> export tables, a redesigned Templates library, backend-persisted patients, and an
> optimized audio encode pipeline.

---

## 1. Product

**RadScribe** is an AI-powered voice-dictation reporting workstation for radiology.
A radiologist opens a report template (CT Chest, Echo, Mammogram…), dictates findings
into a microphone, and the app transcribes the speech, structures it with an LLM, and
merges it into the correct organ/region of a fully editable report. The finished report
is copied, exported to Word, or sent onward in seconds.

**Target customers — both must be first-class, and both self-serve:**

1. **Individual radiologists** — create their own account from the login screen
   (email+password or Google), personal templates, personal settings, personal usage
   stats. Zero-admin experience.
2. **Radiology centers / organizations** — sign up as an ORGANIZATION account (clinic,
   hospital, imaging center — captures the organization name); an admin manages a team
   of radiologist accounts, global (center-wide) templates that individuals can
   personalize, per-user usage analytics.

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
| State     | Zustand stores (report, ui, auth, usage, patients) | narrow selectors — the left panel must NOT re-render per editor keystroke |
| Backend   | NestJS + Prisma + MySQL 8 | REST, global prefix `/api`, typed DTOs, `class-validator` with `forbidNonWhitelisted` |
| AI        | Google Gemini (`gemini-3.1-flash-lite` or newer flash-class model), key in `backend/.env` as `GEMINI_API_KEY` | 60s timeout, 2 retries, structured-output JSON schema |
| Auth      | JWT access + refresh (revocable), bcrypt cost 12; **plus Google Identity Services** (GIS button, ID-token verify server-side) | roles: ADMIN, RADIOLOGIST; self-signup always lands RADIOLOGIST |
| Logging   | nestjs-pino JSON logs with request ids + global exception filter | |
| Deploy    | Docker Compose: Caddy (auto-HTTPS, single origin) → web + api, internal-only MySQL, nightly backup sidecar | no Redis — not needed |
| Tests     | Vitest (frontend, incl. `report-format` formatter tests), Jest (backend) | see §12 |

Dev ports: frontend **5173**, backend **4000**, MySQL on host **127.0.0.1:3307**
(3306 is often taken by a host mysqld — bind dev DB to loopback:3307).
`CORS_ORIGIN` accepts a **comma-separated list** of origins (e.g. an extra preview port).

---

## 3. Design Direction (your freedom — within these rails)

You may redesign layout, colors, and micro-workflow. Constraints:

- **Minimal and modern.** Light mode: warm near-white beige canvas with white floating
  cards; dark mode: near-black with gray panels and a **distinct dark-mode accent**
  (e.g. blue in light, green in dark). ONE accent per theme, used sparingly (primary
  actions, active states). Recording state is **red** with a gentle pulse. Generous
  whitespace, 8px grid, subtle borders/shadows, rounded-xl max, one clean sans.
- **The report page is the product.** Two-zone workspace: a slim dictation/control rail
  and a large paper-like report canvas that reads like the final Word document
  (WYSIWYG — what the editor shows is exactly what exports, same bullets, same bold,
  same indents).
- **Calm, flat, not clinical-software-cluttered.** No gradients/glows/ripples — the hero
  mic is a single flat 64px circle (audio-lines glyph, soft accent halo ring at rest;
  red + stop square while listening; spinner while processing). Segmented controls are
  minimal text-only pills. Tools appear on hover/selection where possible.
- Keyboard-first where cheap: focus report search, start/stop mic, Finish — and
  **hold-to-talk** (§7).

---

## 4. Application Map (pages)

All pages behind auth except Login/Signup/Change-password.

1. **Login / Signup** — one card with a **Sign in / Create account** toggle.
   - Sign-in: email + password; dev-only credential prefill; forced change-password
     screen when `mustChangePassword` is set.
   - Sign-up: account-type picker (two selectable cards: **Individual radiologist** —
     "Personal reporting workspace" — and **Organization** — "Clinic, hospital or
     imaging center"), organization name field (only for org accounts), contact/full
     name, email, password with the policy hinted inline (client mirrors the backend
     policy regex for instant feedback).
   - **Google button** (GIS `renderButton`, `signin_with`/`signup_with` per mode) below
     an "or" divider — rendered only when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set. The
     signup selections (account type, org name) ride along on a first-time Google login.
2. **Workspace / Reports** (home) — template selector (search + modality filter),
   patient info block, the report editor, dictation rail, Finish flow.
3. **Templates** — a library page with a static header (title + New template button)
   over a scrolling card grid:
   - Toolbar: result count, **search**, **modality filter**, **body-part filter**,
     **sort** (Newest / Oldest / Name).
   - **Favorites**: star toggle per card (localStorage), favorites always float to the
     top of any sort.
   - Cards: colored **modality icon badge** (stable color per modality — CT blue, MRI
     purple, US green… hash fallback for unknown ones, icon matched to modality),
     **Starter** (global) vs **Custom** badge, name + body part, stats line
     (`N Sections · N Findings · N Impressions`), footer with "Updated … · author"
     ("RadScribe Team" for globals, the user's name for personal), a **Loaded** chip on
     the active template, an accent **Load** button, and a **⋯ overflow menu**
     (Edit / Duplicate / Delete — delete only for owned or admin).
   - **New template** flow: upload `.docx` or paste text → AI analysis → editable
     review → save (§8).
4. **Patients** — lightweight patient list (name, ID, age/sex, study) used to fill the
   report patient block. Manually added patients **persist through the backend** (real
   ids from the server); the integration worklist merges in front of them; localStorage
   is only an offline cache/fallback with optimistic temp-id adds. Not an EMR.
5. **Analytics** — server-backed usage: reports completed today/total, breakdown by
   action (Copy / Extract / Send), recent activity list. Admins see per-user stats.
6. **Integrations** — placeholder-grade "send report to…" targets (e.g. webhook/email
   endpoint records), scoped per owner.
7. **Settings — a MODAL (window), not a page.** Opened from the profile menu; the
   `/settings` route redirects home and opens the modal (deep-link friendly). Category
   nav: **Formatting** (font family/size, line spacing, separators, italic default),
   **Bullets** (organ / finding / parameter markers), **Signature** (§9), **Dictation**
   (default structuring mode + **push-to-talk trigger bindings** with a press-to-capture
   key recorder — "press your foot pedal or clicker while binding"), **Appearance**
   (theme), **Account** (name/email, link to manage account/password/team).
   Report settings sync server-side; PTT bindings are device-local.
8. **Users** (admin only) — team management: create/deactivate users, reset passwords,
   roles.
9. **Help** — short task-oriented topics matching the actual current features.

**Sidebar:** compact icon rail (expandable). Top nav: Reports, Patients, Templates,
Integrations, Analytics. Bottom: Help, then a **profile dropdown** (avatar initial +
name/role when expanded) that merges Profile, **Settings** (opens the modal), theme
toggle, and **Logout** into one menu. No separate Settings/Account/theme rows.

---

## 5. Data Model (Prisma / MySQL)

```
User            id, email(unique), passwordHash(NULLABLE — null = Google-only account),
                googleId(unique, nullable), name,
                accountType(INDIVIDUAL|ORGANIZATION, default INDIVIDUAL),
                organizationName(nullable), role(ADMIN|RADIOLOGIST),
                active, mustChangePassword, settings(Json), createdAt
Session/Refresh revocable refresh tokens (logout revokes; password change revokes ALL)
Template        id, slug, name, modality, ownerId(nullable → null = GLOBAL),
                sections(Json), createdAt, updatedAt
Patient         id, ownerId, name, mrn, age, sex, study, source(LOCAL|INTEGRATION), createdAt
ReportEvent     id, userId, action(COPY|EXTRACT|SEND), reportTitle, createdAt
AiUsage         id, userId, kind(TRANSCRIBE|STRUCTURE|ANALYZE), model, tokens?, createdAt
Integration     id, ownerId, type, config(Json), createdAt
```

Schema changes ship as **migrations** (never `db push`) — the signup/Google fields are
their own migration on top of the init migration.

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
- **Add finding:** every findings section ends with a small accent **"+ Add finding"**
  button that appends a blank row. A brand-new empty row renders as just the bullet
  (no dangling colon); typing `Organ: text` parses back into region + text. Manually
  added rows (no template normal to revert to) get a hover **delete** control.
  Subpoints/parameters come only from the template or dictation — no manual
  "add parameter" button.
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
- **Bullets tool = a Word-style SPLIT BUTTON** (distinct from the list-preset gallery):
  the main button **toggles** literal bullet glyphs on the paragraph(s) touched by the
  selection (add when any line lacks one, remove when all have one) using the most
  recently picked glyph (remembered in localStorage); the attached chevron opens the
  **bullet library** and applies the chosen glyph to those lines (add or swap), editing
  all lines in ONE transaction. Glyphs stay literal characters — selectable, copyable,
  movable — never a `<ul>`. In prose, a bullet line auto-continues on Enter and
  Tab/Shift-Tab indents and swaps the glyph per level. In a native finding editable
  (which already carries its structural marker) the library inserts the glyph at the
  caret; toggle is prose-only. The **List style** gallery (bullet hierarchies
  organ → finding → parameter) is a separate toolbar button with its own icon.
- **Box tool:** wrap a block or a whole finding in a bordered box (survives export).
  The box is stored INSIDE the item's text html (`<div class="text-box">…</div>`), but
  a fully-boxed text is **hoisted so the border visually wraps the entire finding line**
  (bullet + organ + text), like Word's paragraph border — in both the editor and the
  export (shared `text-box` helpers: `unwrapTextBox`/`wrapTextBox`). When resolving the
  editable host for boxing, walk to the element that CARRIES the `contenteditable`
  attribute — children of an editable also report `isContentEditable`, and boxing one
  of those wraps just the bullet.
- **Undo/redo covers EVERYTHING, Word-style:** prose (TipTap) keeps its own history;
  all other report mutations — finding text edits, add/delete finding, box, dictation
  inserts, reorder, revert, images, scores — go through a **report-store snapshot
  history** (`past`/`future`, ~100 entries, per-key coalescing within ~800ms so
  keystroke bursts undo as one step). The toolbar Undo/Redo routes to TipTap when a
  prose block is active, else pops the store history (blurring the active finding so it
  re-renders), else falls back to `document.execCommand`. Undo restores
  findings/structure but keeps CURRENT prose text (TipTap owns it) and re-derives
  conclusions. Loading or resetting a template clears the history.
- **Caret dictation:** whenever the caret sits in any report editable, float a small
  mic icon above it; click → record → transcribe (grammar/punctuation only, NOT
  structured) → insert at the saved caret position.
- **Section headings** are bold, near-black, and editable in place.
- **Finding images:** attach images to a finding; export renders them **beside** it.
- **Export = editor.** One shared formatter produces HTML (for clipboard + `.doc`
  extract) and plain text, mirroring exactly the editor's markers, scales, gaps, bold
  organ labels, hanging indents, boxed content, and a labeled patient block at top.
  Emit section headings as bold `<p>` (NOT `<h1-3>`) so Word shows no collapse
  chevrons. Finding images export as a **two-column table** (text left, ~170px image
  column right, bordered) — **Word ignores CSS floats on divs; a table is the only
  side-by-side layout it honors**. End the report with the **signature block** (§9).
  Cover the formatter with unit tests.

---

## 7. Dictation Pipeline (behavior contract)

**Two API calls, always:** `POST /api/ai/transcribe` (audio → clean text) then
`POST /api/ai/structure` (text + section descriptors → structured results), followed by
client-side merge (`insertStructured`). No single-call combined endpoint.

**Triggers — tap AND hold:**
- The on-screen hero mic is **tap-to-toggle** (tap to start, tap to stop).
- **Push-to-talk (hold-to-dictate)** via a `usePushToTalk` hook on configurable
  `KeyboardEvent.key` bindings (default: `Control`). A **foot pedal / USB clicker that
  emulates a keyboard key is indistinguishable from the keyboard** and works through the
  same path. keydown starts, keyup stops. Robustness requirements:
  - ignore key auto-repeat (one start per hold);
  - a MODIFIER binding (Ctrl/Shift/Alt/Meta) is a shared key: skip it while focus is in
    an editable field, and **cancel the take if another key is pressed mid-hold** (that
    was a shortcut chord like Ctrl+S, not speech);
  - a dedicated binding (a pedal's function key) always fires, even while typing, and is
    `preventDefault`ed so it doesn't also type/scroll;
  - window blur / tab hide / unmount releases the hold so the mic can never stick open;
  - listeners register once and read bindings/enabled through getters (transient store
    reads) so the panel never re-renders per keystroke; disabled while the Settings
    modal is open (its key-capture would trip the mic).
- **Race guard:** starting is async (mic permission). Keep a monotonic session token,
  bumped on every stop/cancel/reset; if `getUserMedia` resolves after its session was
  superseded (a fast key tap), discard that recording. Start is allowed from idle AND
  from "done" (previous result still on screen); only listening/processing block.
- Bindings are managed in Settings → Dictation with a press-to-capture recorder and
  removable key chips; stored **device-local** (localStorage), not synced — the pedal
  belongs to the machine.

**Audio encode (client):** decode the captured blob inside a **16 kHz mono
`OfflineAudioContext`** — the browser resamples natively during decode (~3× less memory
than decoding at 44.1/48 kHz, no per-sample JS resample loop, no audio-device handle to
leak). Mono input is used as-is; multi-channel downmix hoists the 1/N multiply out of
the inner loop. Base64-encode via the native `FileReader` data-URL path (never build the
string in JS chunks — that blocks the main thread for seconds on long takes). Result:
16 kHz mono 16-bit WAV, small enough that long dictations never 413.

**Workflows (user-facing toggle):**
- **Instant** — mic stop → transcribe → structure → merged into the report automatically.
  A "Type instead" text fallback is available here.
- **Review** — each dictated take APPENDS into an editable review textarea; the user can
  fix wording, then **Apply** runs structure+insert and clears the box. (There is no
  wake-word/ambient/live mode, and no voice-commands panel — both were built and
  deliberately removed. Don't add them.)

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
- Each dictation insert records ONE undo snapshot (§6) so it reverses as a unit.

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

## 9. Finish Flow, Signature & Usage

One accent **Finish** button opens a centered modal with three actions:
- **Copy** — rich HTML to clipboard.
- **Extract** — download `.doc` (HTML-based Word file) named after the report.
- **Send** — dispatch to a configured integration.

**Signature:** Settings holds a multi-line radiologist sign-off (e.g.
"Dr. A. Hafez, MD\nConsultant Radiologist"). When set, it renders **bold at the end of
the exported report** — one line per row, spaced off the body — in both the HTML and
plain-text outputs. Empty = no signature. Synced server-side with the other report
settings.

Each action records a `ReportEvent` server-side (`POST /usage`), then closes. Analytics
reads `/usage/summary`. Keep a per-user localStorage mirror keyed by email as an offline
view only — and guard against cross-user leaks on account switch (re-hydrate when the
storage key changes).

---

## 10. Backend API Surface

```
POST   /api/auth/login | /register | /google | /refresh | /logout | /change-password
GET    /api/users/me            PATCH /api/users/me/settings
CRUD   /api/users               (admin, manage:users permission)
CRUD   /api/templates           (+ POST /api/templates/analyze)
CRUD   /api/patients            (manual patients persist; ?source=integration = worklist)
POST   /api/ai/transcribe       POST /api/ai/structure
POST   /api/usage               GET /api/usage /api/usage/summary
CRUD   /api/integrations
GET    /api/health
POST   /api/reports/extract     (docx assembly if done server-side)
```

**Signup (`POST /auth/register`):** email (lowercased), password (policy-validated),
name, `accountType` (`INDIVIDUAL`|`ORGANIZATION`), `organizationName` (required for
ORGANIZATION via conditional validation, rejected/nulled otherwise). Throttled ~5/min.
409 on existing email. Always assigns the RADIOLOGIST role — **ADMIN stays
operator-granted only.** Returns tokens + user (auto-login), audited.

**Google Sign-In (`POST /auth/google`):** accepts the GIS ID token (`idToken`), plus
optional `accountType`/`organizationName` used ONLY when this Google identity signs in
for the first time. Server-side verification against Google's tokeninfo endpoint with a
10s timeout, checking `aud` === configured `GOOGLE_CLIENT_ID`, `iss` is
accounts.google.com, and `email_verified`. Behavior:
- known `googleId` → login;
- same email already registered with a password → **link** the Google identity to it;
- otherwise create the account with `passwordHash: null` (Google-only).
Password login for a Google-only account fails with a clear "use the Google button"
message; change-password is likewise guarded. Empty `GOOGLE_CLIENT_ID` disables the
whole feature (400 with "not configured"; frontend hides the button). Throttled ~10/min.
tokeninfo unreachable → 503, never a silent pass. The public user payload includes
`accountType` and `organizationName`.

Security posture: validation pipe (`whitelist` + `forbidNonWhitelisted`), login/signup
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
- Web image: `NEXT_PUBLIC_API_URL=/api` (same origin, no CORS in prod) and
  **`NEXT_PUBLIC_GOOGLE_CLIENT_ID` as a build ARG** (baked at build; empty hides the
  Google button), both wired through compose build args.
- `.env.production.example` documenting: `DOMAIN`, `DATABASE_URL`
  (**host must be the compose service name `mysql`, not `localhost`** — a `localhost`
  URL inside the api container was a real production outage), `JWT_SECRET`s,
  `GEMINI_API_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and the Google pair
  `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — **the same OAuth Web client id
  in both** (API verifies, web renders; add `https://DOMAIN` to the client's authorized
  JavaScript origins; empty disables Google sign-in cleanly).
- `release.sh` (build, migrate, restart) + a runbook `README.md`: first deploy, backup
  restore, rotating the Gemini key, adding a user, configuring Google sign-in.
- Frontend must tolerate transient backend blips: keep the cached session, per-user
  template cache, and offline patient cache; do NOT ship an offline demo login.

---

## 12. Build Plan (phases — each ends compiling, typechecked, and demoable)

1. **Foundation** — repos/monorepo layout (`radscribe/` web, `backend/` api, `deploy/`),
   Prisma schema + 0_init migration, auth (login/refresh/logout/change-password, roles,
   throttle), health endpoint, pino logging, app shell + login UI, dev compose
   (MySQL on 127.0.0.1:3307).
2. **Templates** — backend CRUD + global/personal override rules + 25 seeds; frontend
   template hydration with per-user cache; template selector; the Templates library
   page (search/filters/sort/favorites/cards §4.3).
3. **Report editor** — template-driven sections, grouped/flat findings rows + add/delete
   finding, subpoints, bullet system + presets + the Bullets split button, editable
   headings/patient block, box tool with line hoisting, report-level undo/redo,
   shared export formatter (Copy/Extract parity, image tables, signature) + its tests.
4. **Dictation** — audio capture + the 16 kHz offline-decode encode path,
   `/ai/transcribe` + `/ai/structure` with Gemini (structured output, retries, timeout,
   throttle, no fallback), `insertStructured` merge contract (§7), Instant/Review
   workflows, tap-to-toggle mic + push-to-talk hook with its race guards, caret
   dictation, verbatim/concise.
5. **Template AI creation** — `/templates/analyze` + docx extraction guards + the
   Word-like review editor with drag-drop; persisted imports.
6. **Accounts & analytics** — signup (account types) + Google Sign-In (backend verify +
   GIS button + account linking), users admin CRUD + team UI, profile menu + Settings
   modal with server-side settings sync + PTT bindings UI + signature, usage events +
   Analytics page, integrations + Send, backend-persisted patients page, Finish modal,
   Help content.
7. **Hardening & deploy** — validation/limits/audit pass, tests (frontend: the
   `insertStructured` contract, bullet rendering, template text parsing, report-format
   export; backend: permissions, signup/Google auth paths incl. linking and the
   Google-only password guards, Gemini retry/refusal paths, "no fake fallback"
   guarantees), `npm audit` clean, prod compose + Caddy + backups + runbook + Google
   client-id wiring, release script, smoke-test the full loop on the deployed stack.

**Definition of done:** a fresh machine with Docker + a domain + a Gemini key can run
`deploy/release.sh` and get: HTTPS → a radiologist **creates their own account** (or
signs in with Google) → picks CT Chest → **holds Ctrl (or a foot pedal)** and dictates
"there is a 6 mm nodule in the right upper lobe" → releases → the Lungs finding's normal
text is replaced by the structured abnormal finding → hits Undo and the insert reverses
as one step, Redo brings it back → Finish → Extract produces a Word file identical to
the editor, signed off with their bold signature — while a second account sees its own
templates, settings, patients and usage, and the admin sees team management and
per-user analytics.
