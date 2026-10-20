import 'dart:js_interop';

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

import 'code_editor_controller.dart';

export 'code_editor_controller.dart';

@JS('pb.code')
external _PbCode? get _code;

extension type _PbCode._(JSObject _) implements JSObject {
  external JSPromise<JSNumber> mount(
    web.HTMLElement host,
    String text,
    String language,
    bool readOnly,
    bool dark,
  );
  external String getText(int id);
  external void setText(int id, String text);
  external void goToLine(int id, int line);
  external void destroy(int id);
}

/// CodeMirror, loaded on first use and mounted into an element Flutter creates.
class CodeEditor extends StatefulWidget {
  const CodeEditor({
    super.key,
    required this.text,
    required this.language,
    required this.controller,
    this.readOnly = false,
  });
  final String text;

  /// html, css or javascript.
  final String language;
  final CodeEditorController controller;
  final bool readOnly;

  @override
  State<CodeEditor> createState() => _CodeEditorState();
}

class _CodeEditorState extends State<CodeEditor> {
  int? _id;
  String? _pending;

  @override
  void initState() {
    super.initState();
    widget.controller.attach(
      this,
      get: () => _id == null ? (_pending ?? widget.text) : _code!.getText(_id!),
      set: (t) => _id == null ? _pending = t : _code!.setText(_id!, t),
      goTo: (line) {
        if (_id != null) _code!.goToLine(_id!, line);
      },
    );
  }

  Future<void> _mount(web.HTMLElement host, bool dark) async {
    final code = _code;
    if (code == null) return;
    final id =
        (await code
                .mount(
                  host,
                  widget.text,
                  widget.language,
                  widget.readOnly,
                  dark,
                )
                .toDart)
            .toDartInt;
    if (!mounted) {
      code.destroy(id);
      return;
    }
    _id = id;
    if (_pending != null) {
      code.setText(id, _pending!);
      _pending = null;
    }
  }

  @override
  void dispose() {
    if (_id != null) _code?.destroy(_id!);
    widget.controller.detach(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return HtmlElementView.fromTagName(
      key: const Key('code-editor'),
      tagName: 'div',
      onElementCreated: (e) {
        final host = e as web.HTMLElement;
        host.style
          ..width = '100%'
          ..height = '100%';
        _mount(host, dark);
      },
    );
  }
}
