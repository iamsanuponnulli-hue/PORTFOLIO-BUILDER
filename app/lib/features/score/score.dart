import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/js/pb_bridge.dart';
import '../ai/ai_providers.dart';
import '../ai/ai_repository.dart';
import '../editor/editor_controller.dart';

class Finding {
  const Finding({
    required this.id,
    required this.category,
    required this.severity,
    required this.message,
    this.sectionId,
    this.path,
    this.fix,
    this.fixLabel,
    required this.json,
  });
  final String id;
  final String category;
  final String severity;
  final String message;
  final String? sectionId;
  final String? path;
  final String? fix;
  final String? fixLabel;
  final Map<String, dynamic> json;

  factory Finding.fromJson(Map<String, dynamic> j) => Finding(
    id: j['id'] as String,
    category: j['category'] as String,
    severity: j['severity'] as String,
    message: j['message'] as String,
    sectionId: j['sectionId'] as String?,
    path: j['path'] as String?,
    fix: j['fix'] as String?,
    fixLabel: j['fixLabel'] as String?,
    json: j,
  );
}

class Score {
  const Score(this.total, this.categories, this.findings, this.full);
  final int total;
  final Map<String, int> categories;
  final List<Finding> findings;
  final bool full;

  factory Score.fromJson(Map<String, dynamic> j) => Score(
    (j['total'] as num).toInt(),
    {
      for (final MapEntry(:key, :value) in jsonMap(j['categories']).entries)
        key: (value as num).toInt(),
    },
    jsonList(j['findings']).map(Finding.fromJson).toList(),
    j['full'] == true,
  );

  /// Problems that stop a download (e.g. placeholders like [X%] left in).
  List<Finding> get blocking => findings
      .where(
        (f) =>
            f.severity == 'error' &&
            !f.id.startsWith('axe-') &&
            !f.id.startsWith('overflow-'),
      )
      .toList();
}

const categoryLabels = {
  'accessibility': 'Accessibility',
  'content': 'Content',
  'seo': 'Search & sharing',
  'performance': 'Speed',
  'responsive': 'Phones & tablets',
};

/// Keeps the portfolio score up to date: instant checks after every change, full
/// checks (axe-core, three widths) when asked and before export.
class ScoreTracker extends ChangeNotifier {
  ScoreTracker(this.editor) {
    editor.addListener(_changed);
  }

  final EditorController editor;
  PbBridge get pb => editor.pb;

  Score? score;
  bool runningFull = false;
  String? error;
  Map<String, dynamic>? _full;
  String? _fullKey;
  String? _scoredKey;
  Timer? _timer;
  bool _disposed = false;

  String get _key => jsonEncode(editor.state);

  void _changed() {
    if (editor.doc?.spec == null || editor.proposal != null) return;
    _timer?.cancel();
    _timer = Timer(const Duration(milliseconds: 600), refresh);
  }

  Future<void> refresh() async {
    final d = editor.doc;
    if (_disposed || d?.spec == null) return;
    final key = _key;
    if (key == _scoredKey) return;
    _scoredKey = key;
    final full = _fullKey == key ? _full : null;
    final r = await pb.invoke('site', 'score', [
      editor.session.projectId,
      key,
      full == null ? '' : jsonEncode(full),
    ]);
    if (_disposed || !r.ok) return;
    score = Score.fromJson(jsonMap(r.value));
    // Shown on the dashboard; written only when it changes.
    if (editor.doc!.score != score!.total) {
      editor.session.update((p) => p.copyWith(score: score!.total));
    }
    notifyListeners();
  }

  /// Accessibility, layout at 3 widths and links, in hidden previews.
  Future<void> runFull() async {
    if (runningFull) return;
    runningFull = true;
    error = null;
    notifyListeners();
    try {
      final key = _key;
      final r = await pb.invoke('checks', 'full', [jsonEncode(editor.files)]);
      _full = jsonMap(r.get<Object?>());
      _fullKey = key;
      _scoredKey = null;
      await refresh();
    } on PbException catch (e) {
      error = e.message;
    } finally {
      runningFull = false;
      if (!_disposed) notifyListeners();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    editor.removeListener(_changed);
    super.dispose();
  }
}

/// Applies a finding's fix. Returns false when the person has to act (e.g. open
/// a panel), which [openPanel] then does.
Future<bool> applyFix(
  WidgetRef ref,
  EditorController editor,
  Finding f, {
  required void Function(String panel) openPanel,
}) async {
  switch (f.fix) {
    case 'contactSettings':
    case 'siteAddress':
      openPanel('site');
      return false;
    case 'editContent':
      openPanel('content');
      return false;
  }
  final pb = editor.pb;
  final state = jsonEncode(editor.state);
  // The AI writes better descriptions when one is connected; plain rules otherwise.
  if (f.fix == 'seoDescription' || f.fix == 'altText') {
    final ai = await ref.read(readyAiForTierProvider(AiTier.fast).future);
    if (ai != null) {
      final r = f.fix == 'seoDescription'
          ? await pb.invoke('ai', 'metaDescription', [
              ai.provider,
              ai.model,
              state,
            ])
          : await pb.invoke('ai', 'altTexts', [
              ai.provider,
              ai.model,
              editor.session.projectId,
              state,
            ]);
      if (r.ok) {
        final ops = jsonList(jsonMap(r.value)['operations']);
        if (ops.isNotEmpty) {
          await editor.apply(ops);
          return true;
        }
      }
      // Fall through to the plain fix (e.g. the model can't see images).
    }
  }
  final r = await pb.invoke('site', 'fix', [state, jsonEncode(f.json)]);
  final ops = r.ok && r.value != null
      ? jsonList(r.value)
      : const <Map<String, dynamic>>[];
  if (ops.isEmpty) return false;
  await editor.apply(ops);
  return true;
}

Color scoreColor(BuildContext context, int v) {
  final c = Theme.of(context).colorScheme;
  return v >= 85
      ? Colors.green.shade700
      : v >= 60
      ? Colors.orange.shade800
      : c.error;
}

/// The score with categories and findings, each with its fix.
class ScorePanel extends ConsumerStatefulWidget {
  const ScorePanel({
    super.key,
    required this.tracker,
    required this.openPanel,
    this.onlyBlocking = false,
  });
  final ScoreTracker tracker;
  final void Function(String panel) openPanel;

  /// Shows only what stops the download (used in the export dialog).
  final bool onlyBlocking;

  @override
  ConsumerState<ScorePanel> createState() => _ScorePanelState();
}

class _ScorePanelState extends ConsumerState<ScorePanel> {
  String? _fixing;

  Future<void> _fix(Finding f) async {
    setState(() => _fixing = f.id);
    try {
      await applyFix(
        ref,
        widget.tracker.editor,
        f,
        openPanel: (p) {
          Navigator.of(context).maybePop();
          widget.openPanel(p);
        },
      );
    } finally {
      if (mounted) setState(() => _fixing = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListenableBuilder(
      listenable: widget.tracker,
      builder: (context, _) {
        final s = widget.tracker.score;
        if (s == null) {
          return const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        final findings = widget.onlyBlocking ? s.blocking : s.findings;
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (!widget.onlyBlocking) ...[
              Row(
                children: [
                  Text(
                    '${s.total}',
                    key: const Key('score-total'),
                    style: theme.textTheme.displaySmall?.copyWith(
                      color: scoreColor(context, s.total),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      s.full
                          ? 'Includes the full check (accessibility, phones and tablets).'
                          : 'Quick checks only. Run the full check for accessibility and layout on phones.',
                      style: theme.textTheme.bodySmall,
                    ),
                  ),
                  OutlinedButton(
                    key: const Key('run-full-check'),
                    onPressed: widget.tracker.runningFull
                        ? null
                        : widget.tracker.runFull,
                    child: Text(
                      widget.tracker.runningFull ? 'Checking…' : 'Full check',
                    ),
                  ),
                ],
              ),
              if (widget.tracker.error != null)
                Text(
                  widget.tracker.error!,
                  style: TextStyle(color: theme.colorScheme.error),
                ),
              const SizedBox(height: 12),
              for (final MapEntry(:key, value: label) in categoryLabels.entries)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    children: [
                      SizedBox(width: 140, child: Text(label)),
                      Expanded(
                        child: LinearProgressIndicator(
                          value: (s.categories[key] ?? 100) / 100,
                          color: scoreColor(context, s.categories[key] ?? 100),
                          minHeight: 6,
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                      SizedBox(
                        width: 40,
                        child: Text(
                          '${s.categories[key] ?? 100}',
                          textAlign: TextAlign.end,
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 12),
            ],
            if (findings.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  widget.onlyBlocking
                      ? 'Nothing stops the download.'
                      : 'Nothing to fix. Nice work.',
                ),
              ),
            for (final f in findings)
              ListTile(
                key: Key('finding-${f.id}'),
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: Icon(
                  switch (f.severity) {
                    'error' => Icons.error_outline,
                    'warning' => Icons.warning_amber_outlined,
                    _ => Icons.info_outline,
                  },
                  color: f.severity == 'error'
                      ? theme.colorScheme.error
                      : f.severity == 'warning'
                      ? Colors.orange.shade800
                      : theme.colorScheme.outline,
                ),
                title: Text(f.message),
                subtitle: Text(categoryLabels[f.category] ?? f.category),
                trailing: f.fix == null
                    ? null
                    : TextButton(
                        key: Key('fix-${f.id}'),
                        onPressed: _fixing == null ? () => _fix(f) : null,
                        child: Text(
                          _fixing == f.id ? 'Fixing…' : (f.fixLabel ?? 'Fix'),
                        ),
                      ),
              ),
          ],
        );
      },
    );
  }
}
