import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/js/pb_bridge.dart';
import '../../core/ui/feedback.dart';
import '../../core/web/browser.dart';
import 'add_key_dialog.dart';
import 'ai_providers.dart';

/// "Connect a free AI": shown before the first AI step when no key is set up.
/// Returns true when AI is ready afterwards.
Future<bool> showConnectAi(BuildContext context, WidgetRef ref) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => const _ConnectAi(),
  );
  return result ?? false;
}

/// Starts "Sign in with OpenRouter" (leaves the app and comes back to Settings → AI).
Future<void> startOpenRouterSignIn(BuildContext context, WidgetRef ref) async {
  try {
    final url = await ref
        .read(aiRepositoryProvider)
        .startOpenRouter('${currentOrigin()}/settings/ai');
    redirectTo(url);
  } on PbException catch (e) {
    if (context.mounted) showMessage(context, e.message);
  }
}

class _ConnectAi extends ConsumerWidget {
  const _ConnectAi();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    Future<void> addKey(String provider) async {
      final ok = await showAddKeyDialog(context, initialProvider: provider);
      if (ok && context.mounted) Navigator.pop(context, true);
    }

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Connect a free AI', style: theme.textTheme.titleLarge),
              const SizedBox(height: 8),
              const Text(
                'This app has no paid AI of its own. Connect your own — these options cost '
                'nothing. Your key stays on this computer.',
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                key: const Key('connect-openrouter'),
                onPressed: () => startOpenRouterSignIn(context, ref),
                icon: const Icon(Icons.login),
                label: const Text(
                  'Sign in with OpenRouter (one click, free models)',
                ),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => addKey('gemini'),
                child: const Text('Use a free Google Gemini key'),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: () => addKey('groq'),
                child: const Text('Use a free Groq key'),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => addKey('anthropic'),
                child: const Text(
                  'I have another key (Claude, OpenAI, Mistral…)',
                ),
              ),
              const Divider(height: 32),
              TextButton(
                key: const Key('skip-ai'),
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Skip — I\'ll fill things in by hand'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
