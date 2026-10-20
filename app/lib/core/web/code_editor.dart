/// The code-mode editor (CodeMirror in the browser), with a plain stand-in for VM tests.
library;

export 'code_editor_stub.dart'
    if (dart.library.js_interop) 'code_editor_web.dart';
