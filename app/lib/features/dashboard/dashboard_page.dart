import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/js/pb_bridge.dart';
import '../../core/ui/feedback.dart';
import '../../models/generated/models.dart' hide Colors;
import '../../models/profile_types.dart';
import 'project_dialogs.dart';
import 'project_repository.dart';

const maxProjects = 5;

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  Future<void> _create(BuildContext context, WidgetRef ref) async {
    final result = await showNewProjectDialog(context);
    if (result == null || !context.mounted) return;
    final uid = ref.read(authUserProvider).value!.uid;
    try {
      final id = await ref
          .read(projectRepositoryProvider)
          .create(uid: uid, name: result.name, profileType: result.profileType);
      if (context.mounted) context.go('/p/$id/setup');
    } on ProjectLimitReached catch (e) {
      if (context.mounted) showMessage(context, e.toString());
    } catch (_) {
      if (context.mounted) {
        showMessage(context, 'Couldn\'t create the portfolio. Try again.');
      }
    }
  }

  /// A project from a backup file (images go back onto this computer).
  Future<void> _import(BuildContext context, WidgetRef ref) async {
    final pb = ref.read(pbBridgeProvider);
    final picked = await pb.invoke('backup', 'pick');
    if (!context.mounted) return;
    if (!picked.ok) {
      showMessage(context, picked.errorMessage!);
      return;
    }
    if (picked.value == null) return;
    final v = jsonMap(picked.value);
    final uid = ref.read(authUserProvider).value!.uid;
    try {
      final id = await ref
          .read(projectRepositoryProvider)
          .createFromBackup(uid: uid, project: jsonMap(v['project']));
      await pb.invoke('backup', 'restoreFiles', [v['token'] as String, id]);
      if (context.mounted) context.go('/p/$id');
    } on ProjectLimitReached catch (e) {
      if (context.mounted) showMessage(context, e.toString());
    } catch (_) {
      if (context.mounted) {
        showMessage(context, 'This backup couldn\'t be imported.');
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects = ref.watch(projectsProvider);
    final count =
        ref.watch(userDocProvider).value?.projectCount ??
        projects.value?.length ??
        0;
    final atLimit = count >= maxProjects;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Portfolio Builder'),
        actions: [
          IconButton(
            tooltip: 'Settings',
            onPressed: () => context.go('/settings'),
            icon: const Icon(Icons.settings_outlined),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1100),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 16,
                  runSpacing: 12,
                  children: [
                    Text(
                      'Your portfolios',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '$count of $maxProjects used',
                          key: const Key('project-count'),
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                        const SizedBox(width: 16),
                        TextButton.icon(
                          key: const Key('import-backup'),
                          onPressed: atLimit
                              ? null
                              : () => _import(context, ref),
                          icon: const Icon(Icons.upload_file),
                          label: const Text('Import backup'),
                        ),
                        const SizedBox(width: 8),
                        FilledButton.icon(
                          key: const Key('new-project'),
                          onPressed: atLimit
                              ? null
                              : () => _create(context, ref),
                          icon: const Icon(Icons.add),
                          label: const Text('New portfolio'),
                        ),
                      ],
                    ),
                  ],
                ),
                if (atLimit)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      'You\'ve reached $maxProjects portfolios. Delete one to create another.',
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                const SizedBox(height: 24),
                Expanded(
                  child: switch (projects) {
                    AsyncData(:final value) when value.isEmpty => _EmptyState(
                      onCreate: () => _create(context, ref),
                    ),
                    AsyncData(:final value) => _ProjectGrid(projects: value),
                    AsyncError() => const Center(
                      child: Text(
                        'Couldn\'t load your portfolios. Check your connection.',
                      ),
                    ),
                    _ => const Center(child: CircularProgressIndicator()),
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onCreate});
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.web_outlined,
            size: 56,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(height: 16),
          Text(
            'No portfolios yet',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          const Text(
            'Create one, bring in your resume, and get a site you can download.',
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: onCreate,
            child: const Text('Create your first portfolio'),
          ),
        ],
      ),
    );
  }
}

class _ProjectGrid extends StatelessWidget {
  const _ProjectGrid({required this.projects});
  final List<ProjectEntry> projects;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 320,
        mainAxisExtent: 200,
        crossAxisSpacing: 16,
        mainAxisSpacing: 16,
      ),
      itemCount: projects.length,
      itemBuilder: (_, i) => _ProjectCard(entry: projects[i]),
    );
  }
}

enum _Action { rename, duplicate, delete }

class _ProjectCard extends ConsumerWidget {
  const _ProjectCard({required this.entry});
  final ProjectEntry entry;

  Future<void> _onAction(
    BuildContext context,
    WidgetRef ref,
    _Action action,
  ) async {
    final repo = ref.read(projectRepositoryProvider);
    final uid = ref.read(authUserProvider).value!.uid;
    try {
      switch (action) {
        case _Action.rename:
          final name = await showRenameDialog(context, entry.doc.name);
          if (name != null && name != entry.doc.name) {
            await repo.rename(entry, name);
          }
        case _Action.duplicate:
          await repo.duplicate(uid: uid, source: entry);
          if (context.mounted) {
            showMessage(context, 'Duplicated "${entry.doc.name}".');
          }
        case _Action.delete:
          final ok = await confirm(
            context,
            title: 'Delete "${entry.doc.name}"?',
            message: 'This deletes the portfolio and its history. It can\'t be undone.',
            action: 'Delete',
          );
          if (ok) await repo.delete(uid: uid, entry: entry);
      }
    } on ProjectLimitReached catch (e) {
      if (context.mounted) showMessage(context, e.toString());
    } catch (_) {
      if (context.mounted) {
        showMessage(context, 'That didn\'t work. Try again.');
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final doc = entry.doc;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.go('/p/${entry.id}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: _Thumbnail(doc: doc)),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 4, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          doc.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleMedium,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${doc.profileType.label} · ${doc.status.label} · '
                          'Edited ${relativeTime(DateTime.fromMillisecondsSinceEpoch(doc.updatedAt))}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                  PopupMenuButton<_Action>(
                    tooltip: 'More actions',
                    onSelected: (a) => _onAction(context, ref, a),
                    itemBuilder: (_) => const [
                      PopupMenuItem(
                        value: _Action.rename,
                        child: Text('Rename'),
                      ),
                      PopupMenuItem(
                        value: _Action.duplicate,
                        child: Text('Duplicate'),
                      ),
                      PopupMenuItem(
                        value: _Action.delete,
                        child: Text('Delete'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A small picture of the site in its own colours (no rendering needed).
class _Thumbnail extends StatelessWidget {
  const _Thumbnail({required this.doc});
  final ProjectDoc doc;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = doc.spec?.theme;
    if (t == null) {
      return Container(
        color: theme.colorScheme.surfaceContainerHighest,
        alignment: Alignment.center,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.web_asset, size: 36, color: theme.colorScheme.outline),
            const SizedBox(height: 4),
            Text('Setup not finished', style: theme.textTheme.bodySmall),
          ],
        ),
      );
    }
    final c = t.colorMode == ColorMode.DARK ? t.colors.dark : t.colors.light;
    Color hex(String h) =>
        Color(0xff000000 | (int.tryParse(h.substring(1), radix: 16) ?? 0));
    final p = doc.content.profile;
    return Stack(
      children: [
        Positioned.fill(
          child: Container(
            color: hex(c.background),
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(width: 28, height: 4, color: hex(c.primary)),
                const SizedBox(height: 10),
                Text(
                  p.name.isEmpty ? doc.name : p.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: hex(c.text),
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (p.headline.isNotEmpty)
                  Text(
                    p.headline,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: hex(c.muted),
                    ),
                  ),
                const Spacer(),
                Row(
                  children: [
                    for (final x in [c.surface, c.surface, c.surface])
                      Expanded(
                        child: Container(
                          height: 22,
                          margin: const EdgeInsets.only(right: 6),
                          decoration: BoxDecoration(
                            color: hex(x),
                            border: Border.all(color: hex(c.border)),
                            borderRadius: BorderRadius.circular(
                              (t.radius / 3).clamp(0, 8),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
        if (doc.score != null)
          Positioned(
            top: 8,
            right: 8,
            child: Tooltip(
              message: 'Portfolio score',
              child: CircleAvatar(
                radius: 15,
                backgroundColor: theme.colorScheme.surface,
                child: Text(
                  '${doc.score}',
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
