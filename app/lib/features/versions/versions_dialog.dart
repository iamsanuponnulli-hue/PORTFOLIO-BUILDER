import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/ui/feedback.dart';
import '../../models/generated/models.dart';
import '../editor/editor_controller.dart';
import 'version_repository.dart';

String sourceLabel(VersionSource s) => switch (s) {
  VersionSource.GENERATE => 'Design chosen',
  VersionSource.MANUAL => 'Saved by you',
  VersionSource.ASSISTANT => 'Assistant',
  VersionSource.REGENERATE => 'New design',
  VersionSource.IMPORT => 'Imported',
  VersionSource.RESTORE => 'Restored',
};

/// Saves the current site as a named version.
Future<void> saveVersion(
  BuildContext context,
  WidgetRef ref,
  EditorController editor,
) async {
  final c = TextEditingController();
  final name = await showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Save a version'),
      content: TextField(
        key: const Key('version-name'),
        controller: c,
        autofocus: true,
        maxLength: 120,
        decoration: const InputDecoration(
          labelText: 'Name (optional)',
          hintText: 'e.g. Before the redesign',
        ),
        onSubmitted: (v) => Navigator.pop(context, v),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          key: const Key('save-version-confirm'),
          onPressed: () => Navigator.pop(context, c.text),
          child: const Text('Save'),
        ),
      ],
    ),
  );
  c.dispose();
  if (name == null) return;
  try {
    await editor.session.flush();
    await ref
        .read(versionRepositoryProvider)
        .save(
          editor.session.projectId,
          editor.doc!,
          source: VersionSource.MANUAL,
          summary: name.trim().isEmpty ? 'Saved version' : name.trim(),
        );
    if (context.mounted) showMessage(context, 'Version saved.');
  } catch (e) {
    if (context.mounted) showMessage(context, 'Couldn\'t save the version: $e');
  }
}

/// History: the 30 newest versions, with compare and restore.
Future<void> showVersions(
  BuildContext context,
  WidgetRef ref,
  EditorController editor,
) => showDialog<void>(
  context: context,
  builder: (_) => _VersionsDialog(editor: editor),
);

class _VersionsDialog extends ConsumerStatefulWidget {
  const _VersionsDialog({required this.editor});
  final EditorController editor;

  @override
  ConsumerState<_VersionsDialog> createState() => _VersionsDialogState();
}

class _VersionsDialogState extends ConsumerState<_VersionsDialog> {
  late Future<List<VersionEntry>> _list = _load();
  String? _comparing;
  List<String> _changes = const [];

  Future<List<VersionEntry>> _load() =>
      ref.read(versionRepositoryProvider).list(widget.editor.session.projectId);

  Future<void> _compare(VersionEntry v) async {
    final snap = jsonDecode(v.doc.snapshot) as Map<String, dynamic>;
    if (snap['spec'] == null) return;
    final r = await widget.editor.pb.invoke('site', 'changes', [
      jsonEncode(snap),
      jsonEncode(widget.editor.state),
    ]);
    if (!mounted) return;
    setState(() {
      _comparing = v.id;
      _changes = r.ok
          ? (r.value as List).cast<String>()
          : [r.errorMessage ?? 'Couldn\'t compare.'];
    });
  }

  Future<void> _restore(VersionEntry v) async {
    final ok = await confirm(
      context,
      title: 'Restore this version?',
      message:
          'Your site goes back to how it was. Your current version stays in history, '
          'and you can undo this.',
      action: 'Restore',
    );
    if (!ok || !mounted) return;
    final editor = widget.editor;
    final repo = ref.read(versionRepositoryProvider);
    final id = editor.session.projectId;
    try {
      // Keep what's there now, so restoring can itself be undone later.
      await repo.save(
        id,
        editor.doc!,
        source: VersionSource.MANUAL,
        summary: 'Before restoring "${v.doc.summary}"',
      );
      editor.session.update((d) => restoreSnapshot(d, v.doc));
      await repo.save(
        id,
        editor.doc!,
        source: VersionSource.RESTORE,
        summary: 'Restored "${v.doc.summary}"',
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) showMessage(context, 'Couldn\'t restore: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: const Text('History'),
      content: SizedBox(
        width: 560,
        height: 480,
        child: FutureBuilder<List<VersionEntry>>(
          future: _list,
          builder: (context, snap) {
            if (snap.hasError) {
              return const Center(
                child: Text('Couldn\'t load history. Check your connection.'),
              );
            }
            if (!snap.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final list = snap.data!;
            if (list.isEmpty) {
              return const Center(
                child: Text(
                  'No versions yet. Choosing a design, accepting assistant changes and '
                  '"Save version" add them here.',
                  textAlign: TextAlign.center,
                ),
              );
            }
            return ListView(
              children: [
                for (final v in list) ...[
                  ListTile(
                    key: Key('version-${v.id}'),
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      v.doc.summary.isEmpty
                          ? sourceLabel(v.doc.source)
                          : v.doc.summary,
                    ),
                    subtitle: Text(
                      '${sourceLabel(v.doc.source)} · '
                      '${relativeTime(DateTime.fromMillisecondsSinceEpoch(v.doc.createdAt))}'
                      '${v.doc.prompt.isEmpty ? '' : ' · "${v.doc.prompt}"'}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    trailing: Wrap(
                      children: [
                        TextButton(
                          onPressed: () => _compare(v),
                          child: const Text('Compare'),
                        ),
                        TextButton(
                          key: Key('restore-${v.id}'),
                          onPressed: () => _restore(v),
                          child: const Text('Restore'),
                        ),
                      ],
                    ),
                  ),
                  if (_comparing == v.id)
                    Container(
                      padding: const EdgeInsets.all(12),
                      margin: const EdgeInsets.only(bottom: 8),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        _changes.isEmpty
                            ? 'Same as now.'
                            : 'Since this version:\n${_changes.map((c) => '• $c').join('\n')}',
                      ),
                    ),
                ],
              ],
            );
          },
        ),
      ),
      actions: [
        TextButton(
          onPressed: () async {
            await saveVersion(context, ref, widget.editor);
            setState(() => _list = _load());
          },
          child: const Text('Save current version'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Close'),
        ),
      ],
    );
  }
}
