/// Small browser helpers (links, redirects, origin) with a no-op stub for VM tests.
library;

export 'browser_stub.dart' if (dart.library.js_interop) 'browser_web.dart';
