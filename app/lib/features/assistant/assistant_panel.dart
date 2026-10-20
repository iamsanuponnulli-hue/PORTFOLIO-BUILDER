import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/js/pb_bridge.dart';
import '../../models/generated/models.dart';
import '../ai/ai_access.dart';
import '../ai/ai_providers.dart';
import '../ai/ai_repository.dart';
import '../editor/catalog.dart';
import '../editor/editor_controller.dart';

enum _Status { thinking, proposed, accepted, rejected, info, failed }

class _Turn {
  _Turn(this.prompt, {this.custom = false});
  final String prompt;
  final bool custom;
  var status = _Status.thinking;
  String summary = '';
  List<String> changes = const [];
  List<String> skipped = const [];
}

const _suggestions = [
  'Make it warmer and friendlier',
  'Use a dark theme',
  'Put my projects first',
  'Add a testimonials section after projects',
  'Make the headings bigger and bolder',
];

/// The AI assistant: a prompt becomes a list of changes, previewed before saving.
class AssistantPanel extends ConsumerStatefulWidget {
  const AssistantPanel({
    super.key,
    required this.editor,
    required this.catalog,
  });
  final EditorController editor;
  final Catalog catalog;

  @override
  ConsumerState<AssistantPanel> createState() => AssistantPanelState();
}

class AssistantPanelState extends ConsumerState<AssistantPanel> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _turns = <_Turn>[];
  var _customMode = false;

  /// Content changes the person unticked (indexes into the proposal's operations).
  final _skip = <int>{};

  EditorController get editor => widget.editor;
  bool get _busy => _turns.any((t) => t.status == _Status.thinking);

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Starts a request about one section (from the Sections panel).
  void askAbout(String sectionId, [String? prompt]) {
    editor.select(sectionId);
    if (prompt != null) _input.text = prompt;
  }

  Future<void> _send([String? text]) async {
    final prompt = (text ?? _input.text).trim();
    if (prompt.isEmpty || _busy) return;
    final ai = await ensureAi(context, ref, AiTier.smart);
    if (ai == null) {
      if (mounted) showNoAi(context);
      return;
    }
    if (editor.proposal != null) editor.discardProposal();
    final turn = _Turn(prompt, custom: _customMode);
    setState(() {
      _turns.add(turn);
      _input.clear();
      _skip.clear();
    });
    _scrollDown();
    final selected = editor.selected;
    final selectedSpec = editor.doc!.spec!.sections
        .where((s) => s.id == selected)
        .firstOrNull;
    try {
      final PbResult r;
      if (_customMode) {
        r = await editor.pb.invoke('ai', 'customSection', [
          ai.provider,
          ai.model,
          jsonEncode({
            'prompt': prompt,
            'state': editor.state,
            // Rewrite the selected custom section, or add a new one after it.
            if (selectedSpec?.custom == true) 'sectionId': selected,
            if (selectedSpec != null && selectedSpec.custom != true)
              'index': editor.doc!.spec!.sections.indexOf(selectedSpec) + 1,
          }),
        ]);
      } else {
        r = await editor.pb.invoke('ai', 'assistant', [
          ai.provider,
          ai.model,
          jsonEncode({
            'prompt': prompt,
            'state': editor.state,
            'selectionId': ?selected,
            'history': [
              for (final t in _turns.where((t) => t.status == _Status.accepted))
                {'prompt': t.prompt, 'summary': t.summary},
            ],
          }),
        ]);
      }
      final v = jsonMap(r.get<Object?>());
      final ops = jsonList(v['operations']);
      turn
        ..summary = (v['summary'] as String?)?.trim() ?? ''
        ..changes = ((v['changes'] as List?) ?? const []).cast<String>()
        ..skipped = ((v['skipped'] as List?) ?? const []).cast<String>();
      if (ops.isEmpty) {
        turn.status = _Status.info;
        if (turn.summary.isEmpty) {
          turn.summary = 'No changes came back. Try saying it differently, or pick a more capable model.';
        }
      } else {
        turn.status = _Status.proposed;
        editor.propose(
          Proposal(
            prompt: prompt,
            summary: turn.summary,
            operations: ops,
            changes: turn.changes,
            skipped: turn.skipped,
            contentChanges: ((v['contentChanges'] as List?) ?? const [])
                .cast<num>()
                .map((n) => n.toInt())
                .toList(),
            state: jsonMap(v['state']),
          ),
        );
      }
    } catch (e) {
      turn
        ..status = _Status.failed
        ..summary = e is PbException ? e.message : '$e';
      if (mounted) showAiError(context, e);
    }
    if (mounted) setState(() {});
    _scrollDown();
  }

  Future<void> _accept(_Turn turn) async {
    final p = editor.proposal;
    if (p == null) return;
    await editor.acceptProposal(skipContent: _skip);
    turn.status = _Status.accepted;
    setState(() {});
    try {
      await editor.session.flush();
      await ref
          .read(versionRepositoryProvider)
          .save(
            editor.session.projectId,
            editor.doc!,
            source: VersionSource.ASSISTANT,
            summary: p.summary.isEmpty ? p.changes.join('; ') : p.summary,
            prompt: p.prompt,
          );
    } catch (_) {
      // The change is saved; only the history entry failed.
    }
  }

  void _reject(_Turn turn) {
    editor.discardProposal();
    setState(() => turn.status = _Status.rejected);
  }

  void _scrollDown() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (_scroll.hasClients) {
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    }
  });

  String _describe(Map<String, dynamic> op) {
    final v = op['value'] ?? op['item'];
    final text = v is String ? v : jsonEncode(v);
    return '${op['path']}: ${text.length > 140 ? '${text.substring(0, 140)}…' : text}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    ref.watch(readyAiForTierProvider(AiTier.smart));
    return ListenableBuilder(
      listenable: editor,
      builder: (context, _) {
        final selected = editor.doc?.spec?.sections
            .where((s) => s.id == editor.selected)
            .firstOrNull;
        final proposal = editor.proposal;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: _turns.isEmpty
                  ? ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        Text(
                          'Ask for changes in your own words. You see them in the preview '
                          'before anything is saved, and your facts are never changed without your OK.',
                          style: theme.textTheme.bodySmall,
                        ),
                        const SizedBox(height: 12),
                        for (final s in _suggestions)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: ActionChip(
                              label: Text(s),
                              onPressed: () => _send(s),
                            ),
                          ),
                      ],
                    )
                  : ListView(
                      controller: _scroll,
                      padding: const EdgeInsets.all(12),
                      children: [
                        for (final t in _turns) ...[
                          Align(
                            alignment: Alignment.centerRight,
                            child: Container(
                              margin: const EdgeInsets.only(
                                bottom: 8,
                                left: 32,
                              ),
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.primaryContainer,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(t.prompt),
                            ),
                          ),
                          _TurnCard(
                            turn: t,
                            proposal: t.status == _Status.proposed
                                ? proposal
                                : null,
                            skip: _skip,
                            describe: _describe,
                            onToggle: (i, on) => setState(
                              () => on ? _skip.remove(i) : _skip.add(i),
                            ),
                            onAccept: () => _accept(t),
                            onReject: () => _reject(t),
                          ),
                          const SizedBox(height: 12),
                        ],
                      ],
                    ),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      if (selected != null)
                        InputChip(
                          key: const Key('assistant-selection'),
                          avatar: const Icon(Icons.ads_click, size: 16),
                          label: Text(
                            'About: ${widget.catalog.title(selected)}',
                          ),
                          onDeleted: () => editor.select(null),
                        ),
                      FilterChip(
                        key: const Key('custom-section-mode'),
                        label: Text(
                          selected?.custom == true
                              ? 'Rewrite this section\'s code'
                              : 'New custom section',
                        ),
                        selected: _customMode,
                        onSelected: (v) => setState(() => _customMode = v),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: TextField(
                          key: const Key('assistant-input'),
                          controller: _input,
                          minLines: 1,
                          maxLines: 5,
                          enabled: !_busy,
                          decoration: InputDecoration(
                            hintText: _customMode
                                ? 'Describe the section, e.g. "A timeline of my talks"'
                                : 'e.g. Make it warmer and put projects first',
                          ),
                          onSubmitted: (_) => _send(),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        key: const Key('assistant-send'),
                        tooltip: 'Send',
                        onPressed: _busy ? null : _send,
                        icon: _busy
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.arrow_upward),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _TurnCard extends StatelessWidget {
  const _TurnCard({
    required this.turn,
    required this.proposal,
    required this.skip,
    required this.describe,
    required this.onToggle,
    required this.onAccept,
    required this.onReject,
  });
  final _Turn turn;
  final Proposal? proposal;
  final Set<int> skip;
  final String Function(Map<String, dynamic>) describe;
  final void Function(int index, bool on) onToggle;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (turn.status == _Status.thinking) {
      return const ListTile(
        leading: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        title: Text('Working on it…'),
      );
    }
    final p = proposal;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (turn.summary.isNotEmpty) Text(turn.summary),
            if (turn.changes.isNotEmpty) ...[
              const SizedBox(height: 8),
              for (final c in turn.changes)
                Text('• $c', style: theme.textTheme.bodySmall),
            ],
            if (turn.skipped.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                'Skipped ${turn.skipped.length} change${turn.skipped.length == 1 ? '' : 's'} that didn\'t fit your site.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.outline,
                ),
              ),
            ],
            if (p != null && p.contentChanges.isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: theme.colorScheme.tertiaryContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'These change what your site says. Keep only what\'s true:',
                    ),
                    for (final i in p.contentChanges)
                      CheckboxListTile(
                        key: Key('content-change-$i'),
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        value: !skip.contains(i),
                        onChanged: (v) => onToggle(i, v == true),
                        title: Text(
                          describe(p.operations[i]),
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 8),
            switch (turn.status) {
              _Status.proposed when p != null => Row(
                children: [
                  Text(
                    'Showing in the preview',
                    style: theme.textTheme.labelSmall,
                  ),
                  const Spacer(),
                  TextButton(
                    key: const Key('reject-proposal'),
                    onPressed: onReject,
                    child: const Text('Reject'),
                  ),
                  FilledButton(
                    key: const Key('accept-proposal'),
                    onPressed: onAccept,
                    child: const Text('Accept'),
                  ),
                ],
              ),
              _Status.accepted => Text(
                'Applied. Undo with ↶ if you change your mind.',
                style: theme.textTheme.labelSmall,
              ),
              _Status.rejected || _Status.proposed => Text(
                'Not applied.',
                style: theme.textTheme.labelSmall,
              ),
              _Status.failed => Text(
                'Didn\'t work.',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
              _ => const SizedBox.shrink(),
            },
          ],
        ),
      ),
    );
  }
}
