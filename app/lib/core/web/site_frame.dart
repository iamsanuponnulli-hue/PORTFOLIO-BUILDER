/// A sandboxed iframe showing a generated page, with a stand-in for VM tests.
library;

export 'site_frame_stub.dart'
    if (dart.library.js_interop) 'site_frame_web.dart';
