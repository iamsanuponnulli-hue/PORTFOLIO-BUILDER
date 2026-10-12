# Portfolio Builder — Architecture, UI & Control Flow

Companion to [`PLAN.md`](../PLAN.md). This document describes **how the pieces fit
together**, **what each screen looks like**, and **how control moves through the app**
for every major user action.

---

## 1. Guiding principles

1. **Thin server, heavy browser.** All processing runs on the user's computer: AI calls
   with their own key, resume parsing, image processing, rendering, quality checks and
   ZIP export. The server only does what a browser can't do safely: sign-in, storing
   data behind security rules, relaying Starter AI requests (our key must stay secret),
   and cleaning up deleted accounts.
2. **Everything is an operation.** Every change — typing in a form, inline text edit,
   dragging a section, a theme slider, saving code, an AI prompt — becomes a typed
   `Operation` applied by one reducer. One undo stack, one autosave, one version
   history; AI edits are just "operations proposed by a model".
3. **Data in, files out.** `PortfolioContent` + `SiteSpec` + `CustomCode` are the source
   of truth. HTML/CSS/JS files are always *derived* by the renderer.
4. **AI output is validated before it touches state.** Models return schema-checked
   JSON; nothing a model says is executed directly.

---

## 2. System architecture

```mermaid
flowchart LR
  subgraph PC["User's computer"]
    subgraph Browser["Browser tab"]
      FA["Flutter Web app<br/>UI, state, routing"]
      subgraph TS["TypeScript packages (JS interop)"]
        RJ["renderer"]
        AI["ai gateway"]
        IM["imports<br/>pdf · docx · github"]
        AS["assets<br/>images"]
        CK["checks<br/>axe"]
        EX["export<br/>zip"]
        KS["keystore<br/>device-only keys"]
      end
      WK["Web Workers<br/>(heavy steps)"]
      MO["Monaco editor"]
      IF["Preview iframe<br/>sandboxed"]
    end
    EXT["Companion extension<br/>Chrome / Edge"]
  end

  subgraph FB["Firebase / Google Cloud"]
    AUTH["Auth"]
    FS[("Firestore")]
    ST[("Storage")]
    RELAY["aiRelay<br/>Cloud Function"]
    DEL["onUserDeleted<br/>Cloud Function"]
  end

  LLM["LLM providers<br/>Anthropic · OpenAI · Gemini ·<br/>Groq · OpenRouter · …"]
  GH["GitHub API"]
  REF["Reference sites,<br/>RSS feeds"]

  FA <--> TS
  TS <--> WK
  FA <--> MO
  FA -- srcdoc / postMessage --> IF
  FA <-- messages --> EXT
  EXT --> REF
  FA --> AUTH
  FA -- security rules --> FS
  FA -- security rules --> ST
  AI -- own key: direct --> LLM
  AI -- Starter --> RELAY --> LLM
  IM --> GH
  AUTH -. account deleted .-> DEL
  DEL --> FS
  DEL --> ST
```

### What runs where

| Where | Piece | Job |
|---|---|---|
| **Browser** | Flutter app | UI, routing, editor state, operations reducer, undo/redo, autosave |
| | renderer | `render(content, spec, custom) → files`, `apply(state, op)` |
| | ai gateway | Prompts, model registry, capability fallbacks, validation + repair retry, direct or relay transport |
| | imports | PDF/DOCX text extraction (pdf.js, mammoth), GitHub API, feed parsing |
| | assets | Resize, WebP encode, EXIF strip, crop, favicon, OG image |
| | checks | Instant checks on every render; axe-core + 3 widths before export |
| | export | Build the ZIP and download it |
| | keystore | Encrypt/store own API keys in IndexedDB (never uploaded) |
| | Web Workers | Run image, PDF, ZIP and thumbnail rendering off the UI thread |
| **Extension** | capture | Open reference site, screenshots at 2 widths, computed styles |
| | fetch | RSS feeds, external link checks |
| **Server** | Firebase Auth | Sign-in |
| | Firestore / Storage | Data, protected by owner-only security rules |
| | `aiRelay` | Starter only: verify token → check/count allowance → add our key → stream through |
| | `onUserDeleted` | Delete a deleted user's data |
| | Configuration only | Backups, file expiry, budget alerts |

Why each server piece can't move to the browser:
- **Auth / database / storage** — data has to live somewhere shared and be protected
  from other users; the browser can't enforce that on its own.
- **aiRelay** — the Starter allowance uses *our* API key. Anything sent to a browser can
  be read, so the key must stay on a server. The relay only forwards and waits.
- **onUserDeleted** — the account may be gone before the browser finishes cleaning up,
  so cleanup must be guaranteed server-side.

---

## 3. Flutter app architecture

```mermaid
flowchart TB
  PG["Pages & widgets"] -- intents --> CT["Riverpod controllers<br/>Auth · Dashboard · Intake ·<br/>Editor · Assistant · Settings"]
  CT -- state --> PG
  CT --> RP["Repositories<br/>Project · AI · Import · Keys · Export"]
  RP --> FBS["Firebase SDKs<br/>(Auth, Firestore, Storage)"]
  RP --> BR["JS bridges<br/>renderer · ai · imports · assets ·<br/>checks · export · keystore ·<br/>Monaco · Preview · Extension"]
  BR --> WK["Web Workers"]
```

- **Unidirectional flow**: widgets send intents → controllers update immutable state →
  widgets rebuild. Widgets never call repositories directly.
- **Dart ↔ TypeScript**: packages are bundled with esbuild into `web/js/`, exposed on a
  single `window.pb` object, and called from Dart with `dart:js_interop`. Long tasks
  return Promises or streams; heavy ones run in Web Workers.

| Route | Screen |
|---|---|
| `/signin`, `/verify-email` | Sign-in, email verification |
| `/` | Dashboard |
| `/new/:step` | Intake wizard (`type`, `import`, `content`, `goals`, `inspiration`, `review`) |
| `/p/:id/generate` | Generation progress → design directions |
| `/p/:id/edit?mode=visual\|code` | Editor workspace |
| `/settings/ai`, `/settings/account` | Settings |

### Editor state

```ts
EditorState {
  projectId, baseVersionId
  content: PortfolioContent
  spec: SiteSpec
  custom: CustomCode
  rendered: SiteFiles          // derived — never edited directly
  past: Operation[][]          // undo stack (grouped)
  future: Operation[][]        // redo stack
  dirty, saving, lastSavedAt
  selection?: { sectionId, cssPath }
  mode: 'visual' | 'code'
  openFile?: string
  pendingProposal?: Proposal   // AI change awaiting accept/reject (in memory only)
  checks: CheckResult[]
}
```

### Server code (all of it)

```mermaid
flowchart LR
  subgraph relay["aiRelay (HTTP, streaming)"]
    A1["Verify Firebase ID token"] --> A2["Check request: Starter model,<br/>input size, max output tokens"]
    A2 --> A3["Firestore transaction:<br/>allowance left? count it"]
    A3 --> A4["Forward to provider<br/>with our key"]
    A4 --> A5["Stream response back"]
  end
  subgraph del["onUserDeleted (Auth trigger)"]
    D1["Delete projects, versions,<br/>usage doc"] --> D2["Delete Storage folder"]
  end
```

---

## 4. Companion extension

```mermaid
sequenceDiagram
  participant App as Flutter app
  participant X as Extension (service worker)
  participant T as Background tab
  App->>X: ping (is it installed?)
  X-->>App: version
  App->>X: capture {url}
  X->>X: request site permission (first time for this site)
  X->>T: open url at 1440 px
  T-->>X: loaded
  X->>T: inject reader: fonts, colours, CSS variables,<br/>spacing, headings, layout structure
  X->>T: screenshots (top + 2 scrolled)
  X->>T: resize to 390 px, screenshot
  X->>T: close
  X-->>App: {screenshots, styles, structure}
```

- **Manifest V3**, TypeScript. Permissions: `activeTab`, `scripting`, `storage`; site
  access via optional host permissions requested per site; `externally_connectable`
  limited to the app's domain.
- **Messages**: `ping`, `capture {url}`, `fetchFeed {url}`, `checkLinks {urls}`,
  `getPendingCaptures` (captures sent from the toolbar button while browsing).
- **Fallback**: no extension → *Install extension* prompt + screenshot upload.

---

## 5. UI

### 5.1 Screen map

```mermaid
flowchart LR
  SI["Sign in"] --> DB["Dashboard"]
  DB -- New project --> W1["1 Profile type"] --> W2["2 Import"] --> W3["3 Review content"] --> W4["4 Goals"] --> W5["5 Inspiration"] --> W6["6 Review & generate"]
  W6 --> GEN["Generating…"] --> DIR["Pick a design direction"] --> ED["Editor"]
  DB -- Open project --> ED
  ED --> EXP["Export (in browser)"]
  ED <--> SET["Settings: AI / Account"]
  DB <--> SET
```

### 5.2 Wireframes

**Dashboard**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◆ Portfolio Builder                          AI: Starter 2/3  ⚙  (avatar) │
├──────────────────────────────────────────────────────────────────────────┤
│ Your portfolios                                         [ + New portfolio ]│
│ ┌────────────┐ ┌────────────┐ ┌────────────┐                              │
│ │ thumbnail  │ │ thumbnail  │ │  + Create  │      2 of 5 projects used     │
│ │ Jane — Dev │ │ Jane — Free│ │            │                              │
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
│  │  read on your computer        │  │  [ janedoe        ] [Import]  │       │
│  │  ✓ resume.pdf — 14 items found│  │  ✓ 6 repos found              │       │
│  └──────────────────────────────┘  └──────────────────────────────┘       │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐       │
│  │  LinkedIn: how to export PDF │  │  Blog feed URL (via extension)│       │
│  └──────────────────────────────┘  └──────────────────────────────┘       │
│  ⓘ Resume text is sent to: your Anthropic key (direct). Change in Settings│
│                                              [ Skip ]  [ Continue → ]     │
└──────────────────────────────────────────────────────────────────────────┘
```

**Intake wizard — step 5, Inspiration**
```
┌──────────────────────────────────────────────────────────────────────────┐
│  Show us sites you like (up to 3)              Extension: ✓ installed     │
│  [ https://example-portfolio.dev                     ] [Analyze]          │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ [screenshot]  Palette ■■■■■  Fonts: Serif display / Sans body     │    │
│  │               Layout: split hero · card grid · generous spacing   │    │
│  │   Borrow:  [✓ Colours] [✓ Fonts] [ Layout] [✓ Mood]                │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│  No extension? [Install] or [Upload screenshots]                          │
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
│ AI access   ( ) Starter — 2 of 3 generations, 31 of 50 edits left (Oct)   │
│             (•) My own keys — stored on this device only, never uploaded  │
│ Keys        Anthropic  ••••7Hk2  [Test] [Replace] [Delete]                │
│             [+ Add key]  [Sign in with OpenRouter]                        │
│             Free key guides: Gemini · Groq · OpenRouter                   │
│ Model       Simple: one model [ claude-… ▾ ]  ✓Recommended 📄 👁 { }       │
│             ( ) Advanced: Smart [ … ▾ ]  Fast [ … ▾ ]                     │
│ ⓘ This model can't read images — inspiration will use page styles only.  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Control flows

### 6.1 Sign-in and route guard
```mermaid
sequenceDiagram
  actor U as User
  participant App as Flutter app
  participant Auth as Firebase Auth
  participant FS as Firestore
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
  App->>FS: read users/{uid} (create on first sign-in; rules: owner only)
  App->>FS: read usage/{uid} (read-only for client)
  App-->>U: target route (default Dashboard)
```

### 6.2 Resume import (all in the browser)
```mermaid
sequenceDiagram
  actor U as User
  participant App
  participant W as Worker (imports)
  participant GW as ai gateway (browser)
  participant P as Provider or relay
  U->>App: drop resume.pdf
  App->>App: check type and size
  App->>W: extract text (pdf.js / mammoth)
  W-->>App: text (or "no text layer")
  alt has text
    App->>GW: resume.parse (text)
  else scanned PDF and model sees images
    App->>W: render pages to images
    App->>GW: resume.parse (page images)
  else scanned and no vision model
    App-->>U: "Couldn't read this file" → manual entry or pick a vision model
  end
  GW->>P: request (direct with own key, or Starter relay)
  P-->>GW: JSON
  GW->>GW: validate with zod, repair retry once if invalid
  GW-->>App: PortfolioContent (partial) + warnings
  App-->>U: Review content, imported fields highlighted
```

### 6.3 Inspiration via the extension
```mermaid
sequenceDiagram
  actor U as User
  participant App
  participant X as Extension
  participant GW as ai gateway (browser)
  U->>App: paste URL → Analyze
  App->>X: ping
  alt extension installed
    App->>X: capture {url}
    X-->>App: screenshots + styles + structure
  else not installed
    App-->>U: Install extension, or upload screenshots
    U->>App: upload screenshots
  end
  alt model sees images
    App->>GW: inspiration.analyze (screenshots + styles)
  else
    App->>GW: inspiration.analyze (styles only)
  end
  GW-->>App: DesignBrief (validated)
  App-->>U: palette/fonts/layout chips with Borrow toggles
```

### 6.4 Generate → pick a direction
```mermaid
sequenceDiagram
  actor U as User
  participant App
  participant GW as ai gateway (browser)
  participant P as Provider or relay
  participant W as Worker (renderer)
  participant FS as Firestore
  U->>App: Generate
  App->>GW: design.directions (content summary, goals, briefs, section catalogue)
  GW->>P: request (streamed)
  P-->>GW: 3 × SiteSpec
  GW->>GW: validate: known sections/variants, token ranges, contrast
  loop each direction
    App->>W: render(content, spec)
    W-->>App: mini preview
  end
  U->>App: Use this
  App->>FS: save project spec + version (rules: owner only)
  App-->>U: open Editor
```
The model returns only design specs, never content, so facts can't change during design.

### 6.5 Visual editing loop (no AI, no server)
```mermaid
sequenceDiagram
  actor U as User
  participant W as Widget / Preview
  participant EC as EditorController
  participant R as renderer
  participant FS as Firestore
  U->>W: change (drag section, slider, inline text, form field)
  W->>EC: intent → Operation
  EC->>EC: validate · apply · push undo · dirty
  EC->>R: render(content, spec, custom)
  R-->>EC: files + instant checks
  EC->>W: update preview (debounced) & score
  Note over EC,FS: autosave 2 s after last change
  EC->>FS: transaction: write if baseVersion unchanged
  alt changed in another tab
    EC-->>U: "Newer changes exist — reload or keep mine?"
  end
```

### 6.6 Code editing
```mermaid
flowchart TD
  S["Save in code mode"] --> F{"Which file?"}
  F -- custom.css / custom.js --> A["editCustomCode"]
  F -- index.html --> B["Split by pb:section markers, diff each region"]
  B --> B1{"Region changed?"}
  B1 -- yes --> C["convertToCustom for that section"]
  B1 -- markers broken --> E["Block save, error at line"]
  F -- theme.css --> T["Parse :root variables → updateTheme"]
  A --> R["Re-render → preview, checks"]
  C --> R
  T --> R
  R --> N["Saved ✓ (+ Undo if a section became custom)"]
```

### 6.7 AI assistant edit (proposal kept in memory only)
```mermaid
sequenceDiagram
  actor U as User
  participant AS as AssistantController
  participant GW as ai gateway (browser)
  participant P as Provider or relay
  participant EC as EditorController
  U->>AS: "Add testimonials under projects and make it warmer"
  AS->>GW: assistant.edit (prompt, spec, selection, relevant content/code, recent chat)
  GW->>P: request (tools or JSON operations, per model capability)
  P-->>GW: operations[]
  GW->>GW: validate each op · flag ops adding new facts
  GW-->>AS: Proposal
  AS->>EC: apply to an in-memory copy, render
  EC-->>U: preview + change list (+ code diff)
  alt Accept
    U->>EC: apply as one undo group → autosave + version
  else Reject / refine
    U->>AS: discard copy, or follow-up prompt
  end
```

### 6.8 Routing every AI request
```mermaid
flowchart TD
  A["AI task (browser)"] --> B{"AI mode"}
  B -- Own key --> E["Load key from device keystore<br/>pick Smart or Fast model"]
  E --> F{"Capabilities fit task?"}
  B -- Starter --> D["Starter model via relay"]
  D --> F
  F -- no --> G["Fallback: text extraction,<br/>JSON mode, no vision…"]
  F -- yes --> H{"Transport"}
  G --> H
  H -- own key --> H1["Browser → provider directly"]
  H -- Starter --> H2["Browser → aiRelay → provider"]
  H2 --> Q{"Allowance left?"}
  Q -- no --> Q1["'Allowance used' → offer own key"]
  H1 --> I{"Response"}
  Q -- yes --> I
  I -- ok --> J["Validate (zod) → repair once if invalid"]
  J --> M["Return + record usage"]
  I -- 401/403 --> N["'Key invalid' → Settings"]
  I -- 429 --> O["'Rate limited, retry in N s'"]
  I -- no credit --> P["'Out of credit' → switch model / Starter"]
```

### 6.9 Add a key or sign in with OpenRouter
```mermaid
sequenceDiagram
  actor U as User
  participant App
  participant KS as keystore (browser)
  participant P as Provider
  participant OR as OpenRouter
  alt paste a key
    U->>App: provider + key (+ base URL)
    App->>P: list models (validation, direct from browser)
    P-->>App: models
  else Sign in with OpenRouter
    App->>OR: redirect (OAuth PKCE)
    U->>OR: log in, approve
    OR-->>App: code → exchange → key
  end
  App->>KS: encrypt (non-extractable WebCrypto key) → IndexedDB
  App-->>U: key saved on this device · models with badges
  U->>App: pick model(s) → saved to users/{uid}.ai (no key stored)
```

### 6.10 Export ZIP (in the browser)
```mermaid
sequenceDiagram
  actor U as User
  participant App
  participant CK as checks (preview)
  participant W as Worker (export)
  U->>App: Export ZIP
  App->>App: block if placeholders like [X%] remain
  App->>CK: full checks: axe in preview, 3 widths, links (extension if installed)
  CK-->>App: score report
  App->>W: render · bundle fonts, icons, images (srcset), favicon, OG image,<br/>resume.pdf, sitemap, robots, README · zip
  W-->>App: Blob
  App-->>U: download + score summary with fixes
```

### 6.11 Starter relay (server)
```mermaid
sequenceDiagram
  participant GW as ai gateway (browser)
  participant R as aiRelay
  participant FS as Firestore
  participant P as Provider
  GW->>R: POST request + ID token
  R->>R: verify token · Starter model only · size and token caps · rate limit
  R->>FS: transaction on usage/{uid}: allowance left? increment
  alt allowance used
    R-->>GW: 402 allowance used
  else
    R->>P: forward with our key (Secret Manager)
    P-->>R: stream
    R-->>GW: stream through
  end
```

### 6.12 Project lifecycle
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

## 7. Key interfaces

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

function apply(state: SiteState, op: Operation): SiteState;   // pure
function render(state: SiteState): { files: SiteFiles; checks: CheckResult[] };
```

### Browser package API (exposed to Dart as `window.pb`)
| Call | Package |
|---|---|
| `render(state)`, `apply(state, op)` | renderer |
| `ai.run(task, input, settings)` → stream of events | ai |
| `imports.resume(file)`, `imports.github(user)`, `imports.feed(xml)` | imports |
| `assets.process(file, opts)`, `assets.favicon(...)`, `assets.ogImage(...)` | assets |
| `checks.full(previewHandle)` | checks |
| `exportZip(state, assets)` → Blob | export |
| `keys.save/list/remove/get(provider)` | keystore |
| `ext.ping()`, `ext.capture(url)`, `ext.fetchFeed(url)`, `ext.checkLinks(urls)` | extension bridge |

### Server surface (complete)
| Endpoint / trigger | Purpose |
|---|---|
| `POST /aiRelay` (streaming) | Starter AI requests only |
| Auth `onDelete` → `onUserDeleted` | Remove the user's data |
| Firestore / Storage security rules | Owner-only access; `usage/{uid}` read-only for clients |
