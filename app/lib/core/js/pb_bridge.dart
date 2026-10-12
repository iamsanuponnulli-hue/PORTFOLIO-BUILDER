/// Access to the TypeScript packages loaded in web/js/pb.js (window.pb).
///
/// On the web this talks to the real bundle; in VM tests a stub reports it as unavailable.
library;

export 'pb_bridge_types.dart';
export 'pb_bridge_stub.dart' if (dart.library.js_interop) 'pb_bridge_web.dart';
