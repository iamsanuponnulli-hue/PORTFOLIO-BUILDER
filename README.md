# Portfolio Builder

A Flutter Web app for building portfolio websites that people own: import a resume,
pick a design direction, refine it visually or in code, and download clean
HTML/CSS/JS as a ZIP.

- **Plan:** [`PLAN.md`](PLAN.md)
- **Architecture, screens and control flows:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

**Status:** the MVP (Phases 0–6) is built, plus the Phase 7 tooling.

- Phase 0: sign-in, the dashboard, data rules and the browser-package bridge.
- Phase 1: the site renderer — 12 section types with 2–4 layouts each (plus custom
  sections), 6 theme presets, case-study pages, contact forms, SEO tags, instant checks.
- Phase 2: connect your own AI, the setup wizard (resume, GitHub and blog imports),
  local-first saving.
- Phase 3: design directions — 3 designs from your AI, or without AI from built-in
  styles; inspiration from reference sites (companion extension), uploaded screenshots
  or a style gallery.
- Phase 4: the editor — sections, theme, content and site panels; click-to-edit text in
  the preview; code mode (CodeMirror) with custom sections; undo/redo; version history;
  ZIP export and project backups, all built in the browser.
- Phase 5: the AI assistant (prompt → previewed changes you accept or reject, custom
  sections) and the content assistant (better wording, taglines, case-study interview).
- Phase 6: the portfolio score (instant checks plus axe-core and layout at 3 widths)
  with one-click fixes, the editor tour, and the daily free-quota state.
- Phase 7: separate Smart/Fast models, recommended-model labels, usage per model, and
  the cross-model eval runner in `evals/`.

## How it's built

Everything runs in the user's browser, and it costs nothing to run: the only server is
Firebase's free Spark plan (sign-in, the Firestore database behind security rules, and
hosting), with no card on file and no server code of our own. AI features use each
user's own key — free ones from Gemini, Groq or OpenRouter work — called directly from
the browser. See [PLAN.md §13](PLAN.md#13-running-at-zero-cost).

```
app/                Flutter Web app (Riverpod, go_router, Firebase)
packages/schema     Shared data definitions (zod) → JSON Schema → Dart models
packages/renderer   Content + design spec → static HTML/CSS/JS site (pure, deterministic)
packages/ai         AI calls with the user's own key (any provider), resume reading
packages/imports    Resume text (PDF, Word), GitHub import, image resizing
packages/localstore On-device storage: encrypted keys, images, unsynced edits, AI usage
packages/export     Site ZIP (fonts, favicon, share image, README) and project backups
packages/checks     Portfolio score, one-click fixes, axe-core runner
packages/bridge     Browser bundle exposed to Flutter as window.pb, plus a Web Worker
extension/          Companion browser extension (Chrome, Edge): captures, feeds, links
evals/              Cross-model evals (dev only, your own key)
firebase/           Firestore security rules, with emulator tests
docs/               Architecture and flows
```

## Prerequisites

- Node.js 22.12+ and pnpm 10 (`corepack enable`)
- Flutter stable (3.47+)
- Java 21+ (only for the Firebase emulators)

## Run it locally

No Firebase project is needed: by default the app talks to the local emulators with a
`demo-` project.

```bash
pnpm install
pnpm bridge                 # builds app/web/js/pb.js and pb.worker.js
pnpm emulators              # auth, firestore, hosting (leave running)

# in another terminal
cd app
flutter run -d chrome --web-port 8000
```

Then create an account with email and password. The verification email isn't really
sent; the Auth emulator prints the verification link in the terminal running
`pnpm emulators`. Open that link, then press **I've verified my email**.

Google and GitHub sign-in also work against the emulator: it shows a test account
picker instead of the real sign-in page.

> **Emulator note:** run the app in debug mode on `localhost` (as above). In a release
> build pointed at the emulators, a page reload signs you out, because FlutterFire
> restores the session before the app can switch it to the emulator. Production is
> unaffected.

## Checks

```bash
pnpm lint              # eslint + prettier
pnpm typecheck
pnpm test              # unit tests: schema, renderer, bridge
pnpm test:emulator     # security rules against the Firestore emulator (needs Java)
pnpm --filter @pb/renderer test:browser   # every layout × theme in Chromium: overflow + axe
pnpm --filter @pb/bridge test:browser     # browser bundles end to end in Chromium (pnpm bridge first)
pnpm --filter @pb/renderer gallery        # writes sample sites to packages/renderer/.gallery
pnpm codegen           # regenerate Dart models after changing packages/schema

cd app
flutter analyze
flutter test
```

CI runs all of these on every pull request (`.github/workflows/ci.yml`).

## Changing the data model

1. Edit the zod schemas in `packages/schema/src`.
2. Run `pnpm codegen`. This regenerates `app/lib/models/generated/models.dart` and the
   default-value templates in `app/assets/schema/templates.json`. Don't hand-edit or
   `dart format` the generated file; CI checks it matches the generator output exactly.
3. Update `firebase/firestore.rules` if a stored document's shape changed, and add a
   rules test in `firebase/test`.

## Using a real Firebase project (free, no card)

1. Create a Firebase project on the free **Spark** plan (don't upgrade to Blaze). Enable
   Authentication (Google sign-in) and Firestore, and register a web app
   to get its config values.
2. Deploy the rules and indexes:
   ```bash
   pnpm exec firebase use --add <project-id>
   pnpm exec firebase deploy --only firestore
   ```
3. Build and deploy the app:
   ```bash
   pnpm bridge
   cd app
   flutter build web --release \
     --dart-define=USE_EMULATORS=false \
     --dart-define=FIREBASE_PROJECT_ID=<project-id> \
     --dart-define=FIREBASE_API_KEY=<api-key> \
     --dart-define=FIREBASE_APP_ID=<app-id> \
     --dart-define=FIREBASE_SENDER_ID=<sender-id> \
     --dart-define=FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com
   cd .. && pnpm exec firebase deploy --only hosting
   ```

The app is then live at `https://<project-id>.web.app`. Nothing here needs a card or
can be billed: when a free daily allowance runs out, Firebase pauses that service until
the next day.

## The companion extension

Reading other sites (for inspiration) and most blog feeds needs the extension; the rest
of the app works without it. Build it for your app's address and load it:

```bash
PB_APP_ORIGINS=https://<project-id>.web.app pnpm --filter @pb/extension build
```

Load `extension/dist` with "Load unpacked" (chrome://extensions, developer mode), or
upload `extension/portfolio-builder-extension.zip` to the Edge Add-ons store
(see `extension/STORE_LISTING.md`). Pass `--dart-define=EXTENSION_URL=<store link>`
when building the app to show an "Install the extension" link.

## Cross-model evals

```bash
PB_EVAL_PROVIDER=gemini PB_EVAL_KEY=<key> PB_EVAL_MODELS=gemini-2.5-flash \
  pnpm --filter @pb/evals eval
```

Writes `evals/report.md`. Models that pass go on the recommended list in
`packages/ai/src/models.ts`.
