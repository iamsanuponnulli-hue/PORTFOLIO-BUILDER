import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/js/pb_bridge.dart';
import '../../core/ui/feedback.dart';
import '../../models/generated/models.dart';
import '../ai/ai_access.dart';
import '../ai/ai_providers.dart';
import '../ai/ai_repository.dart';
import '../project/project_session.dart';

/// The content assistant: better wording, taglines and case studies. It never
/// invents facts: where a number would help it leaves a placeholder like [X%],
/// which blocks export until filled in.

/// Text to polish: where it lives in the content (as JSON path) and a label.
class TextItem {
  const TextItem(this.path, this.label, this.text);
  final List<Object> path;
  final String label;
  final String text;
}

/// Sets a value inside decoded JSON (maps by key, lists by index).
void setJsonPath(Object root, List<Object> path, Object? value) {
  Object node = root;
  for (final key in path.take(path.length - 1)) {
    node = node is List
        ? node[key as int] as Object
        : (node as Map)[key] as Object;
  }
  final last = path.last;
  if (node is List) {
    node[last as int] = value;
  } else {
    (node as Map)[last] = value;
  }
}

void _editContent(
  ProjectSession session,
  void Function(Map<String, dynamic> json) change,
) => session.update((d) {
  final j = jsonDecode(jsonEncode(d.content.toJson())) as Map<String, dynamic>;
  change(j);
  return d.copyWith(content: PortfolioContent.fromJson(j));
});

/// Rewrites [items] with the person's fast model, then lets them pick which to keep.
Future<void> polishText(
  BuildContext context,
  WidgetRef ref,
  ProjectSession session, {
  required String what,
  required List<TextItem> items,
}) async {
  final todo = items.where((i) => i.text.trim().isNotEmpty).toList();
  if (todo.isEmpty) {
    showMessage(context, 'There\'s no text to improve yet.');
    return;
  }
  final ai = await ensureAi(context, ref, AiTier.fast);
  if (ai == null) {
    if (context.mounted) showNoAi(context);
    return;
  }
  if (!context.mounted) return;
  final goals = session.doc!.goals;
  final result = await _withProgress<List<String>>(
    context,
    'Improving the wording…',
    () async {
      final r = await ref.read(pbBridgeProvider).invoke('ai', 'rewrite', [
        ai.provider,
        ai.model,
        jsonEncode({
          'context': what,
          'items': [for (final i in todo) i.text],
          'targetRole': goals.targetRole,
          'tone': toneValues.reverse[goals.tone],
        }),
      ]);
      return (jsonMap(r.get<Object?>())['items'] as List).cast<String>();
    },
  );
  if (result == null || !context.mounted) return;
  final changed = [
    for (final (i, item) in todo.indexed)
      if (i < result.length && result[i].trim() != item.text.trim())
        (item, result[i].trim()),
  ];
  if (changed.isEmpty) {
    showMessage(context, 'It already reads well. Nothing to change.');
    return;
  }
  final keep = await showDialog<Set<int>>(
    context: context,
    builder: (_) => _ReviewDialog(changes: changed),
  );
  if (keep == null || keep.isEmpty) return;
  _editContent(session, (j) {
    for (final i in keep) {
      setJsonPath(j, changed[i].$1.path, changed[i].$2);
    }
  });
  if (context.mounted &&
      keep.any((i) => RegExp(r'\[(X|N|#|\?|TBD)').hasMatch(changed[i].$2))) {
    showMessage(
      context,
      'Fill in the placeholders like [X%] with real numbers (or remove them) before exporting.',
    );
  }
}

/// Three tagline ideas; the chosen one becomes the profile tagline.
Future<void> suggestTagline(
  BuildContext context,
  WidgetRef ref,
  ProjectSession session,
) async {
  final ai = await ensureAi(context, ref, AiTier.fast);
  if (ai == null) {
    if (context.mounted) showNoAi(context);
    return;
  }
  if (!context.mounted) return;
  final d = session.doc!;
  final p = d.content.profile;
  final options = await _withProgress<List<String>>(
    context,
    'Writing tagline ideas…',
    () async {
      final r = await ref.read(pbBridgeProvider).invoke('ai', 'taglines', [
        ai.provider,
        ai.model,
        jsonEncode({
          'name': p.name,
          'headline': p.headline,
          'bio': p.bio,
          'highlights': [
            for (final e in d.content.experience.take(3))
              '${e.role} at ${e.company}',
            for (final x in d.content.projects.take(3)) x.title,
          ],
          'targetRole': d.goals.targetRole,
          'tone': toneValues.reverse[d.goals.tone],
        }),
      ]);
      return (jsonMap(r.get<Object?>())['options'] as List).cast<String>();
    },
  );
  if (options == null || options.isEmpty || !context.mounted) return;
  final picked = await showDialog<String>(
    context: context,
    builder: (context) => SimpleDialog(
      title: const Text('Pick a tagline'),
      children: [
        for (final o in options)
          SimpleDialogOption(
            onPressed: () => Navigator.pop(context, o),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text(o),
            ),
          ),
      ],
    ),
  );
  if (picked != null) {
    _editContent(session, (j) => (j['profile'] as Map)['tagline'] = picked);
  }
}

const caseStudyQuestions = [
  ('problem', 'What problem were you solving, and for whom?'),
  ('role', 'What was your role, and who did you work with?'),
  (
    'process',
    'How did you approach it? Key decisions, trade-offs, what you tried.',
  ),
  ('outcome', 'What happened in the end? Results, numbers, what you learned.'),
];

/// Asks four questions about a project, then writes its case study (with AI) or
/// keeps the answers as written (without).
Future<void> caseStudyInterview(
  BuildContext context,
  WidgetRef ref,
  ProjectSession session,
  int projectIndex,
) async {
  final project = session.doc!.content.projects[projectIndex];
  final answers = await showDialog<Map<String, String>>(
    context: context,
    builder: (_) => _InterviewDialog(project: project),
  );
  if (answers == null || !context.mounted) return;
  var study = {...answers, 'body': project.caseStudy?.body ?? ''};
  final ai = await ref.read(readyAiForTierProvider(AiTier.smart).future);
  if (ai != null && context.mounted) {
    final written = await _withProgress<Map<String, dynamic>>(
      context,
      'Writing your case study…',
      () async {
        final r = await ref.read(pbBridgeProvider).invoke('ai', 'caseStudy', [
          ai.provider,
          ai.model,
          jsonEncode({
            'title': project.title,
            'summary': project.summary,
            'tech': project.tech,
            'answers': answers,
          }),
        ]);
        return jsonMap(jsonMap(r.get<Object?>())['caseStudy']);
      },
    );
    if (written != null) {
      study = {
        for (final k in ['problem', 'role', 'process', 'outcome', 'body'])
          k: (written[k] as String?)?.trim().isNotEmpty == true
              ? written[k] as String
              : study[k] ?? '',
      };
    }
  }
  session.update((d) {
    final projects = [...d.content.projects];
    projects[projectIndex] = projects[projectIndex].copyWith(
      caseStudy: CaseStudy.fromJson(study),
    );
    final spec = d.spec;
    return d.copyWith(
      content: d.content.copyWith(projects: projects),
      // A case study is shown on its own page.
      spec: spec?.copyWith(pages: spec.pages.copyWith(caseStudies: true)),
    );
  });
  if (context.mounted) {
    showMessage(
      context,
      'Case study saved. It has its own page, linked from the project.',
    );
  }
}

Future<T?> _withProgress<T>(
  BuildContext context,
  String message,
  Future<T> Function() work,
) async {
  final nav = Navigator.of(context);
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => AlertDialog(
      content: Row(
        children: [
          const CircularProgressIndicator(),
          const SizedBox(width: 20),
          Expanded(child: Text(message)),
        ],
      ),
    ),
  );
  try {
    final r = await work();
    nav.pop();
    return r;
  } catch (e) {
    nav.pop();
    if (context.mounted) showAiError(context, e);
    return null;
  }
}

class _ReviewDialog extends StatefulWidget {
  const _ReviewDialog({required this.changes});
  final List<(TextItem, String)> changes;

  @override
  State<_ReviewDialog> createState() => _ReviewDialogState();
}

class _ReviewDialogState extends State<_ReviewDialog> {
  late final _keep = {for (var i = 0; i < widget.changes.length; i++) i};

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: const Text('Suggested wording'),
      content: SizedBox(
        width: 640,
        child: ListView(
          shrinkWrap: true,
          children: [
            Text(
              'Untick anything that isn\'t right. Placeholders like [X%] mark where a real number would help.',
              style: theme.textTheme.bodySmall,
            ),
            for (final (i, (item, after)) in widget.changes.indexed)
              CheckboxListTile(
                key: Key('rewrite-$i'),
                contentPadding: EdgeInsets.zero,
                value: _keep.contains(i),
                onChanged: (v) =>
                    setState(() => v == true ? _keep.add(i) : _keep.remove(i)),
                title: Text(after),
                subtitle: Text(
                  '${item.label} · was: ${item.text}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    decoration: TextDecoration.lineThrough,
                  ),
                ),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          key: const Key('apply-rewrites'),
          onPressed: () => Navigator.pop(context, _keep),
          child: Text('Use ${_keep.length}'),
        ),
      ],
    );
  }
}

class _InterviewDialog extends StatefulWidget {
  const _InterviewDialog({required this.project});
  final ProjectItem project;

  @override
  State<_InterviewDialog> createState() => _InterviewDialogState();
}

class _InterviewDialogState extends State<_InterviewDialog> {
  late final _c = {
    for (final (k, _) in caseStudyQuestions)
      k: TextEditingController(
        text: (widget.project.caseStudy?.toJson()[k] as String?) ?? '',
      ),
  };

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Case study: ${widget.project.title}'),
      content: SizedBox(
        width: 600,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Answer in your own words; notes are fine. With an AI connected, your answers '
                'are turned into a tidy case study. Only what you write is used.',
              ),
              for (final (k, q) in caseStudyQuestions) ...[
                const SizedBox(height: 16),
                TextField(
                  key: Key('case-$k'),
                  controller: _c[k],
                  minLines: 2,
                  maxLines: 8,
                  decoration: InputDecoration(labelText: q),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          key: const Key('save-case-study'),
          onPressed: () => Navigator.pop(context, {
            for (final MapEntry(:key, :value) in _c.entries)
              key: value.text.trim(),
          }),
          child: const Text('Save'),
        ),
      ],
    );
  }
}
