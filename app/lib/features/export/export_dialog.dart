import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/js/pb_bridge.dart';
import '../../core/ui/feedback.dart';
import '../../models/generated/models.dart' hide Colors;
import '../editor/editor_controller.dart';
import '../score/score.dart';

/// Export: full checks, then the site ZIP (and a project backup), all built here.
Future<void> showExportDialog(
  BuildContext context,
  EditorController editor,
  ScoreTracker tracker, {
  required void Function(String panel) openPanel,
}) => showDialog<void>(
  context: context,
  builder: (_) =>
      _ExportDialog(editor: editor, tracker: tracker, openPanel: openPanel),
);

/// Downloads the project backup (content, design and this computer's images).
Future<void> downloadBackup(
  BuildContext context,
  EditorController editor,
) async {
  final d = editor.doc!;
  final project = {
    for (final k in [
      'name',
      'profileType',
      'goals',
      'content',
      'spec',
      'custom',
      'contactForm',
      'inspiration',
    ])
      k: d.toJson()[k],
  };
  final r = await editor.pb.invoke('backup', 'download', [
    editor.session.projectId,
    jsonEncode(project),
    d.name,
  ]);
  if (!context.mounted) return;
  showMessage(
    context,
    r.ok
        ? 'Backup downloaded. Import it on another computer from the dashboard.'
        : r.errorMessage!,
  );
}

class _ExportDialog extends ConsumerStatefulWidget {
  const _ExportDialog({
    required this.editor,
    required this.tracker,
    required this.openPanel,
  });
  final EditorController editor;
  final ScoreTracker tracker;
  final void Function(String panel) openPanel;

  @override
  ConsumerState<_ExportDialog> createState() => _ExportDialogState();
}

class _ExportDialogState extends ConsumerState<_ExportDialog> {
  bool _hasResume = false;
  bool _includeResume = true;
  bool _exporting = false;
  Map<String, dynamic>? _done;

  EditorController get editor => widget.editor;

  @override
  void initState() {
    super.initState();
    widget.tracker.runFull();
    editor.pb.invoke('files', 'hasResumePdf', [editor.session.projectId]).then((
      r,
    ) {
      if (mounted && r.ok) setState(() => _hasResume = r.value == true);
    });
  }

  Future<void> _export() async {
    setState(() => _exporting = true);
    try {
      final r = await editor.pb.invoke('export', 'zip', [
        editor.session.projectId,
        jsonEncode(editor.state),
        _hasResume && _includeResume,
      ]);
      final v = jsonMap(r.get<Object?>());
      if (editor.doc!.status != ProjectStatus.EXPORTED) {
        editor.session.update(
          (d) => d.copyWith(status: ProjectStatus.EXPORTED),
        );
      }
      setState(() => _done = v);
    } on PbException catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListenableBuilder(
      listenable: widget.tracker,
      builder: (context, _) {
        final score = widget.tracker.score;
        final blocking = score?.blocking ?? const <Finding>[];
        final checking = widget.tracker.runningFull || score == null;
        return AlertDialog(
          title: const Text('Download your site'),
          content: SizedBox(
            width: 560,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_done != null) ...[
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(
                        Icons.check_circle,
                        color: Colors.green,
                      ),
                      title: Text('Downloaded ${_done!['name']}'),
                      subtitle: Text(
                        '${_done!['files']} files, ${((_done!['bytes'] as num) / 1024).round()} KB. '
                        'The README inside explains how to put it online for free '
                        '(GitHub Pages, Netlify, Cloudflare Pages).',
                      ),
                    ),
                    for (final n in (_done!['notes'] as List? ?? const []))
                      Text('• $n', style: theme.textTheme.bodySmall),
                  ] else ...[
                    Text(
                      'Everything is built on this computer: plain HTML, CSS and JavaScript '
                      'that works on any host. Nothing is uploaded.',
                      style: theme.textTheme.bodySmall,
                    ),
                    const SizedBox(height: 12),
                    if (checking)
                      const ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                        title: Text('Checking your site…'),
                        subtitle: Text(
                          'Accessibility, phones and tablets, links and placeholders.',
                        ),
                      )
                    else ...[
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Text(
                          '${score.total}',
                          style: theme.textTheme.headlineSmall?.copyWith(
                            color: scoreColor(context, score.total),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        title: const Text('Portfolio score'),
                        subtitle: Text(
                          blocking.isEmpty
                              ? '${score.findings.length} suggestions — you can download now and improve later.'
                              : 'Fix these first:',
                        ),
                      ),
                      if (blocking.isNotEmpty)
                        ScorePanel(
                          tracker: widget.tracker,
                          openPanel: widget.openPanel,
                          onlyBlocking: true,
                        ),
                    ],
                    if (_hasResume)
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Add a "Download resume" button'),
                        subtitle: const Text(
                          'Includes your resume PDF in the site.',
                        ),
                        value: _includeResume,
                        onChanged: (v) =>
                            setState(() => _includeResume = v == true),
                      ),
                  ],
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => downloadBackup(context, editor),
              child: const Text('Download project backup'),
            ),
            if (_done == null)
              FilledButton.icon(
                key: const Key('download-zip'),
                onPressed: checking || blocking.isNotEmpty || _exporting
                    ? null
                    : _export,
                icon: const Icon(Icons.download),
                label: Text(_exporting ? 'Building…' : 'Download ZIP'),
              )
            else
              FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Done'),
              ),
          ],
        );
      },
    );
  }
}
