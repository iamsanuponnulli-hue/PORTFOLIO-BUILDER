# Portfolio Builder — Implementation Plan

A Flutter Web app that turns a user's details, resume, and design inspiration into a
working portfolio website, then lets them refine it in a built-in code editor with a
live preview and AI prompt-based editing.

---

## 1. Product scope

### Stage 1 — Intake (gather everything needed to generate a site)
1. **User details** — name, headline, bio, location, contact, social links, photo.
2. **Resume upload** — PDF/DOCX. Parsed by AI into structured data (experience,
   education, skills, projects, certifications). The user reviews and corrects the
   extracted fields before generating.
3. **Requirements** — purpose (job hunting, freelance, academic, creative), target role,
   sections wanted, tone (minimal, bold, playful, corporate), colour/font preferences,
   light/dark mode, single page vs multi-page, any free-text instructions.
4. **Design inspiration** — up to 3 reference URLs (websites/portfolios), optional
   uploaded screenshots, or preset style cards. The backend captures each reference and
   extracts a *design brief* (palette, typography, layout patterns, spacing, mood).
   It is used as inspiration only — no copying of text, images, or assets.
5. **Review & generate** — summary screen, then one click to generate.

### Stage 2 — Refine (editor workspace)
1. **Code editor** — multi-file (index.html, styles.css, script.js, …) with syntax
   highlighting, file tree, and save.
2. **Live preview** — sandboxed iframe that updates as code changes; desktop / tablet /
   mobile widths.
3. **Prompt editing** — "Make the hero section darker and add a testimonials section."
   The AI edits only the files it needs to, and shows a diff the user can accept or reject.
4. **Regenerate** — whole site (optionally with changed requirements/inspiration) or a
   single section.
5. **Version history** — every AI edit and manual save is a version; restore any version.
6. **Export / publish** — download ZIP first; one-click hosting later.

---

## 2. Architecture

```
┌──────────────────────────── Flutter Web (client) ─────────────────────────────┐
│  Intake wizard  │  Editor workspace (Monaco + preview iframe + AI chat panel)  │
│  Riverpod state · go_router · Firebase Auth/Firestore/Storage SDKs             │
└───────────────┬───────────────────────────────────────────────────────────────┘
                │ HTTPS (Firebase ID token) + SSE for streaming progress
┌───────────────▼─────────────── Backend API (Cloud Run, TypeScript) ───────────┐
│  /resume/parse     → Claude (PDF input + structured output)                    │
│  /inspiration/analyze → Playwright capture → Claude vision → DesignBrief JSON  │
│  /sites/generate   → Claude + file tools → writes files (streams progress)     │
│  /sites/edit       → Claude + file tools on existing files → diff              │
│  /sites/export     → ZIP                                                       │
└───────────────┬───────────────────────────────────────────────────────────────┘
                │
   Firebase Auth · Firestore (metadata) · Cloud Storage (resumes, files, versions,
   screenshots) · Anthropic API (key held only on the server)
```

### Why these choices
| Decision | Choice | Reason |
|---|---|---|
| Frontend | Flutter Web | As requested; one codebase can later ship mobile/desktop. |
| Backend | Node/TypeScript on Cloud Run | Needs a headless browser (Playwright) for reference sites, long-running streamed AI calls, and must keep the API key secret. Cloud Functions are too limiting for Playwright. |
| Auth/DB/files | Firebase (Auth, Firestore, Storage) | Fast to build, first-class Flutter support, security rules. |
| AI | Claude API (`claude-opus-5-5`) via the official `@anthropic-ai/sdk` | Native PDF and image input, structured outputs, tool use for file edits, streaming. |
| Generated site format | Plain HTML/CSS/JS (no build step) | Previews instantly in an iframe, easy to edit by hand, trivially exportable/hostable. A React/Tailwind export can come later. |
| Code editor | Monaco Editor embedded via `HtmlElementView` | Best-in-class web editing (multi-file, HTML/CSS/JS language services, diff view). Pure-Flutter fallback: `re_editor` or `flutter_code_editor`. |
| Preview | `<iframe sandbox="allow-scripts" srcdoc=…>` | Isolates user/AI code from the app (no same-origin access). |

---

## 3. Data model (Firestore + Storage)

```
users/{uid}
  displayName, email, plan, createdAt

projects/{projectId}
  ownerId, name, status: draft|generating|ready|error
  profile:       { name, headline, bio, contact, socials[], photoUrl }
  resume:        { storagePath, parsedAt, parsed: ResumeData }
  requirements:  { purpose, targetRole, sections[], tone, colors, fonts,
                   darkMode, layout: single|multi, notes }
  inspiration:   [{ url | screenshotPath, brief: DesignBrief, capturedAt }]
  currentVersionId, createdAt, updatedAt

projects/{projectId}/versions/{versionId}
  createdAt, source: generate|ai_edit|manual|regenerate_section
  prompt (if AI), summary, parentVersionId
  manifestPath   → Storage: projects/{id}/versions/{vid}/manifest.json
                   (map of path → content hash; file bodies stored by hash)

projects/{projectId}/chat/{messageId}
  role, text, versionId, createdAt
```

Site files live in Cloud Storage (Firestore has a 1 MB document limit). Content-
addressed storage (files keyed by hash) keeps versions cheap.

Core shared types (Dart models via `freezed` + `json_serializable`; mirrored in TS with
`zod`):

```ts
ResumeData   { summary, experience[{company, role, start, end, bullets[]}],
               education[], skills[{category, items[]}], projects[{name,
               description, tech[], link}], certifications[], awards[] }
DesignBrief  { palette{primary, secondary, accent, background, text},
               typography{headingFont, bodyFont, scale}, layoutPatterns[],
               sectionStyles[], spacing, mood[], notableDetails[] }
SiteFiles    { [path: string]: string }
```

---

## 4. Backend API

All endpoints require a Firebase ID token; long operations stream progress via
Server-Sent Events.

| Endpoint | Input | Output |
|---|---|---|
| `POST /projects/:id/resume/parse` | Storage path of the uploaded resume | `ResumeData` |
| `POST /projects/:id/inspiration/analyze` | `{url}` or `{screenshotPath}` | `DesignBrief` + screenshot path |
| `POST /projects/:id/generate` (SSE) | optional overrides | progress events → new `versionId` |
| `POST /projects/:id/edit` (SSE) | `{prompt, baseVersionId, selection?}` | progress + diff → new `versionId` |
| `POST /projects/:id/regenerate-section` (SSE) | `{sectionId, prompt?}` | new `versionId` |
| `POST /projects/:id/versions` | `{files, baseVersionId}` (manual save) | `versionId` |
| `GET  /projects/:id/export?version=` | — | ZIP |

### AI pipelines (Claude API)

**Resume parsing**
- Send the PDF as a `document` content block (DOCX → convert to text first with
  `mammoth`).
- Use structured outputs (`output_config.format` with the `ResumeData` JSON schema) so
  the response always matches the schema.
- Low effort is enough; this is extraction.

**Inspiration analysis**
- Playwright loads the URL (desktop 1440px + mobile 390px), takes full-page screenshots,
  and extracts computed styles (fonts, CSS custom properties, dominant colours).
- Send the screenshots (image blocks) + extracted style data to Claude and ask for a
  `DesignBrief` via structured outputs.
- Guard against SSRF: allow only http/https, resolve DNS and block private/loopback
  IP ranges, set timeouts and page-size limits.

**Site generation**
- System prompt (static, cached): role, output rules (semantic HTML, responsive,
  accessible, no external assets except Google Fonts, every section tagged with
  `data-section="…"`, don't copy reference content), file conventions.
- User message: profile + `ResumeData` + requirements + `DesignBrief`s.
- Give Claude file tools — `write_file(path, content)`, `edit_file(path, old, new)`,
  `delete_file(path)` — with `strict: true`, run with the SDK tool runner, and stream so
  the UI can show "Writing styles.css…".
- Adaptive thinking, `effort: "high"` for first generation.

**Prompt editing / regenerate section**
- Same system prompt + current files (cached prefix) + the user's request (+ selected
  element/section if the user clicked one in the preview).
- Claude uses `edit_file` for targeted changes instead of rewriting everything →
  faster, cheaper, and a clean diff.
- Server applies the edits to a copy, validates (HTML parses, referenced files exist),
  stores a new version, and returns a diff. The user accepts (becomes current) or
  rejects.
- Keep recent chat turns so follow-ups like "make it a bit lighter" work.

**Cost & reliability**
- Prompt caching on the system prompt and current file set.
- Handle `stop_reason` (`max_tokens`, `refusal`) and retry/report clearly.
- Per-user rate limits and a daily generation quota.

---

## 5. Flutter app structure

```
lib/
  main.dart
  app/            router.dart (go_router), theme.dart
  core/           api_client.dart (dio + SSE), auth/, env.dart, errors.dart
  models/         profile.dart, resume_data.dart, requirements.dart,
                  design_brief.dart, project.dart, site_version.dart
  data/           project_repository.dart, storage_repository.dart
  features/
    auth/         sign_in_page.dart
    dashboard/    projects_page.dart (list, create, open)
    intake/
      intake_wizard_page.dart     (Stepper / PageView, progress saved per step)
      steps/ details_step.dart, resume_step.dart, resume_review_step.dart,
             requirements_step.dart, inspiration_step.dart, review_step.dart
      intake_controller.dart      (Riverpod Notifier, autosaves draft)
    editor/
      editor_page.dart            (3-pane responsive layout)
      widgets/ file_tree.dart, monaco_editor.dart, preview_frame.dart,
               device_toggle.dart, ai_chat_panel.dart, diff_dialog.dart,
               version_history_drawer.dart
      editor_controller.dart      (open files, dirty state, current version)
    export/       export_dialog.dart
web/
  index.html
  monaco/         monaco loader + bridge.js (postMessage ↔ Dart)
```

Key packages: `flutter_riverpod`, `go_router`, `firebase_core`, `firebase_auth`,
`cloud_firestore`, `firebase_storage`, `file_picker`, `dio`, `freezed`,
`json_serializable`, `web` (for `HtmlElementView`/iframe interop), `flutter_markdown`.

### Editor workspace details
- **Layout**: file tree | Monaco | preview, with the AI chat panel as a right drawer.
  Collapses to tabs on narrow screens.
- **Monaco bridge**: Monaco runs in a `HtmlElementView` div; Dart ↔ JS via
  `dart:js_interop` (`setValue`, `onChange`, `setLanguage`, `showDiff`).
- **Preview**: build a single `srcdoc` by inlining `styles.css`/`script.js` into
  `index.html` (or use blob URLs for multi-page). Debounce refresh ~400 ms.
- **Click-to-select**: inject a small script into the preview that, in "select mode",
  highlights hovered elements and posts the nearest `data-section` + a CSS path to the
  parent window. That selection is attached to the next AI prompt.
- **Unsaved changes**: manual edits are local until "Save" (creates a version).
  An AI edit on top of unsaved changes saves them first.

---

## 6. Security & privacy
- Anthropic API key only on the backend (Secret Manager); never in the Flutter bundle.
- Firestore/Storage rules: users can only read/write their own projects.
- Resume uploads: PDF/DOCX only, ≤10 MB, stored privately; let users delete them.
- Preview iframe: `sandbox="allow-scripts"` without `allow-same-origin`.
- SSRF protection on the URL capture service; capture runs in its own Cloud Run service
  with no access to internal resources.
- Tell users that reference sites are used for style only, and instruct the model not
  to reproduce third-party text, logos, or images.

---

## 7. Phased roadmap

| Phase | Deliverable | Est. |
|---|---|---|
| **0. Setup** | Flutter web project, Firebase project, Cloud Run backend skeleton, CI (lint, test, deploy preview), auth + dashboard | 1 wk |
| **1. Intake** | Wizard (details, requirements, inspiration URL input), draft autosave, resume upload → parse → review screen | 2 wk |
| **2. Inspiration analysis** | Playwright capture service, DesignBrief extraction, brief preview cards in the wizard | 1 wk |
| **3. Generation** | Generate endpoint with file tools + SSE progress, versions in Storage, basic read-only preview | 1.5 wk |
| **4. Editor** | Monaco integration, file tree, live preview, device widths, manual save → version, ZIP export | 2 wk |
| **5. AI editing** | Chat panel, prompt edits with diff accept/reject, regenerate whole site / section, click-to-select | 2 wk |
| **6. Polish** | Version history UI, error states, quotas/rate limits, accessibility checks on output, analytics | 1 wk |
| **7. Later** | One-click publish (Firebase Hosting/Netlify/GitHub Pages), custom domains, templates gallery, React/Tailwind export, collaboration | — |

**MVP = Phases 0–5.**

---

## 8. Testing
- **Flutter**: unit tests for models/controllers; widget tests for wizard steps and
  editor panes; integration test for wizard → generate → edit flow (with a mocked API).
- **Backend**: unit tests for file-tool application, diffing, SSRF guard, ZIP export;
  contract tests that model outputs match the zod schemas.
- **AI quality**: a small eval set (≈20 sample resumes + reference sites) checked for:
  valid HTML, responsive at 3 widths (Playwright screenshots), all resume sections
  present, Lighthouse accessibility score ≥ 90, and edits that change only what was asked.

---

## 9. Open decisions
1. **Hosting/publishing** — is one-click publishing needed for MVP, or is ZIP export enough?
2. **Output stack** — plain HTML/CSS/JS (recommended for MVP) vs React/Tailwind.
3. **Accounts & billing** — free tier limits, paid plans?
4. **Backend language** — TypeScript recommended (Playwright + Anthropic SDK are both
   first-class); Python (FastAPI) is a fine alternative if the team prefers it.
