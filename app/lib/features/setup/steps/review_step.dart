import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/ui/feedback.dart';
import '../../../models/generated/models.dart';
import '../../project/project_session.dart';
import '../widgets.dart';

/// The built-in design each tone starts from (renderer preset ids).
String presetForTone(Tone tone) => switch (tone) {
  Tone.MINIMAL => 'calm',
  Tone.BOLD => 'bold',
  Tone.PLAYFUL => 'warm',
  Tone.ELEGANT => 'editorial',
  Tone.TECHNICAL => 'technical',
};

class ReviewItem {
  const ReviewItem(this.label, this.done, {this.required = false});
  final String label;
  final bool done;
  final bool required;
}

/// What's in place before creating the site. Only a name is required.
List<ReviewItem> reviewItems(ProjectDoc doc) {
  final c = doc.content;
  final p = c.profile;
  return [
    ReviewItem('Your name', p.name.trim().isNotEmpty, required: true),
    ReviewItem('A headline', p.headline.trim().isNotEmpty),
    ReviewItem('A few sentences about you', p.bio.trim().length >= 40),
    ReviewItem('A photo', p.photo != null),
    ReviewItem('Links (GitHub, LinkedIn…)', p.socials.isNotEmpty),
    ReviewItem(
      'Experience or projects',
      c.experience.isNotEmpty || c.projects.isNotEmpty,
    ),
    ReviewItem('Skills', c.skills.any((g) => g.items.isNotEmpty)),
  ];
}

/// Last step: check what's there, then see designs (or use a ready-made one).
class ReviewStep extends ConsumerStatefulWidget {
  const ReviewStep({super.key, required this.session, required this.onEdit});
  final ProjectSession session;
  final VoidCallback onEdit;

  @override
  ConsumerState<ReviewStep> createState() => _ReviewStepState();
}

class _ReviewStepState extends ConsumerState<ReviewStep> {
  bool _creating = false;

  Future<void> _seeDesigns() async {
    await widget.session.flush();
    if (mounted) context.go('/p/${widget.session.projectId}/designs');
  }

  /// Skips the design choice: the profile type's layout with the tone's theme.
  Future<void> _create() async {
    final doc = widget.session.doc!;
    setState(() => _creating = true);
    try {
      final specJson = await ref
          .read(pbBridgeProvider)
          .defaultSpec(
            profileTypeValues.reverse[doc.profileType]!,
            presetForTone(doc.goals.tone),
          );
      final spec = SiteSpec.fromJson(
        jsonDecode(specJson) as Map<String, dynamic>,
      );
      widget.session.update(
        (d) => d.copyWith(
          spec: spec.copyWith(
            theme: spec.theme.copyWith(colorMode: d.goals.colorMode),
          ),
          status: ProjectStatus.EDITING,
        ),
      );
      await widget.session.flush();
      if (mounted) context.go('/p/${widget.session.projectId}');
    } catch (e) {
      if (mounted) showMessage(context, 'Couldn\'t create the site: $e');
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final items = reviewItems(widget.session.doc!);
    final ready = items.where((i) => i.required).every((i) => i.done);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Ready to create your site', style: theme.textTheme.headlineSmall),
        const SizedBox(height: 4),
        const Text(
          'Missing pieces are fine: sections without content are left out, and you can add them later.',
        ),
        const SizedBox(height: 20),
        SectionCard(
          title: 'Checklist',
          trailing: TextButton(
            onPressed: widget.onEdit,
            child: const Text('Edit content'),
          ),
          child: Column(
            children: [
              for (final i in items)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    i.done ? Icons.check_circle : Icons.radio_button_unchecked,
                    color: i.done
                        ? theme.colorScheme.primary
                        : theme.colorScheme.outline,
                  ),
                  title: Text(i.label),
                  trailing: i.required && !i.done
                      ? const Text('Required')
                      : null,
                ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Wrap(
          alignment: WrapAlignment.end,
          spacing: 12,
          runSpacing: 12,
          children: [
            OutlinedButton(
              key: const Key('create-site'),
              onPressed: !ready || _creating ? null : _create,
              child: Text(
                _creating ? 'Creating…' : 'Skip: use a ready-made design',
              ),
            ),
            FilledButton.icon(
              key: const Key('see-designs'),
              onPressed: !ready || _creating ? null : _seeDesigns,
              icon: const Icon(Icons.auto_awesome),
              label: const Text('See 3 designs'),
            ),
          ],
        ),
      ],
    );
  }
}
