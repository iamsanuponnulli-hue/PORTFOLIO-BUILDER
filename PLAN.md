# Portfolio Builder — Product & Implementation Plan

> Architecture, UI wireframes and control flows: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

> **Confirmed decisions**
> - Output: **plain HTML + CSS + JavaScript**, delivered as a **ZIP** (no hosting yet)
> - Backend: **TypeScript** (Node, Cloud Run)
> - AI: **model-agnostic** — works with any LLM provider (Anthropic, OpenAI, Google,
>   OpenAI-compatible endpoints such as OpenRouter / Ollama), with graceful
>   degradation when a model lacks a capability
> - Frontend: **Flutter Web**
> - **Sign-in required** (Firebase Auth: Google, GitHub, email + verification)
> - **Bring your own API key + model picker**, plus a small free starter allowance (§4.5)
> - **Contact forms link to an external form service** the user already uses (§3.8)
> - **Full MVP scope** (Phases 0–6, ~13.5 weeks for one developer)
> - **4 profile types at launch**: Developer, Designer, Student/New grad, General professional
> - **No payments in MVP** — free Starter allowance + bring your own key
> - **English app UI**; site content in any left-to-right language

---

## 1. Why use this instead of just asking Claude (or any chatbot)?

This is the question the whole product is built around. A general chatbot *can*
write a portfolio page, but the experience breaks down quickly:

| Pain with a general chatbot | What this app does instead |
|---|---|
| You have to know what to ask for and write long prompts. | A guided, portfolio-specific intake asks the right questions. Upload a resume + paste a link → a site in ~1 minute. |
| Your content is buried inside HTML. Every regeneration risks dropping or rewording details. | **Content lives as structured data** (profile, experience, projects…) separate from design. Change the design 10 times; your content never gets lost or altered. |
| Every change needs another prompt and another full rewrite. | **Hands-on editing**: click text to edit it, drag sections to reorder, swap a section's layout from a gallery, tweak colours/fonts in a theme panel — all instant, no AI round-trip. Prompts are for what controls can't do. |
| Output quality varies: inconsistent spacing, broken mobile layout, poor contrast, no SEO. | A **tested section library + design-token theme system** guarantees responsive, accessible, consistent output. A **portfolio score** checks accessibility, SEO, performance, and content, with one-click fixes. |
| Images, favicon, social preview image, resume PDF — you wire them up yourself. | **Asset pipeline**: upload once; images are resized/compressed, favicon and Open Graph image generated, everything bundled with correct paths in the ZIP. |
| "Make it look like this site" needs you to describe it. | Paste a URL; the app **captures the site and extracts its palette, fonts, and layout patterns** into a design brief you can mix and match ("colours from A, layout from B"). |
| AI rewrites your achievements and may invent facts. | The content assistant **improves wording but never invents facts** — it asks you for numbers and leaves visible placeholders instead of guessing. |
| No history, no undo, no diff; copy-pasting code between chat and files. | Projects persist, every change is a version, AI edits show a diff you accept or reject, and there's a real code editor with live preview. |
| Locked into one AI vendor. | Choose the model/provider; bring your own key. |
| Website builders (Wix, Squarespace, Framer) lock you into their platform. | You **own the code**: clean, readable HTML/CSS/JS in a ZIP that runs anywhere (GitHub Pages, Netlify, any host). |

**Positioning:** *"The fastest way to a professional, personal portfolio site that you
fully own — tailored by AI, refined by hand, exported as clean code."*

**Success metrics**
- Time from sign-up to first generated site: **< 2 minutes**
- ≥ **80 %** of edits done through visual controls (no prompt needed)
- Every exported site scores **≥ 90** on accessibility/SEO checks out of the box

---

## 2. Core idea: structured content + design spec + deterministic renderer

The key architectural decision that makes the app better than free-form AI generation:

```
 Portfolio Content (JSON)   +   Site Spec (JSON)   ──►  Renderer (TypeScript)  ──►  HTML/CSS/JS files
   who you are, what you did      how it looks           deterministic, tested       preview + ZIP
                                                          ▲
                              custom code layer ──────────┘  (hand-written or AI-written
                                                             sections / CSS / JS, preserved)
```

- **Portfolio Content** — the facts: profile, experience, projects, skills, links,
  images. Edited via forms, imported from resume/GitHub, polished by the content
  assistant.
- **Site Spec** — the design: theme tokens (colours, fonts, radius, spacing, motion),
  which sections appear and in what order, which layout *variant* each section uses,
  per-section options, and SEO settings.
- **Renderer** — a pure TypeScript function `render(content, spec, custom) → files`.
  Same input always gives the same output. Used in the browser (instant preview) and on
  the server (export).
- **Custom code layer** — `custom.css`, `custom.js`, and any section the user (or AI)
  has hand-coded. Always preserved across re-renders.

Why this matters:
- **Reliability across all models** — the AI mostly produces small, validated JSON
  (pick a variant, set tokens, add a section) rather than thousands of lines of HTML.
  Even small/cheap models do this well; big models are only needed for custom code.
- **Instant, free edits** — theme and layout changes are re-renders, not AI calls.
- **Content safety** — redesigning never touches your facts.
- **Consistent quality** — every section variant is responsive, accessible, and tested once.

---

## 3. Features (portfolio-specific)

### 3.1 Intake (fast path first)
1. **Choose your profile type** — MVP ships 4, each with its own default sections,
   section variants, tone, and import suggestions:
   | Type | Default sections | Emphasis |
   |---|---|---|
   | Developer | hero, about, projects, experience, skills, writing, contact | GitHub import, tech stack, terminal-style hero option |
   | Designer | hero, selected work (gallery/case studies), about, experience, testimonials, contact | Large visuals, case-study pages |
   | Student / New grad | hero, about, education, projects, skills, experience/internships, awards, contact | Education first, coursework & clubs |
   | General professional | hero, about, experience, highlights/skills, testimonials, contact | Achievements, clear CTA to contact |
   Product/PM, Data/ML, Writer, Photographer/Artist, Academic, Freelancer come after
   launch (§3.10); the section library already covers most of what they need.
2. **Import** (each optional):
   - Resume upload (PDF/DOCX) → structured content.
   - LinkedIn: guide the user to download their LinkedIn profile as PDF, parsed like a resume.
   - GitHub username → pinned/top repos, languages, stars, README summaries → project cards.
   - Blog RSS / Medium / dev.to feed → writing section.
3. **Review content** — editable forms pre-filled from imports, with a
   *missing-content checklist* ("Add a photo", "Projects have no images",
   "No contact method").
4. **Goals & requirements** — purpose (job search / freelance clients / academic /
   personal brand), target role, tone (minimal, bold, playful, elegant, technical),
   colour/font preferences, light/dark/auto, free-text notes.
5. **Inspiration** — up to 3 URLs or screenshots, or pick from a curated style gallery.
   Shows extracted palette, fonts, and layout traits as chips; the user toggles what
   to borrow from each.
6. **Generate** — produces **3 design directions** as thumbnails; the user picks one
   (or regenerates). Only design varies; content is shared.

### 3.2 Section library (each with 2–5 layout variants)
| Section | Example variants |
|---|---|
| Hero | split-with-photo, centered, big-typography, terminal (dev), full-bleed image |
| About | text + photo, highlights list, stats row |
| Experience | timeline, cards, compact list |
| Projects | card grid, featured + grid, list, masonry gallery; optional **case-study pages** (`projects/<slug>.html`) |
| Skills | tag cloud, grouped columns, icon/logo grid |
| Education / Certifications / Awards | list, cards |
| Publications | citation list with links (academic) |
| Writing | post list from RSS/import |
| Testimonials | quotes grid, carousel |
| Services (freelance) | cards with optional pricing |
| Gallery | grid, masonry, with lightbox |
| Talks / Open source / Volunteering | list, cards |
| Contact | simple links, mailto CTA, form posting to the user's form service (§3.8) |
| Navigation & Footer | sticky, minimal, sidebar |

Shared JS behaviours (included only when used): mobile nav, active-link highlighting,
light/dark toggle, scroll reveal (respects `prefers-reduced-motion`), project tag filter,
lightbox, copy-email button, typed-text hero.

### 3.3 Theme system (design tokens → CSS custom properties)
Colours (background, surface, text, muted, primary, accent, border — light and dark
sets), heading/body/mono fonts (curated Google Fonts pairs), type scale, border
radius, spacing density, shadow style, motion level, content width, section divider
style. Contrast is checked live as you change colours.

### 3.4 Editor workspace
- **Visual mode** (default)
  - Live preview with desktop / tablet / mobile widths.
  - Click any text in the preview to edit it inline (writes back to Portfolio Content).
  - Sections panel: add, remove, drag to reorder, hide, switch variant from a thumbnail gallery.
  - Theme panel: colours, fonts, spacing, radius, motion, with presets.
  - Content panel: forms for every content type; image upload/crop.
- **Code mode**
  - Monaco editor (the VS Code editor) with file tree, syntax highlighting, HTML/CSS/JS
    language support, live preview.
  - Generated sections are delimited by markers (`<!-- pb:section id="projects" -->`).
    Editing inside a section's code turns it into a **custom section** (confirmation
    shown; reversible). `custom.css` / `custom.js` are always freely editable.
- **AI assistant panel** — see §4.3.
- **Versions** — every save/AI edit is a version; restore or compare (diff view).

### 3.5 Content assistant
- Rewrite bullets for impact (action verb + outcome), tuned to the target role.
- **Never invents facts**: when a number would help it asks, or inserts a highlighted
  placeholder like `[X%]` that blocks export until filled or removed.
- Headline/tagline suggestions (3 options).
- Project **case-study interview**: asks problem → your role → process → outcome, then
  writes the case study.
- Tone consistency pass across the whole site.
- Spelling and grammar check.

### 3.6 Portfolio score & auto-fix
Checks run on every render (cheap ones in-browser, full ones on export via Playwright + axe-core):
- **Accessibility**: colour contrast, alt text, heading order, link names, focus styles.
- **SEO**: title, meta description, Open Graph/Twitter tags, `Person` JSON-LD,
  sitemap.xml, robots.txt, canonical URL.
- **Performance**: image sizes/formats, unused JS, total page weight.
- **Responsive**: screenshots at 3 widths, horizontal overflow detection.
- **Content**: missing contact, empty sections, placeholders left, broken links.
Each finding has a one-click fix where possible (generate alt text, compress image,
write meta description).

### 3.7 Assets & export
- Images converted to WebP + fallback, resized to needed widths (`srcset`), EXIF stripped.
- Avatar cropper; favicon from photo or initials; auto-generated Open Graph image.
- Resume PDF included as a download button (optional).
- **ZIP** contents:
  ```
  index.html
  projects/<slug>.html          (if case studies enabled)
  assets/css/theme.css base.css sections.css custom.css
  assets/js/main.js custom.js
  assets/img/…  favicon.ico  og-image.png
  resume.pdf  robots.txt  sitemap.xml
  README.md                     (how to deploy to GitHub Pages / Netlify / any host)
  ```
- Fonts are **self-hosted inside the ZIP** (WOFF2), not loaded from Google's servers —
  faster and avoids EU privacy issues. Icons are inline SVG from an open-licensed set
  (e.g. Lucide).
- All paths are relative, so the site also works by opening `index.html` locally.
- Exported sites target the last 2 versions of Chrome, Edge, Firefox and Safari
  (desktop + mobile); no frameworks, no build step, no tracking.

### 3.8 Contact form via external form service
Static sites can't send email themselves, so the contact section links to a form
service the user signs up for (all have free plans):

| Service | User provides | Rendered as |
|---|---|---|
| Formspree | form ID (`f/abc123`) | `<form action="https://formspree.io/f/abc123" method="POST">` |
| Web3Forms | access key | form posting to `api.web3forms.com/submit` with hidden key |
| Getform / Basin / FormSubmit | endpoint URL | `<form action="<endpoint>">` |
| Google Forms / Tally / Typeform | share link | "Contact me" button/link (or embed) |
| None | — | `mailto:` button + copy-email |

- Setup panel with a short how-to per service and a field that validates the ID/URL format.
- Generated form: name, email, message (fields configurable), honeypot field for spam,
  client-side validation, accessible labels, success/error messages via `fetch` with a
  plain-POST fallback when JS is off.
- In the editor preview, submissions are intercepted ("In your live site this sends to
  Formspree") so testing doesn't spam the user.
- Portfolio score flags a form with no endpoint configured.

### 3.9 Projects & everyday basics
- Dashboard: create, rename, duplicate, delete projects; thumbnail of each site.
  Limit **5 projects per user** in MVP.
- **Autosave** of content/spec edits (debounced); explicit "Save version" for named checkpoints.
- Same project open in two tabs: version check on save, "newer changes exist — reload?"
  (last write never silently overwrites).
- Re-importing a resume later **merges**: new items are proposed, never overwrite edited ones.
- Undo/redo inside the editor session; version restore across sessions.
- Onboarding: short first-run tour of the editor; empty states that explain each panel.
- Resume parse failure (e.g. a scanned image-only PDF): retry with a vision-capable model
  if available, otherwise fall back to manual entry with a clear message.

### 3.10 Later (post-MVP)
- **Job-tailored variants**: paste a job description → a variant of the site that
  reorders projects and highlights matching skills, sharing the same content.
- One-click hosting/publishing and custom domains.
- Analytics snippet setup, contact form hosting.
- Template marketplace, team/agency mode.
- More profile types (Product/PM, Data/ML, Writer, Photographer/Artist, Academic with
  ORCID import, Freelancer with services/pricing).
- Paid plans (Stripe): bigger AI allowance, more projects.
- Translated app UI and right-to-left site support.

---

## 4. AI design (model-agnostic)

### 4.1 LLM gateway
All AI calls go through one backend interface; no feature talks to a provider directly.

```ts
interface LlmGateway {
  generate<T>(req: {
    task: TaskName;                 // e.g. "resume.parse", "design.directions"
    system: string;
    messages: Message[];            // text, image, and document parts
    schema?: ZodSchema<T>;          // structured output
    tools?: ToolDef[];              // for edit operations
    stream?: boolean;
  }): Promise<Result<T>> | AsyncIterable<Event>;
}
```

- **Implementation**: Vercel AI SDK (`ai` + `@ai-sdk/anthropic`, `@ai-sdk/openai`,
  `@ai-sdk/google`, `@ai-sdk/openai-compatible`) wrapped behind our own interface so it
  can be swapped for official SDKs per provider if needed.
- **Model registry** (config, not code): each model's id, provider, context window, and
  capability flags — `pdfInput`, `imageInput`, `structuredOutput`, `toolUse`,
  `streaming`, `promptCaching`.
- **Task routing**: each task has a tier (`fast` or `smart`); the user/admin maps tiers
  to models. Defaults: `smart` = a top-tier model (e.g. Claude Opus), `fast` = a small,
  cheap model (e.g. Claude Haiku). Any provider can fill either tier.
- **Bring your own key + model picker**: see §4.5.

### 4.2 Capability fallbacks (so every model works)
| Capability missing | Fallback |
|---|---|
| PDF input | Extract text server-side (`pdfjs-dist`; `mammoth` for DOCX), send as text. |
| Image input (vision) | Inspiration brief built from extracted computed styles/DOM only; screenshots skipped. |
| Native structured output | JSON instructions in prompt → parse → validate with zod → one "repair" retry with the validation errors → fail clearly. |
| Tool calling | Model returns a JSON `operations[]` array (same schema as tools), validated the same way. |
| Streaming | Show step-level progress instead of token streaming. |
| Small context window | Send only the relevant section's code/content (we always know which section is affected). |
| Prompt caching | Optional optimisation only; nothing depends on it. |

Prompts are written in plain, provider-neutral language (no vendor-specific tags or
features). A **cross-model eval suite** (§7) runs every prompt against each supported
model before release.

### 4.3 AI tasks
| Task | Tier | Input | Output |
|---|---|---|---|
| `resume.parse` | fast | PDF/DOCX (or text) | `PortfolioContent` (partial) |
| `github.summarize` | fast | repo metadata + README | project cards |
| `inspiration.analyze` | smart | screenshots + computed styles | `DesignBrief` |
| `design.directions` | smart | content summary + goals + briefs | 3 × `SiteSpec` |
| `content.rewrite` / `content.caseStudy` / `content.tagline` | fast/smart | content item + goals | suggestions (user accepts) |
| `assistant.edit` | smart | user prompt + spec + selection + relevant code | `operations[]` |
| `section.custom` | smart | prompt + theme tokens + content | custom section HTML/CSS/JS |
| `fix.altText`, `fix.metaDescription` | fast | image / content | text |

### 4.4 The assistant: prompts become operations
A user prompt ("make it warmer and add testimonials under projects") is turned into a
list of typed operations, each validated before being applied:

```
updateTheme(tokens) · setVariant(sectionId, variant) · addSection(type, variant, position)
removeSection(id) · moveSection(id, position) · updateContent(path, value)
setSectionOptions(id, options) · editCustomCode(file, find, replace) · createCustomSection(...)
```

- Most requests map to spec/content operations (cheap, safe, instant re-render).
- Only requests that the library can't express fall through to custom code.
- The result is shown as a **change summary + diff**; the user accepts or rejects.
  Accepting creates a version.
- Content operations that would add new facts are flagged for confirmation.
- If the user clicked an element in the preview, its section id is attached to the prompt.

**Regenerate options:** whole design (keeps content), one section (new variant/options),
or a custom section's code.

### 4.5 AI access: free starter, bring your own key, model picker

**Is anything free?** Yes, with limits:
- **This app's own AI use is already small.** Theme, layout, section and inline text
  edits re-render locally with no AI call. Only intake, design generation and assistant
  prompts use a model, and most of those produce small JSON that cheap models handle.
- **Free provider tiers exist** (limits change often — re-check before launch):
  Google Gemini API (free tier, Flash-class models), Groq (free daily limits per model),
  OpenRouter (`:free` model variants, low daily request caps), Cloudflare Workers AI
  (daily free allocation). Caveats: low rate limits, and some free tiers allow the
  provider to use submitted data for training — users must be told this before sending
  their resume through one.
- Anthropic and OpenAI have no free API tier, but small models (e.g. Claude Haiku) are
  cheap enough that a full generation costs a fraction of a cent.

**Access modes** (chosen in Settings → AI):

| Mode | How it works | Best for |
|---|---|---|
| **Starter (default)** | Platform key on a low-cost model; monthly allowance per user (e.g. 3 full generations + 50 assistant edits); counters shown in the UI | Trying the app with zero setup |
| **Bring your own key** | User adds a key for Anthropic, OpenAI, Google Gemini, Groq, OpenRouter, Mistral, or any OpenAI-compatible endpoint (custom base URL); no app limits beyond abuse protection | Regular use, free provider tiers, choosing premium models |

Starter is deliberately not built on a free provider tier: those quotas are per key, so
one shared key would be exhausted by a handful of users. Free tiers are offered through
BYO key instead, where each user gets their own quota. The app includes a step-by-step
"Get a free Gemini / Groq / OpenRouter key" guide.

**Adding a key**
1. Pick provider → paste key (and base URL for OpenAI-compatible).
2. Backend validates it with a cheap call (list models), then stores it encrypted
   (Cloud KMS envelope encryption) in `secrets/{uid}/keys/{keyId}`, a collection the
   client can never read (Firestore rules deny all; backend only).
3. UI shows provider, label, last 4 characters, added date; actions: test, rename,
   replace, delete. Multiple keys allowed (one per provider).

**Selecting a model**
- Model list fetched live from the provider (`/models`) and merged with the app's
  **model registry** (capabilities, context window, eval status).
- Each model shows badges: `Recommended` / `Tested` / `Untested`, and capability icons
  (reads PDFs, sees images, structured output, tools). Free-tier models are labelled.
- **Simple mode**: one model for everything. **Advanced mode**: separate *Smart*
  (design generation, assistant) and *Fast* (parsing, rewrites, alt text) models,
  possibly from different providers.
- Warnings explain fallbacks before they happen ("This model can't see images —
  inspiration will use page styles only").
- Choice can be overridden per project; switching models never affects existing content.

**Runtime behaviour**
- Requests always go through the backend gateway (keys never reach the browser).
- Provider errors are translated into clear messages: invalid key, out of credit,
  rate-limited (with retry-after), model unavailable — with a one-click
  "switch to Starter" or "pick another model".
- Usage dashboard: requests and tokens per provider/model per month (from provider usage
  fields), so BYO users can track their own spend.

---

## 5. Architecture

```
┌───────────────────────────── Flutter Web ─────────────────────────────────────┐
│ Dashboard · Intake wizard · Editor (visual / code / assistant) · Export          │
│ Riverpod · go_router · Firebase SDKs                                            │
│ ┌──────────── JS interop ───────────┐                                           │
│ │ renderer.js (shared TS package)   │ → preview iframe (sandbox="allow-scripts")│
│ │ monaco + bridge.js                │                                           │
│ └───────────────────────────────────┘                                           │
└───────────────┬───────────────────────────────────────────────────────────────┘
                │ HTTPS + Firebase ID token; SSE for streamed progress
┌───────────────▼─────────────── API service (Cloud Run, TypeScript, Fastify) ──┐
│ projects · imports (resume, GitHub, RSS) · ai tasks · assets · export          │
│ LLM gateway → Anthropic / OpenAI / Google / OpenAI-compatible                  │
└───────┬───────────────────────────────┬───────────────────────────────────────┘
        │                               │
┌───────▼──────────────┐   ┌────────────▼────────────────────────────────────────┐
│ Capture service       │   │ Firebase Auth · Firestore (metadata, content, spec)   │
│ (Cloud Run, Playwright│   │ Cloud Storage (uploads, images, versions, ZIPs)       │
│  isolated, SSRF-safe) │   │ Secret Manager / KMS (API keys)                       │
│ inspiration capture,  │   └───────────────────────────────────────────────────────┘
│ quality checks,       │
│ screenshots           │
└───────────────────────┘
```

### Repository layout (monorepo)
```
app/                      Flutter Web app
  lib/
    app/                  router, theme
    core/                 api client (dio + SSE), auth, errors
    models/               generated from JSON Schema (see below)
    features/
      dashboard/
      intake/             wizard steps + controller
      editor/
        visual/           sections panel, theme panel, content forms, inline edit
        code/             monaco widget, file tree
        assistant/        chat panel, change summary, diff dialog
        preview/          iframe widget, device toggle, click-to-select bridge
        versions/
      score/              portfolio score panel
      export/
  web/                    index.html, monaco loader, bridge.js, renderer.js (built)
packages/
  schema/                 zod schemas: PortfolioContent, SiteSpec, DesignBrief,
                          Operation → exported as JSON Schema
  renderer/               render(content, spec, custom) → files; section templates,
                          variants, theme → CSS, behaviours JS; snapshot tests
  checks/                 portfolio score rules (shared by browser + server)
backend/
  api/                    Fastify app, routes, auth middleware
  llm/                    gateway, model registry, prompts, fallbacks
  imports/                resume, github, orcid, rss
  assets/                 sharp image pipeline, favicon, OG image
  export/                 zip builder
capture/                  Playwright capture + quality-check service
evals/                    cross-model eval sets and runner
```

- **Single source of truth for types**: zod schemas in `packages/schema` → JSON Schema →
  Dart models generated with `quicktype` (+ `freezed`-style immutability). CI fails if
  generated code is stale.
- **Renderer runs in the browser** (bundled with esbuild, called from Dart via
  `dart:js_interop`) for instant preview, and on the server for export — identical output.

---

## 6. Data model

```
users/{uid}               displayName, email, authProviders[],
                          ai: { mode: starter|byo, simple: bool,
                                smart: {keyId, provider, model}, fast: {...} },
                          starterUsage: { month, generations, edits }
secrets/{uid}/keys/{kid}  provider, label, last4, baseUrl?, encryptedKey, createdAt
                          (backend-only; client rules deny all)
projects/{pid}            ownerId, name, profileType, goals, status,
                          content: PortfolioContent      (≤ ~200 KB; large text in Storage)
                          spec: SiteSpec
                          custom: { css, js, sections: {id → {html, css, js}} }
                          inspiration: [{source, brief, screenshotPaths}]
                          contactForm: { service, endpoint|id|link, fields[] }
                          aiOverride?: { smart, fast }
                          currentVersionId, score, updatedAt
projects/{pid}/versions/{vid}
                          createdAt, source (manual|assistant|regenerate|import),
                          prompt?, summary, snapshotPath (content+spec+custom JSON in Storage)
projects/{pid}/assets/{aid}
                          originalPath, variants[{width, format, path}], alt, usage
```

Key schemas (abridged):
```ts
PortfolioContent {
  profile: { name, headline, tagline, bio, location, email, photo, socials[] }
  experience[]: { id, company, role, start, end, location, bullets[], tech[] }
  projects[]:   { id, title, summary, role, tech[], links[], images[], tags[],
                  featured, caseStudy?: { problem, role, process, outcome, body } }
  skills[]:     { group, items[] }
  education[], certifications[], awards[], publications[], writing[],
  testimonials[], services[], talks[], custom[]
}
SiteSpec {
  theme: { colors: {light, dark}, fonts, scale, radius, density, shadow, motion,
           width, colorMode: light|dark|auto }
  nav: { variant, items[] }
  sections[]: { id, type, variant, visible, options, custom: boolean }
  pages: { caseStudies: boolean }
  seo: { title, description, url?, ogImage, keywords[] }
}
```

---

## 7. Quality & testing
- **Renderer**: snapshot tests for every section × variant × theme sample; Playwright
  visual tests at 3 widths; axe-core accessibility tests — the library must pass before
  any AI is involved.
- **Schema/operations**: unit tests that every operation validates and applies correctly.
- **Backend**: route tests, SSRF guard tests, import parsers against fixture resumes,
  ZIP structure tests.
- **Flutter**: unit tests for controllers, widget tests for wizard/editor panels,
  integration test for intake → generate → edit → export with a mocked API.
- **Cross-model evals** (`evals/`): ~30 sample resumes, ~15 reference sites, ~50 edit
  prompts. Scored on schema validity, factual fidelity (no invented facts), operation
  correctness, and rendered portfolio score. Run per supported model; a model is only
  listed as supported if it passes.

---

## 8. Authentication, security & privacy
- **Sign-in required** before anything is created: Firebase Auth with Google, GitHub
  (also reused for the GitHub import), and email/password with mandatory email
  verification. Backend verifies the Firebase ID token on every request.
- Account page: change email/password, linked sign-in methods, delete account (removes
  projects, uploads, keys).
- API keys: platform key in Secret Manager; BYO keys KMS-encrypted, server-only, never logged.
- Firestore/Storage rules: owner-only access.
- Uploads: type and size limits (resume ≤ 10 MB, images ≤ 15 MB), virus-scan optional,
  EXIF stripped; users can delete their data and resume at any time.
- Preview iframe sandboxed (`allow-scripts`, no `allow-same-origin`); click-to-select
  uses `postMessage` with origin checks.
- Capture service isolated: http/https only, DNS resolved and private/loopback/metadata
  IPs blocked, timeouts, page-size limits, no cookies.
- Inspiration is for style only; prompts forbid copying third-party text, images, or
  logos, and captured screenshots are never included in exports.
- Per-user rate limits and AI usage quotas; usage logged per task and model.
- **Legal & privacy pages** before launch: privacy policy, terms of use, and an
  AI-processing notice naming which provider receives the user's data (differs for
  Starter vs BYO key; free provider tiers may train on data).
- **Data rights**: export all my data (JSON + assets ZIP), delete account; resumes can
  be deleted after parsing ("keep original file" toggle, default on).
- Prompt-injection hygiene: resume text, READMEs and reference pages are treated as
  data — wrapped and labelled in prompts; outputs are schema-validated operations, so
  injected instructions can't run arbitrary actions.

---

## 9. Operations
- **Environments**: `dev` (emulators), `staging`, `prod` — separate Firebase projects.
- **Hosting of the app itself**: Flutter Web on Firebase Hosting; API and capture
  service on Cloud Run. A small static marketing/landing page (Flutter Web is poor
  for SEO).
- **Monitoring**: Sentry (Flutter + backend), Cloud Logging with structured logs,
  uptime checks, alerts on error rate and AI spend.
- **Cost controls**: daily spend cap on the Starter key, budget alerts in Google Cloud,
  per-user quotas, capture-service concurrency limit.
- **Product analytics**: privacy-friendly events (signup, first site generated, export,
  BYO key added) to measure the success metrics in §1.
- **Admin tools (minimal)**: look up a user, reset Starter quota, disable abusive
  accounts — protected admin route, not a full back office.
- **Backups**: scheduled Firestore export; Storage versioning on project files.

---

## 10. Roadmap

| Phase | Deliverable | Est. |
|---|---|---|
| **0. Foundations** | Monorepo, CI (lint, typecheck, tests), Firebase project, Fastify skeleton, Flutter shell with **required sign-in** (Google, GitHub, email) + dashboard, schema package + Dart codegen | 1 wk |
| **1. Renderer & library** *(no AI)* | Theme system, ~12 section types × 2–3 variants, behaviours JS, case-study pages, renderer tests; a dev page that renders sample content | 2.5 wk |
| **2. Intake & content** | Profile types, wizard, content forms, image upload + asset pipeline, **LLM gateway + model registry + fallbacks**, **Settings → AI (starter allowance, BYO key, model picker)**, resume parsing, GitHub import | 2.5 wk |
| **3. Design generation** | Capture service, inspiration briefs with mix-and-match, curated style gallery, 3 design directions | 1.5 wk |
| **4. Editor workspace** | Preview with device widths, sections/theme/content panels, inline text editing, Monaco code mode with custom sections, contact-form service setup, versions, **ZIP export** | 2.5 wk |
| **5. AI assistant** | Prompt → operations, change summary + diff, click-to-select, regenerate section/design, custom section generation, content assistant (rewrite, tagline, case-study interview) | 2 wk |
| **6. Score & polish** | Portfolio score + auto-fixes, onboarding polish, quotas, error states | 1.5 wk |
| **7. Multi-model hardening** | Cross-model eval runs (incl. free-tier models), prompt tuning per tier, recommended-model labels, usage dashboard | 1 wk |

**MVP = Phases 0–6 (~13.5 weeks for one developer).** Phase 7 can run in parallel once
Phase 5 lands. Later items are listed in §3.10.

**First milestone worth demoing:** end of Phase 2 — upload a resume, get a rendered
portfolio from the library with a default theme, no design AI yet.

---

## 11. Decisions log & remaining questions
**Decided:** ZIP export · plain HTML/CSS/JS · TypeScript backend · Flutter Web ·
model-agnostic AI · BYO key + model picker · free Starter allowance · sign-in required ·
contact forms via external form service · full MVP scope (Phases 0–6) · 4 profile types ·
no payments · English UI with any LTR content language.

**Still open (decide during Phase 2, not blocking):**
1. Starter allowance size and which low-cost model backs it.
2. Which free-tier providers to feature in the "get a free key" guide (verify their
   current limits and data-use terms at that time).

---

## 12. Assumptions (change any of these if they're wrong)
**Product**
- Desktop-first editor (laptop/desktop browsers). On phones the app supports sign-in,
  intake and preview, but not the code editor or drag-and-drop editing.
- One person edits a project at a time (no real-time collaboration).
- Single-page sites by default, plus optional project case-study pages.
- Limits per user: 5 projects; resume ≤ 10 MB; images ≤ 15 MB; 3 inspiration links per project.
- The user owns everything they export; exports carry no "made with" badge or tracking.
- Portfolio content is the user's own; the AI never invents facts.

**Technical**
- Firebase (Auth, Firestore, Storage, Hosting) on Google Cloud, with Cloud Run for the
  API and capture service.
- Vercel AI SDK behind our own gateway interface for multi-provider support.
- Monaco as the code editor inside Flutter Web; the renderer is a shared TypeScript
  package run in both the browser and the server.
- Fonts and icons are bundled into the ZIP; no third-party requests from exported sites
  except the user's chosen form service.
- App supports the last 2 versions of Chrome, Edge, Firefox and Safari.

**Business & team**
- One full-time developer (estimates scale down with more people; Phases 1 and 2 can
  run in parallel with two).
- You pay the Starter AI cost (small; capped daily) and Google Cloud hosting.
- Privacy policy and terms are written before public launch (templates + review).
- Launch region is global; GDPR-style data export/delete is built in from day one.
