import 'package:flutter/material.dart';

import 'code_editor_controller.dart';

export 'code_editor_controller.dart';

/// Plain text field used where the browser editor isn't available (tests).
class CodeEditor extends StatefulWidget {
  const CodeEditor({
    super.key,
    required this.text,
    required this.language,
    required this.controller,
    this.readOnly = false,
  });
  final String text;
  final String language;
  final CodeEditorController controller;
  final bool readOnly;

  @override
  State<CodeEditor> createState() => _CodeEditorState();
}

class _CodeEditorState extends State<CodeEditor> {
  late final _c = TextEditingController(text: widget.text);

  @override
  void initState() {
    super.initState();
    widget.controller.attach(
      this,
      get: () => _c.text,
      set: (t) => _c.text = t,
      goTo: (_) {},
    );
  }

  @override
  void dispose() {
    widget.controller.detach(this);
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
    key: const Key('code-editor'),
    controller: _c,
    readOnly: widget.readOnly,
    maxLines: null,
    expands: true,
    style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
  );
}
