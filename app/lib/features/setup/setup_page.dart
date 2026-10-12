import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../models/profile_types.dart';
import '../project/drafts.dart';
import '../project/project_session.dart';
import 'steps/content_step.dart';
import 'steps/goals_step.dart';
import 'steps/import_step.dart';
import 'steps/review_step.dart';

enum SetupStep {
  import('Import', 'Bring in what you have'),
  content('Content', 'Check and complete'),
  goals('Goals', 'What the site is for'),
  review('Review', 'Create your site');

  const SetupStep(this.label, this.blurb);
  final String label;
  final String blurb;

  static SetupStep parse(String? s) =>
      values.where((v) => v.name == s).firstOrNull ?? SetupStep.import;
}

/// The setup wizard for a new portfolio (profile type was chosen when it was created).
class SetupPage extends ConsumerStatefulWidget {
  const SetupPage({super.key, required this.projectId, required this.step});
  final String projectId;
  final SetupStep step;

  @override
  ConsumerState<SetupPage> createState() => _SetupPageState();
}

class _SetupPageState extends ConsumerState<SetupPage> {
  late final ProjectSession session = ProjectSession(
    projectId: widget.projectId,
    repo: ref.read(projectRepositoryProvider),
    drafts: BridgeDraftStore(ref.read(pbBridgeProvider)),
  )..load();

  @override
  void dispose() {
    session.flush().whenComplete(session.dispose);
    super.dispose();
  }

  void go(SetupStep step) {
    session.flush();
    context.go('/p/${widget.projectId}/setup?step=${step.name}');
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final doc = session.doc;
        return Scaffold(
          appBar: AppBar(
            leading: IconButton(
              tooltip: 'Back to portfolios',
              icon: const Icon(Icons.arrow_back),
              onPressed: () {
                session.flush();
                context.go('/');
              },
            ),
            title: Text(doc?.name ?? 'New portfolio'),
            actions: [
              SyncIndicator(session: session),
              const SizedBox(width: 16),
            ],
          ),
          body: switch ((session.loaded, session.missing)) {
            (_, true) => const Center(
              child: Text('This portfolio doesn\'t exist.'),
            ),
            (false, _) => const Center(child: CircularProgressIndicator()),
            _ => Column(
              children: [
                _StepBar(
                  current: widget.step,
                  onTap: go,
                  profile: doc!.profileType.label,
                ),
                if (session.syncState == SyncState.conflict)
                  MaterialBanner(
                    content: const Text(
                      'This portfolio was changed in another tab or device.',
                    ),
                    actions: [
                      TextButton(
                        onPressed: session.reload,
                        child: const Text('Load the newer version'),
                      ),
                    ],
                  ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 820),
                        child: switch (widget.step) {
                          SetupStep.import => ImportStep(
                            session: session,
                            onNext: () => go(SetupStep.content),
                          ),
                          SetupStep.content => ContentStep(
                            session: session,
                            onNext: () => go(SetupStep.goals),
                          ),
                          SetupStep.goals => GoalsStep(
                            session: session,
                            onNext: () => go(SetupStep.review),
                          ),
                          SetupStep.review => ReviewStep(
                            session: session,
                            onEdit: () => go(SetupStep.content),
                          ),
                        },
                      ),
                    ),
                  ),
                ),
              ],
            ),
          },
        );
      },
    );
  }
}

class _StepBar extends StatelessWidget {
  const _StepBar({
    required this.current,
    required this.onTap,
    required this.profile,
  });
  final SetupStep current;
  final ValueChanged<SetupStep> onTap;
  final String profile;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surfaceContainerLow,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(profile, style: theme.textTheme.labelLarge),
            const SizedBox(width: 8),
            for (final (i, s) in SetupStep.values.indexed)
              ChoiceChip(
                key: Key('step-${s.name}'),
                label: Text('${i + 1}. ${s.label}'),
                selected: s == current,
                onSelected: (_) => onTap(s),
                tooltip: s.blurb,
              ),
          ],
        ),
      ),
    );
  }
}

/// "Saved on this computer" / "Synced" status.
class SyncIndicator extends StatelessWidget {
  const SyncIndicator({super.key, required this.session});
  final ProjectSession session;

  @override
  Widget build(BuildContext context) {
    final (icon, text) = switch (session.syncState) {
      SyncState.synced => (Icons.cloud_done_outlined, 'Saved'),
      SyncState.savedOnDevice => (
        Icons.save_outlined,
        'Saved on this computer',
      ),
      SyncState.syncing => (Icons.cloud_upload_outlined, 'Syncing…'),
      SyncState.offline => (
        Icons.cloud_off_outlined,
        'Saved on this computer · will sync later',
      ),
      SyncState.conflict => (Icons.warning_amber_outlined, 'Changed elsewhere'),
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 18),
        const SizedBox(width: 6),
        Text(text, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}
