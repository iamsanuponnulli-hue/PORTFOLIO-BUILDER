import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/ui/feedback.dart';
import '../auth/auth_repository.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  Future<void> _deleteAccount(BuildContext context, WidgetRef ref) async {
    final ok = await confirm(
      context,
      title: 'Delete your account?',
      message: 'All your portfolios, images and history will be deleted. This can\'t be undone.',
      action: 'Delete account',
    );
    if (!ok) return;
    try {
      await ref.read(authRepositoryProvider).deleteAccount();
    } catch (e) {
      if (context.mounted) showMessage(context, authErrorMessage(e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authUserProvider).value;
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Back to portfolios',
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
        ),
        title: const Text('Settings'),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 16),
        children: [
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _Section(
                    title: 'AI access',
                    children: [
                      ListTile(
                        leading: const Icon(Icons.auto_awesome_outlined),
                        title: const Text('Starter allowance'),
                        subtitle: Text(
                          'Choosing a model, adding your own key (kept on this device only) '
                          'and signing in with OpenRouter arrive in the next phase.',
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                    ],
                  ),
                  _Section(
                    title: 'Account',
                    children: [
                      ListTile(
                        leading: const Icon(Icons.person_outline),
                        title: Text(
                          user?.displayName?.isNotEmpty == true
                              ? user!.displayName!
                              : (user?.email ?? ''),
                        ),
                        subtitle: Text(user?.email ?? ''),
                      ),
                      ListTile(
                        leading: const Icon(Icons.logout),
                        title: const Text('Sign out'),
                        onTap: () => ref.read(authRepositoryProvider).signOut(),
                      ),
                      ListTile(
                        leading: Icon(
                          Icons.delete_forever_outlined,
                          color: theme.colorScheme.error,
                        ),
                        title: Text(
                          'Delete account',
                          style: TextStyle(color: theme.colorScheme.error),
                        ),
                        onTap: () => _deleteAccount(context, ref),
                      ),
                    ],
                  ),
                  const _Section(title: 'About', children: [_BridgeCheck()]),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 16, bottom: 4),
            child: Text(title, style: Theme.of(context).textTheme.titleSmall),
          ),
          Card(child: Column(children: children)),
        ],
      ),
    );
  }
}

/// Confirms the browser packages and the background worker are working.
class _BridgeCheck extends ConsumerStatefulWidget {
  const _BridgeCheck();

  @override
  ConsumerState<_BridgeCheck> createState() => _BridgeCheckState();
}

class _BridgeCheckState extends ConsumerState<_BridgeCheck> {
  String? _result;

  Future<void> _run() async {
    final pb = ref.read(pbBridgeProvider);
    setState(() => _result = 'Checking…');
    try {
      final page = pb.ping();
      final worker = await pb.workerPing();
      final content = await pb.normalizeContent('{"profile":{"name":"Test"}}');
      setState(
        () => _result =
            'Page: $page · Worker: $worker · Schema: ${content.contains('"projects":[]') ? 'ok' : 'unexpected'}',
      );
    } catch (e) {
      setState(() => _result = 'Not working: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final pb = ref.watch(pbBridgeProvider);
    return ListTile(
      leading: const Icon(Icons.memory),
      title: Text(
        'Browser packages ${pb.available ? 'v${pb.version}' : '(not loaded)'}',
      ),
      subtitle: Text(_result ?? 'Processing runs on this computer.'),
      trailing: TextButton(onPressed: _run, child: const Text('Run check')),
    );
  }
}
