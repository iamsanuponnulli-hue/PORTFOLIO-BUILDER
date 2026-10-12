import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../models/profile_types.dart';

/// Stand-in for the setup wizard and editor, which arrive in Phases 2–4.
class ProjectPlaceholderPage extends ConsumerWidget {
  const ProjectPlaceholderPage({super.key, required this.projectId});
  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final project = ref.watch(projectProvider(projectId));
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Back to portfolios',
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
        ),
        title: Text(project.value?.doc.name ?? 'Portfolio'),
      ),
      body: Center(
        child: switch (project) {
          AsyncData(value: null) ||
          AsyncError() => const Text('This portfolio doesn\'t exist.'),
          AsyncData(:final value?) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                value.doc.profileType.label,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              const Text(
                'The setup wizard and editor are coming in the next phases.',
              ),
            ],
          ),
          _ => const CircularProgressIndicator(),
        },
      ),
    );
  }
}
