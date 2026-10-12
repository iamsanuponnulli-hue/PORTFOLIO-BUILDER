# Portfolio Builder

A Flutter Web app for building portfolio websites that people own: import a resume,
pick a design direction, refine it visually or in code, and download clean
HTML/CSS/JS as a ZIP.

- **Plan:** [`PLAN.md`](PLAN.md)
- **Architecture, screens and control flows:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

**Status:** Phase 0 (foundations) is done. Sign-in, the dashboard, data rules, the
server functions and the browser-package bridge work. The setup wizard, renderer,
editor and AI features come in Phases 1–5.

## How it's built

Almost everything runs in the user's browser. The server only handles sign-in,
stored data (behind security rules), the Starter AI relay and account cleanup.

```
app/                Flutter Web app (Riverpod, go_router, Firebase)
packages/schema     Shared data definitions (zod) → JSON Schema → Dart models
packages/bridge     Browser bundle exposed to Flutter as window.pb, plus a Web Worker
functions/          Cloud Functions: aiRelay (Starter AI only), onUserDeleted
firebase/           Firestore and Storage security rules, with emulator tests
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
pnpm emulators              # auth, firestore, storage, functions (leave running)

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
pnpm test              # unit tests: schema, bridge, relay
pnpm test:emulator     # security rules + Starter quota against the emulators (needs Java)
pnpm codegen           # regenerate Dart models after changing packages/schema

cd app
flutter analyze
flutter test
```

CI runs all of these on every pull request (`.github/workflows/ci.yml`).

## Changing the data model

1. Edit the zod schemas in `packages/schema/src`.
2. Run `pnpm codegen`. This regenerates `app/lib/models/generated/models.dart` and the
   default-value templates in `app/assets/schema/templates.json`.
3. Update `firebase/firestore.rules` if a stored document's shape changed, and add a
   rules test in `firebase/test`.

## Using a real Firebase project

1. Create a Firebase project and enable Authentication (Email/Password, Google,
   GitHub), Firestore and Storage.
2. Deploy the rules, indexes and functions:
   ```bash
   pnpm exec firebase use --add <project-id>
   pnpm exec firebase deploy --only firestore,storage,functions
   ```
3. Build the app with your web app's config:
   ```bash
   cd app
   flutter build web --release \
     --dart-define=USE_EMULATORS=false \
     --dart-define=FIREBASE_PROJECT_ID=<project-id> \
     --dart-define=FIREBASE_API_KEY=<api-key> \
     --dart-define=FIREBASE_APP_ID=<app-id> \
     --dart-define=FIREBASE_SENDER_ID=<sender-id> \
     --dart-define=FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com \
     --dart-define=FIREBASE_STORAGE_BUCKET=<bucket>
   pnpm exec firebase deploy --only hosting
   ```

The Starter AI relay answers "not available yet" until Phase 2 picks the Starter
model and adds the provider forwarding. It needs the `STARTER_API_KEY` secret and the
`ALLOWED_ORIGINS` parameter (your app's URL) when deployed.
