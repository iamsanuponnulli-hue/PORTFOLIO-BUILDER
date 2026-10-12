import 'package:flutter/material.dart';

import '../../../models/generated/models.dart';
import '../../project/project_session.dart';
import '../widgets.dart';

extension PurposeLabel on Purpose {
  String get label => switch (this) {
    Purpose.JOB => 'Get hired',
    Purpose.FREELANCE => 'Win clients',
    Purpose.ACADEMIC => 'Academic / research',
    Purpose.PERSONAL => 'Personal site',
  };
}

extension ToneLabel on Tone {
  String get label => switch (this) {
    Tone.MINIMAL => 'Calm and minimal',
    Tone.BOLD => 'Bold',
    Tone.PLAYFUL => 'Warm and playful',
    Tone.ELEGANT => 'Elegant',
    Tone.TECHNICAL => 'Technical',
  };
}

extension ColorModeLabel on ColorMode {
  String get label => switch (this) {
    ColorMode.AUTO => 'Follow the visitor\'s setting',
    ColorMode.LIGHT => 'Light',
    ColorMode.DARK => 'Dark',
  };
}

/// Step 3: what the site is for and how it should feel.
class GoalsStep extends StatelessWidget {
  const GoalsStep({super.key, required this.session, required this.onNext});
  final ProjectSession session;
  final VoidCallback onNext;

  void _set(Goals Function(Goals g) change) =>
      session.update((d) => d.copyWith(goals: change(d.goals)));

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final g = session.doc!.goals;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('What is the site for?', style: theme.textTheme.headlineSmall),
        const SizedBox(height: 4),
        const Text('This decides what goes first and how the site sounds.'),
        const SizedBox(height: 20),
        SectionCard(
          title: 'Purpose',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final p in Purpose.values)
                    ChoiceChip(
                      key: Key('purpose-${p.name}'),
                      label: Text(p.label),
                      selected: g.purpose == p,
                      onSelected: (_) => _set((g) => g.copyWith(purpose: p)),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              SyncedField(
                key: const Key('target-role'),
                label: g.purpose == Purpose.FREELANCE
                    ? 'Services you offer'
                    : 'Role you\'re aiming for',
                hint: g.purpose == Purpose.FREELANCE
                    ? 'e.g. Brand identity for startups'
                    : 'e.g. Senior frontend engineer',
                value: g.targetRole,
                onChanged: (v) => _set((g) => g.copyWith(targetRole: v.trim())),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SectionCard(
          title: 'Look and feel',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final t in Tone.values)
                    ChoiceChip(
                      key: Key('tone-${t.name}'),
                      label: Text(t.label),
                      selected: g.tone == t,
                      onSelected: (_) => _set((g) => g.copyWith(tone: t)),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<ColorMode>(
                initialValue: g.colorMode,
                decoration: const InputDecoration(labelText: 'Light or dark'),
                items: [
                  for (final m in ColorMode.values)
                    DropdownMenuItem(value: m, child: Text(m.label)),
                ],
                onChanged: (m) => _set((g) => g.copyWith(colorMode: m)),
              ),
              const SizedBox(height: 12),
              SyncedField(
                label: 'Colours you like (optional)',
                hint: 'e.g. deep green, nothing too bright',
                value: g.colorPreference,
                onChanged: (v) =>
                    _set((g) => g.copyWith(colorPreference: v.trim())),
              ),
              const SizedBox(height: 12),
              SyncedField(
                label: 'Anything else (optional)',
                hint: 'e.g. Put my case studies first',
                minLines: 2,
                maxLines: 6,
                value: g.notes,
                onChanged: (v) => _set((g) => g.copyWith(notes: v.trim())),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton(
            key: const Key('next'),
            onPressed: onNext,
            child: const Text('Next: review'),
          ),
        ),
      ],
    );
  }
}
