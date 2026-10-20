import 'dart:convert';

import 'package:flutter/material.dart';

import '../../core/js/pb_bridge.dart';
import '../../core/ui/feedback.dart';
import '../../core/web/code_editor.dart';
import 'catalog.dart';
import 'editor_controller.dart';

/// A file shown in code mode.
class CodeFile {
  const CodeFile(this.path, this.label, {this.editable = false, this.note});
  final String path;
  final String label;
  final bool editable;

  /// Why it's read-only, or what editing it does.
  final String? note;

  String get language => path.endsWith('.css')
      ? 'css'
      : path.endsWith('.js')
      ? 'javascript'
      : 'html';
}

/// Code mode: every file of the site; sections, custom.css and custom.js are editable.
class CodeMode extends StatefulWidget {
  const CodeMode({super.key, required this.editor, required this.catalog});
  final EditorController editor;
  final Catalog catalog;

  @override
  State<CodeMode> createState() => _CodeModeState();
}

class _CodeModeState extends State<CodeMode> {
  final _code = CodeEditorController();
  Map<String, dynamic> _generated = const {};
  var _open = 'index.html';
  var _version = 0;
  String _original = '';
  ({String message, int line})? _error;
  bool _saving = false;

  EditorController get editor => widget.editor;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final files = await editor.exportFiles();
      if (!mounted) return;
      setState(() {
        _generated = files;
        _version++;
        _original = _textOf(_open);
      });
    } on PbException catch (e) {
      if (mounted) showMessage(context, e.message);
    }
  }

  List<CodeFile> get _files {
    final d = editor.doc!;
    final customSections = d.spec!.sections.where((s) => s.custom);
    return [
      const CodeFile(
        'index.html',
        'index.html',
        editable: true,
        note:
            'Edit inside a section (between its pb:section markers) to make it a custom section. '
            'The rest of the page comes from the panels.',
      ),
      for (final p in _generated.keys.where((k) => k.startsWith('projects/')))
        CodeFile(
          p,
          p,
          note: 'Case-study pages follow your design. Style them with custom.css.',
        ),
      const CodeFile(
        'assets/css/theme.css',
        'theme.css',
        note: 'Made from the Theme panel. Change colours and fonts there, or override them in custom.css.',
      ),
      const CodeFile('assets/css/base.css', 'base.css', note: _locked),
      const CodeFile('assets/css/sections.css', 'sections.css', note: _locked),
      const CodeFile(
        'assets/css/custom.css',
        'custom.css',
        editable: true,
        note: 'Yours: loaded last, so it can override anything.',
      ),
      const CodeFile('assets/js/main.js', 'main.js', note: _locked),
      const CodeFile(
        'assets/js/custom.js',
        'custom.js',
        editable: true,
        note: 'Yours: runs on every page after the site\'s own scripts.',
      ),
      for (final s in customSections) ...[
        CodeFile(
          'sections/${s.id}.css',
          '${widget.catalog.title(s)} (CSS)',
          editable: true,
          note: 'Styles for this custom section.',
        ),
        CodeFile(
          'sections/${s.id}.js',
          '${widget.catalog.title(s)} (JS)',
          editable: true,
          note: 'Script for this custom section.',
        ),
      ],
    ];
  }

  static const _locked =
      'Part of the generated site. Override it in custom.css or custom.js instead.';

  String _textOf(String path) {
    final d = editor.doc!;
    if (path == 'assets/css/custom.css') return d.custom.css;
    if (path == 'assets/js/custom.js') return d.custom.js;
    final m = RegExp(r'^sections/(.+)\.(css|js)$').firstMatch(path);
    if (m != null) {
      final c = d.custom.sections[m[1]];
      return (m[2] == 'css' ? c?.css : c?.js) ?? '';
    }
    return _generated[path] as String? ?? '';
  }

  Future<void> _openFile(CodeFile f) async {
    if (f.path == _open) return;
    final current = _files.where((x) => x.path == _open).firstOrNull;
    if (current?.editable == true && _code.text != _original) {
      final ok = await confirm(
        context,
        title: 'Discard your changes to ${current!.label}?',
        message: 'Save first to keep them.',
        action: 'Discard',
      );
      if (!ok) return;
    }
    setState(() {
      _open = f.path;
      _error = null;
      _original = _textOf(f.path);
      _version++;
    });
  }

  Future<void> _save() async {
    final text = _code.text;
    if (text == _original) {
      showMessage(context, 'No changes to save.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final ops = <Map<String, dynamic>>[];
      var converted = <String>[];
      if (_open == 'index.html') {
        final r = await editor.pb.invoke('site', 'codeEdit', [
          _generated['index.html'] as String,
          text,
          jsonEncode(editor.state),
        ]);
        final v = jsonMap(r.get<Object?>());
        if (v['error'] != null) {
          final e = jsonMap(v['error']);
          final line = (e['line'] as num?)?.toInt() ?? 1;
          setState(
            () => _error = (message: e['message'] as String, line: line),
          );
          _code.goToLine(line);
          return;
        }
        ops.addAll(jsonList(v['ops']));
        converted = ((v['converted'] as List?) ?? const []).cast<String>();
      } else if (_open == 'assets/css/custom.css' ||
          _open == 'assets/js/custom.js') {
        ops.add({
          'op': 'editCustomCode',
          'file': _open.endsWith('.css') ? 'custom.css' : 'custom.js',
          'content': text,
        });
      } else {
        final m = RegExp(r'^sections/(.+)\.(css|js)$').firstMatch(_open)!;
        final c = editor.doc!.custom.sections[m[1]];
        ops.add({
          'op': 'convertToCustom',
          'id': m[1],
          'html': c?.html ?? '',
          'css': m[2] == 'css' ? text : (c?.css ?? ''),
          'js': m[2] == 'js' ? text : (c?.js ?? ''),
        });
      }
      await editor.apply(ops);
      _original = text;
      if (!mounted) return;
      if (converted.isNotEmpty) {
        final names = converted
            .map(
              (id) => editor.doc!.spec!.sections
                  .where((s) => s.id == id)
                  .map(widget.catalog.title)
                  .firstOrNull,
            )
            .whereType<String>()
            .join(', ');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '$names ${converted.length == 1 ? 'is' : 'are'} now custom code. '
              'Panels can\'t change ${converted.length == 1 ? 'its' : 'their'} layout any more.',
            ),
            action: SnackBarAction(label: 'Undo', onPressed: editor.undo),
          ),
        );
      } else {
        showMessage(context, 'Saved.');
      }
      await _load();
    } on PbException catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final files = _files;
    final open = files.where((f) => f.path == _open).firstOrNull ?? files.first;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          width: 220,
          child: Material(
            color: theme.colorScheme.surfaceContainerLow,
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                for (final f in files)
                  ListTile(
                    key: Key('file-${f.path}'),
                    dense: true,
                    selected: f.path == open.path,
                    leading: Icon(
                      f.editable ? Icons.edit_note : Icons.lock_outline,
                      size: 18,
                    ),
                    title: Text(f.label, overflow: TextOverflow.ellipsis),
                    onTap: () => _openFile(f),
                  ),
              ],
            ),
          ),
        ),
        const VerticalDivider(width: 1),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        open.note ?? '',
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                    if (open.editable)
                      FilledButton.icon(
                        key: const Key('save-code'),
                        onPressed: _saving ? null : _save,
                        icon: const Icon(Icons.save_outlined, size: 18),
                        label: Text(_saving ? 'Saving…' : 'Save'),
                      ),
                  ],
                ),
              ),
              if (_error != null)
                MaterialBanner(
                  key: const Key('code-error'),
                  backgroundColor: theme.colorScheme.errorContainer,
                  content: Text('Line ${_error!.line}: ${_error!.message}'),
                  actions: [
                    TextButton(
                      onPressed: () => setState(() {
                        _version++;
                        _error = null;
                      }),
                      child: const Text('Undo my edits'),
                    ),
                  ],
                ),
              Expanded(
                child: _generated.isEmpty
                    ? const Center(child: CircularProgressIndicator())
                    : CodeEditor(
                        key: Key('editor-${open.path}-$_version'),
                        text: _textOf(open.path),
                        language: open.language,
                        readOnly: !open.editable,
                        controller: _code,
                      ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
