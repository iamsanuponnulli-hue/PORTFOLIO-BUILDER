# Portfolio Builder — Architecture, UI & Control Flow

Companion to [`PLAN.md`](../PLAN.md). This document describes **how the pieces fit
together**, **what each screen looks like**, and **how control moves through the app**
for every major user action.

---

## 1. Guiding principles

1. **Everything is an operation.** Every change — typing in a form, inline text edit,
   dragging a section, a theme slider, saving code, an AI prompt — becomes a typed
   `Operation` applied by one reducer. One code path means one undo stack, one
   autosave, one version history, and AI edits that are just "operations proposed by a
   model".
2. **Data in, files out.** `PortfolioContent` + `SiteSpec` + `CustomCode` are the source
   of truth. HTML/CSS/JS files are always *derived* by the renderer, never stored as the
   primary state.
3. **The browser does the instant work, the server does the trusted work.** Rendering,
   preview, theme/layout edits and cheap checks run in the browser. AI calls, API keys,
   imports, URL capture, image processing and export run on the server.
4. **AI output is validated before it touches state.** Models return schema-checked
   JSON; nothing a model says is executed directly.

---

## 2. System architecture

```mermaid
flowchart LR
  subgraph Browser["User's browser"]
    FA["Flutter Web app<br/>(UI, state, routing)"]
    RJ["renderer.js<br/>(shared TS package)"]
    MO["Monaco editor"]
    IF["Preview iframe<br/>(sandboxed)"]
    FA <-- js_interop --> RJ
    FA <-- js_interop --> MO
    FA -- srcdoc / postMessage --> IF
  end

  subgraph GCP["Google Cloud / Firebase"]
    AUTH["Firebase Auth"]
    FS[("Firestore<br/>users, projects,<br/>versions, assets")]
    ST[("Cloud Storage<br/>uploads, images,<br/>snapshots, ZIPs")]
    API["API service<br/>Cloud Run · Fastify · TS"]
    CAP["Capture service<br/>Cloud Run · Playwright"]
    KMS["Secret Manager + KMS"]
  end

  subgraph Ext["External"]
    LLM["LLM providers<br/>Anthropic · OpenAI · Google ·<br/>Groq · OpenRouter · Mistral ·<br/>OpenAI-compatible"]
    GH["GitHub API"]
    RSS["Blog RSS feeds"]
    REF["Reference websites"]
  end

  FA -- sign in --> AUTH
  FA -- realtime reads<br/>(owner-only rules) --> FS
  FA -- direct uploads --> ST
  FA -- "HTTPS + ID token<br/>SSE for progress" --> API
  API --> FS & ST & KMS
  API -- LLM gateway --> LLM
  API --> GH & RSS
  API -- internal call --> CAP
  CAP --> REF
```

### Responsibilities

| Component | Owns | Never does |
|---|---|---|
| **Flutter app** | UI, routing, editor state, operations reducer, undo/redo, autosave scheduling, preview orchestration | Hold API keys, call LLMs, fetch third-party sites |
| **renderer.js** | `render(content, spec, custom) → files`, section templates, theme → CSS, cheap checks (contrast, missing alt, empty sections) | Network calls, side effects |
| **Monaco** | Code editing, syntax highlighting, diff view | Saving — it only reports changes to Dart |
| **Preview iframe** | Displaying the rendered site, click-to-select, intercepting form submits | Accessing the app (no `allow-same-origin`) |
| **API service** | Auth check, quotas, AI tasks, imports, asset processing, versions, export, key management | Long blocking work without streaming progress |
| **Capture service** | Screenshotting reference sites, computed-style extraction, full quality checks (axe, responsive) | Reaching private networks (SSRF guard) |
| **Firestore** | Metadata, content, spec, custom code, version index | Large blobs (those go to Storage) |
| **Cloud Storage** | Resumes, images, version snapshots, screenshots, ZIPs | Public access (signed URLs only) |

---

## 3. Flutter app architecture

```mermaid
flowchart TB
  subgraph P["Presentation (features/*)"]
    PG["Pages & widgets"]
  end
  subgraph S["State (Riverpod Notifiers)"]
    AC["AuthController"]
    DC["DashboardController"]
    IC["IntakeController"]
    EC["EditorController<br/>(operations reducer, undo/redo)"]
    ASC["AssistantController"]
    SC["SettingsController"]
  end
  subgraph R["Repositories"]
    PR["ProjectRepository"]
    AR["AiRepository"]
    IR["ImportRepository"]
    KR["KeysRepository"]
    XR["ExportRepository"]
  end
  subgraph D["Data sources"]
    API["ApiClient (dio + SSE)"]
    FB["Firebase SDKs"]
    JS["JS bridges:<br/>RendererBridge, MonacoBridge,<br/>PreviewBridge"]
  end
  PG -- user intents --> S
  S -- state --> PG
  S --> R
  R --> API & FB
  EC --> JS
```

- **Unidirectional flow**: widgets send *intents* → controllers update immutable state →
  widgets rebuild. Widgets never call repositories directly.
- **Routing (go_router)** with an auth guard:

| Route | Screen |
|---|---|
| `/signin`, `/verify-email` | Sign-in, email verification |
| `/` | Dashboard |
| `/new/:step` | Intake wizard (`type`, `import`, `content`, `goals`, `inspiration`, `review`) |
| `/p/:id/generate` | Generation progress → design directions |
| `/p/:id/edit?mode=visual\|code` | Editor workspace |
| `/settings/ai`, `/settings/account` | Settings |

### Editor state (single source of truth while editing)

```ts
EditorState {
  projectId, baseVersionId
  content: PortfolioContent
  spec: SiteSpec
  custom: CustomCode
  rendered: SiteFiles          // derived — never edited directly
  past: Operation[][]          // undo stack (grouped)
  future: Operation[][]        // redo stack
  dirty: boolean, saving: boolean, lastSavedAt
  selection?: { sectionId, cssPath }
  mode: 'visual' | 'code'
  openFile?: string
  pendingProposal?: Proposal   // AI change awaiting accept/reject
  checks: CheckResult[]        // instant checks from renderer
}
```

### Backend module layout

```mermaid
flowchart LR
  REQ["HTTP request"] --> MW["Middleware<br/>auth · rate limit · quota · zod validation"]
  MW --> RT["Routes"]
  RT --> SV["Services<br/>projects · imports · ai · assets ·<br/>versions · export · keys"]
  SV --> GW["LLM gateway<br/>(model registry, capability<br/>fallbacks, retries)"]
  GW --> AD["Provider adapters<br/>(Vercel AI SDK)"]
  SV --> DB["Firestore / Storage"]
  SV --> CP["Capture client"]
```

---

## 4. UI

### 4.1 Screen map

```mermaid
flowchart LR
  SI["Sign in"] --> DB["Dashboard"]
  DB -- New project --> W1["1 Profile type"] --> W2["2 Import"] --> W3["3 Review content"] --> W4["4 Goals"] --> W5["5 Inspiration"] --> W6["6 Review & generate"]
  W6 --> GEN["Generating…"] --> DIR["Pick a design direction"] --> ED["Editor"]
  DB -- Open project --> ED
  ED --> EXP["Export dialog"]
  ED <--> SET["Settings: AI / Account"]
  DB <--> SET
```

### 4.2 Wireframes

**Dashboard**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◆ Portfolio Builder                          AI: Starter 2/3  ⚙  (avatar) │
├──────────────────────────────────────────────────────────────────────────┤
│ Your portfolios                                         [ + New portfolio ]│
│ ┌────────────┐ ┌────────────┐ ┌────────────┐                              │
│ │ thumbnail  │ │ thumbnail  │ │  + Create  │      3 of 5 projects used     │
│ │ Jane — Dev │ │ Jane — UX  │ │            │                              │
│ │ Edited 2h  │ │ Draft      │ │            │                              │
│ │ ⋯ rename/duplicate/delete │              │                              │
│ └────────────┘ └────────────┘ └────────────┘                              │
└──────────────────────────────────────────────────────────────────────────┘
```

**Intake wizard — step 2, Import**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Back   New portfolio   ● Type ● Import ○ Content ○ Goals ○ Inspo ○ Review│
├──────────────────────────────────────────────────────────────────────────┤
│  Bring in what you already have (all optional)                            │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐       │
│  │  ⬆ Drop resume (PDF/DOCX)     │  │  GitHub username              │       │
│  │  or browse · max 10 MB        │  │  [ janedoe        ] [Import]  │       │
│  │  ✓ resume.pdf — 14 items found│  │  ✓ 6 repos found              │       │
│  └──────────────────────────────┘  └──────────────────────────────┘       │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐       │
│  │  LinkedIn: how to export PDF │  │  Blog RSS URL                 │       │
│  └──────────────────────────────┘  └──────────────────────────────┘       │
│  ⓘ Your resume is sent to: Starter model (provider X). Change in Settings │
│                                              [ Skip ]  [ Continue → ]     │
└──────────────────────────────────────────────────────────────────────────┘
```

**Intake wizard — step 5, Inspiration**
```
┌──────────────────────────────────────────────────────────────────────────┐
│  Show us sites you like (up to 3)                                         │
│  [ https://example-portfolio.com                     ] [Analyze]          │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ [screenshot]  Palette ■■■■■  Fonts: Serif display / Sans body     │    │
│  │               Layout: split hero · card grid · generous spacing   │    │
│  │   Borrow:  [✓ Colours] [✓ Fonts] [ Layout] [✓ Mood]                │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│  …or pick a style:  (Minimal) (Bold) (Editorial) (Playful) (Technical)    │
└──────────────────────────────────────────────────────────────────────────┘
```

**Pick a design direction**
```
┌──────────────────────────────────────────────────────────────────────────┐
│  3 directions for Jane — same content, different design                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                    │
│  │  live mini   │  │  live mini   │  │  live mini   │                    │
│  │  preview     │  │  preview     │  │  preview     │                    │
│  │ "Calm grid"  │  │ "Bold type"  │  │ "Warm split" │                    │
│  │ [Use this]   │  │ [Use this]   │  │ [Use this]   │                    │
│  └──────────────┘  └──────────────┘  └──────────────┘                    │
│                         [ ↻ Generate 3 more ]                             │
└──────────────────────────────────────────────────────────────────────────┘
```

**Editor — visual mode**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Jane — Dev  [Visual|Code]  ↶ ↷  Saved ✓   Score 86 ▾  🕘  [Export ZIP]  │
├────────────────┬───────────────────────────────────────────┬─────────────┤
│ SECTIONS  + Add │  [Desktop|Tablet|Mobile]   ⌖ Select mode  │ ASSISTANT    │
│ ≡ Hero    split │ ┌───────────────────────────────────────┐ │ "Make the    │
│ ≡ About         │ │                                       │ │  hero darker"│
│ ≡ Projects grid │ │      live preview (iframe)            │ │ ─ Proposed: ─│
│ ≡ Experience    │ │   click text to edit inline           │ │ • theme: bg… │
│ ≡ Skills   tags │ │   click section to select             │ │ • hero: var… │
│ ≡ Contact  form │ │                                       │ │ [Accept]     │
│────────────────│ └───────────────────────────────────────┘ │ [Reject]     │
│ THEME | CONTENT│                                           │              │
│ Colours ■■■■   │  Selected: Projects — variant [grid ▾]     │ [ Ask… ]  ➤  │
│ Fonts  [pair ▾]│  options: columns 3 · show tags ✓          │              │
│ Radius ──●──   │                                           │              │
└────────────────┴───────────────────────────────────────────┴─────────────┘
```

**Editor — code mode**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Jane — Dev  [Visual|Code]  ↶ ↷  ● Unsaved   [Save]       [Export ZIP]   │
├──────────────┬───────────────────────────────┬───────────────────────────┤
│ FILES        │ index.html                     │ preview                    │
│ index.html   │ <!-- pb:section id="hero" --> │                           │
│ assets/css/  │ <section class="hero">…       │                           │
│  theme.css 🔒│ ⚠ Editing this section makes  │                           │
│  custom.css  │   it a custom section [Undo]  │                           │
│ assets/js/   │                               │                           │
│  custom.js   │                               │                           │
└──────────────┴───────────────────────────────┴───────────────────────────┘
 🔒 = generated from theme panel (edit there, or edit custom.css)
```

**Settings → AI**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ AI access   (•) Starter — 2 of 3 generations, 31 of 50 edits left (Oct)   │
│             ( ) My own keys                                               │
│ Keys        Anthropic  ••••7Hk2  [Test] [Replace] [Delete]                │
│             [+ Add key]   Free key guides: Gemini · Groq · OpenRouter     │
│ Model       Simple: one model [ claude-… ▾ ]  ✓Recommended 📄 👁 { }       │
│             ( ) Advanced: Smart [ … ▾ ]  Fast [ … ▾ ]                     │
│ ⓘ This model can't read images — inspiration will use page styles only.  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Control flows

### 5.1 Sign-in and route guard
```mermaid
sequenceDiagram
  actor U as User
  participant App as Flutter app
  participant Auth as Firebase Auth
  participant API
  U->>App: open any route
  App->>Auth: currentUser?
  alt not signed in
    App-->>U: redirect /signin (remember target)
    U->>Auth: Google / GitHub / email
    Auth-->>App: user (+ emailVerified)
    opt email not verified
      App-->>U: /verify-email (resend link)
    end
  end
  App->>API: GET /me (ID token)
  API-->>App: profile, AI mode, quotas (creates user doc on first call)
  App-->>U: target route (default Dashboard)
```

### 5.2 Resume import
```mermaid
sequenceDiagram
  actor U as User
  participant App
  participant ST as Storage
  participant API
  participant GW as LLM gateway
  U->>App: drop resume.pdf
  App->>App: check type & size (≤10 MB)
  App->>ST: upload to users/{uid}/projects/{pid}/resume.pdf
  App->>API: POST /projects/{pid}/imports/resume
  API->>API: quota check (Starter) / load BYO key
  alt model reads PDFs
    API->>GW: resume.parse (PDF document)
  else no PDF support
    API->>API: extract text (pdfjs / mammoth)
    API->>GW: resume.parse (text)
  end
  GW-->>API: JSON
  API->>API: zod validate → repair retry once if invalid
  alt valid
    API-->>App: PortfolioContent (partial) + warnings
    App-->>U: Review content step, imported fields highlighted
  else unreadable (e.g. scanned image, no vision model)
    API-->>App: error: unreadable
    App-->>U: "Couldn't read this file" → manual entry / try a vision model
  end
```

### 5.3 Inspiration analysis
```mermaid
sequenceDiagram
  actor U as User
  participant App
  participant API
  participant CAP as Capture service
  participant GW as LLM gateway
  U->>App: paste URL → Analyze
  App->>API: POST /projects/{pid}/inspiration {url}
  API->>CAP: capture(url)
  CAP->>CAP: SSRF guard (scheme, DNS → block private IPs)
  CAP->>CAP: load page · screenshots 1440 & 390 · computed styles
  CAP-->>API: screenshots + styles (fonts, colours, spacing)
  alt model sees images
    API->>GW: inspiration.analyze (screenshots + styles)
  else
    API->>GW: inspiration.analyze (styles only)
  end
  GW-->>API: DesignBrief (validated)
  API-->>App: brief + screenshot URL
  App-->>U: palette/fonts/layout chips with "Borrow" toggles
```

### 5.4 Generate → pick a direction
```mermaid
sequenceDiagram
  actor U as User
  participant App
  participant API
  participant GW as LLM gateway
  participant R as renderer.js
  U->>App: Generate
  App->>API: POST /projects/{pid}/generate (SSE)
  API->>GW: design.directions (content summary, goals, briefs, profile type,<br/>section catalogue)
  GW-->>API: 3 × SiteSpec
  API->>API: validate each spec (known sections/variants, token ranges, contrast)
  API-->>App: event: directions [spec1, spec2, spec3]
  loop each direction
    App->>R: render(content, spec)
    R-->>App: files → mini preview iframe
  end
  U->>App: Use this
  App->>API: POST /versions {spec, source: generate}
  API-->>App: versionId
  App-->>U: open Editor
```
Content is never sent back by the model — only specs — so facts can't change during design.

### 5.5 Visual editing loop (no AI)
```mermaid
sequenceDiagram
  actor U as User
  participant W as Widget / Preview
  participant EC as EditorController
  participant R as renderer.js
  participant FS as Firestore
  U->>W: change (drag section, slider, inline text, form field)
  W->>EC: intent → Operation (e.g. moveSection, updateTheme, updateContent)
  EC->>EC: validate op · apply · push to undo stack · dirty = true
  EC->>R: render(content, spec, custom)
  R-->>EC: files + instant checks
  EC->>W: update preview (debounced ~150 ms) & score
  Note over EC,FS: autosave 2 s after last change
  EC->>FS: write content/spec/custom with baseVersion check
  alt conflict (changed in another tab)
    EC-->>U: "Newer changes exist — reload or keep mine?"
  end
```
Inline text editing: the preview script makes text elements with `data-pb-path="projects[2].title"`
editable; on blur it posts `{path, value}` to the app, which becomes an `updateContent` operation.

### 5.6 Code editing
```mermaid
sequenceDiagram
  actor U as User
  participant MO as Monaco
  participant EC as EditorController
  participant R as renderer.js
  U->>MO: edit index.html / custom.css
  MO->>EC: onChange (debounced) → live preview from edited text
  U->>EC: Save
  alt custom.css / custom.js
    EC->>EC: op editCustomCode(file, content)
  else index.html
    EC->>EC: split by pb:section markers, diff each region vs render
    EC->>EC: changed region → op convertToCustom(sectionId, html)
    EC->>EC: missing/broken markers → block save with error at line
  else theme.css (generated)
    EC->>EC: parse :root variables → op updateTheme(tokens)
  end
  EC->>R: re-render → preview, checks
  EC-->>U: Saved ✓ (+ notice when a section became custom, with Undo)
```

### 5.7 AI assistant edit
```mermaid
sequenceDiagram
  actor U as User
  participant App as AssistantController
  participant API
  participant GW as LLM gateway
  participant EC as EditorController
  U->>App: "Add testimonials under projects and make it warmer"
  App->>API: POST /projects/{pid}/assist (prompt, spec, selection,<br/>relevant content/code, recent chat) — SSE
  API->>API: quota / key check
  API->>GW: assistant.edit (tools or JSON operations, per model capability)
  GW-->>API: operations[]
  API->>API: validate each op · flag ops adding new facts
  API-->>App: Proposal {summary, operations, flags}
  App->>EC: preview proposal (apply on a copy)
  EC-->>U: preview shows result + change list (+ code diff if custom code)
  alt Accept
    U->>EC: accept → apply ops as one undo group → save version (source: assistant)
  else Reject / refine
    U->>App: reject (discard copy) or follow-up prompt
  end
```

### 5.8 AI request routing (every AI call)
```mermaid
flowchart TD
  A["AI task requested"] --> B{"User AI mode"}
  B -- Starter --> C{"Allowance left?"}
  C -- no --> C1["Error: allowance used → offer BYO key"]
  C -- yes --> D["Platform key + Starter model"]
  B -- BYO --> E["Decrypt user key (KMS)<br/>pick Smart/Fast model for task"]
  D & E --> F{"Model capabilities<br/>vs task needs"}
  F -- missing --> G["Apply fallback<br/>(text extraction, JSON mode, no vision…)"]
  F -- ok --> H["Call provider"]
  G --> H
  H --> I{"Result"}
  I -- ok --> J["Validate with zod"]
  J -- invalid --> K["Repair retry once"] --> J2{"Valid?"}
  J2 -- no --> L["Clear error to user"]
  J -- valid --> M["Return + log usage (tokens, model)"]
  J2 -- yes --> M
  I -- 401/403 --> N["'Key invalid' → Settings"]
  I -- 429 --> O["'Rate limited, retry in Ns'"]
  I -- 402/credit --> P["'Out of credit' → switch model / Starter"]
```

### 5.9 Add key & choose model
```mermaid
sequenceDiagram
  actor U as User
  participant App
  participant API
  participant P as Provider
  participant KMS
  U->>App: Add key (provider, key, base URL?)
  App->>API: POST /keys
  API->>P: list models (validation call)
  alt valid
    API->>KMS: encrypt key
    API->>API: store secrets/{uid}/keys/{kid} (last4 only readable via API)
    API-->>App: key saved + available models ∩ registry (badges)
    U->>App: pick model(s) → PUT /me/ai
  else invalid
    API-->>App: "Key rejected by provider: …"
  end
```

### 5.10 Export ZIP
```mermaid
sequenceDiagram
  actor U as User
  participant App
  participant API
  participant CAP as Capture service
  participant ST as Storage
  U->>App: Export ZIP
  App->>App: block if placeholders like [X%] remain
  App->>API: POST /projects/{pid}/export {versionId}
  API->>API: render (same renderer package) · bundle fonts, icons, images (srcset), favicon, OG image, resume.pdf, sitemap, robots, README
  API->>CAP: full checks (axe, 3 widths, links)
  CAP-->>API: score report
  API->>ST: write zip → signed URL (1 h)
  API-->>App: url + score
  App-->>U: download starts · score summary with fixes
```

### 5.11 Project lifecycle
```mermaid
stateDiagram-v2
  [*] --> Draft: New portfolio
  Draft --> Draft: wizard steps (autosaved)
  Draft --> Generating: Generate
  Generating --> Choosing: directions ready
  Generating --> Draft: error (retry / change model)
  Choosing --> Editing: Use this
  Choosing --> Generating: Generate more
  Editing --> Editing: operations · versions
  Editing --> Generating: Regenerate design (content kept)
  Editing --> Exported: Export ZIP
  Exported --> Editing: keep editing
```

---

## 6. Key interfaces

```ts
// packages/schema
type Operation =
  | { op: 'updateContent'; path: string; value: unknown }
  | { op: 'addItem' | 'removeItem'; path: string; item?: unknown; id?: string }
  | { op: 'updateTheme'; tokens: Partial<ThemeTokens> }
  | { op: 'addSection'; type: SectionType; variant: string; index: number }
  | { op: 'removeSection' | 'toggleSection'; id: string }
  | { op: 'moveSection'; id: string; index: number }
  | { op: 'setVariant'; id: string; variant: string }
  | { op: 'setSectionOptions'; id: string; options: Record<string, unknown> }
  | { op: 'convertToCustom'; id: string; html: string; css?: string; js?: string }
  | { op: 'revertToManaged'; id: string }
  | { op: 'editCustomCode'; file: 'custom.css' | 'custom.js'; content: string }
  | { op: 'setSeo' | 'setContactForm'; value: unknown };

function apply(state: SiteState, op: Operation): SiteState;   // pure, shared
function render(state: SiteState): { files: SiteFiles; checks: CheckResult[] };
```

The same `apply` and `render` run in the browser (instant editing) and on the server
(validating AI proposals and exporting), so what you see is exactly what you download.

### API surface (v1)
| Method & path | Purpose |
|---|---|
| `GET /me` · `PUT /me/ai` | Profile, AI mode, quotas · change AI settings |
| `POST /keys` · `DELETE /keys/:id` · `POST /keys/:id/test` | Manage BYO keys |
| `GET /models?keyId=` | Available models with capability badges |
| `POST /projects` · `PATCH/DELETE /projects/:id` · `POST /projects/:id/duplicate` | Projects |
| `POST /projects/:id/imports/{resume,github,rss}` | Imports |
| `POST /projects/:id/inspiration` | Analyze reference URL / screenshot |
| `POST /projects/:id/generate` (SSE) | Design directions |
| `POST /projects/:id/assist` (SSE) | Assistant proposal |
| `POST /projects/:id/content-assist` | Rewrite / tagline / case study / alt text |
| `GET/POST /projects/:id/versions` · `POST …/versions/:vid/restore` | Versions |
| `POST /projects/:id/assets` | Image processing |
| `POST /projects/:id/export` | ZIP + full score |
| `GET /me/export` · `DELETE /me` | Data export · account deletion |
