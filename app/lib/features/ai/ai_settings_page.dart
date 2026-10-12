import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/js/pb_bridge.dart';
import '../../core/ui/feedback.dart';
import 'add_key_dialog.dart';
import 'ai_providers.dart';
import 'ai_repository.dart';
import 'connect_ai_sheet.dart';
import 'model_picker_dialog.dart';

/// Settings → AI. Also where "Sign in with OpenRouter" returns (?code=…).
class AiSettingsPage extends ConsumerStatefulWidget {
  const AiSettingsPage({super.key, this.openRouterCode});
  final String? openRouterCode;

  @override
  ConsumerState<AiSettingsPage> createState() => _AiSettingsPageState();
}

class _AiSettingsPageState extends ConsumerState<AiSettingsPage> {
  var _finishing = false;

  @override
  void initState() {
    super.initState();
    if (widget.openRouterCode != null) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _finishOpenRouter(widget.openRouterCode!),
      );
    }
  }

  Future<void> _finishOpenRouter(String code) async {
    setState(() => _finishing = true);
    try {
      final repo = ref.read(aiRepositoryProvider);
      final list = await repo.finishOpenRouter(code);
      ref.invalidate(savedKeysProvider);
      if (!mounted) return;
      final model = await showModelPicker(context, list);
      if (model != null) {
        await repo.saveChoice(
          ref.read(authUserProvider).value!.uid,
          AiChoice('openrouter', model),
        );
        if (mounted) showMessage(context, 'OpenRouter connected.');
      }
    } on PbException catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) {
        setState(() => _finishing = false);
        context.go('/settings/ai'); // drop ?code from the address
      }
    }
  }

  Future<void> _changeModel(String provider) async {
    try {
      final repo = ref.read(aiRepositoryProvider);
      final list = await repo.models(provider);
      if (!mounted) return;
      final model = await showModelPicker(context, list);
      if (model != null) {
        await repo.saveChoice(
          ref.read(authUserProvider).value!.uid,
          AiChoice(provider, model),
        );
      }
    } on PbException catch (e) {
      if (mounted) showMessage(context, e.message);
    }
  }

  Future<void> _remove(SavedKey key) async {
    final ok = await confirm(
      context,
      title: 'Remove ${key.label} key?',
      message: 'It will be deleted from this computer. You can add it again any time.',
      action: 'Remove',
    );
    if (!ok) return;
    await ref.read(aiRepositoryProvider).removeKey(key.provider);
    ref.invalidate(savedKeysProvider);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final keys = ref.watch(savedKeysProvider);
    final choice = ref.watch(aiChoiceProvider);
    final providers = {
      for (final p in ref.read(aiRepositoryProvider).providers()) p.id: p,
    };
    String label(String id) => providers[id]?.label ?? id;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Back to settings',
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/settings'),
        ),
        title: const Text('AI'),
      ),
      body: _finishing
          ? const Center(child: Text('Connecting OpenRouter…'))
          : ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 720),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'This app has no paid AI of its own. AI features use your own key, '
                          'kept encrypted on this computer and never uploaded. Free keys from '
                          'Gemini, Groq or OpenRouter work.',
                          style: theme.textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 24),
                        Card(
                          child: ListTile(
                            leading: const Icon(Icons.auto_awesome_outlined),
                            title: Text(
                              choice == null
                                  ? 'No model chosen yet'
                                  : label(choice.provider),
                            ),
                            subtitle: Text(
                              choice?.model ?? 'Add a key to choose a model.',
                            ),
                            trailing: choice == null
                                ? null
                                : TextButton(
                                    onPressed: () =>
                                        _changeModel(choice.provider),
                                    child: const Text('Change model'),
                                  ),
                          ),
                        ),
                        const SizedBox(height: 24),
                        Text(
                          'Keys on this computer',
                          style: theme.textTheme.titleSmall,
                        ),
                        const SizedBox(height: 8),
                        switch (keys) {
                          AsyncData(:final value) when value.isEmpty =>
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 12),
                              child: Text('No keys yet.'),
                            ),
                          AsyncData(:final value) => Card(
                            child: Column(
                              children: [
                                for (final k in value)
                                  ListTile(
                                    leading: const Icon(Icons.key_outlined),
                                    title: Text(k.label),
                                    subtitle: Text('•••• ${k.last4}'),
                                    trailing: Wrap(
                                      children: [
                                        TextButton(
                                          onPressed: () =>
                                              _changeModel(k.provider),
                                          child: const Text('Use'),
                                        ),
                                        IconButton(
                                          tooltip: 'Remove key',
                                          onPressed: () => _remove(k),
                                          icon: const Icon(
                                            Icons.delete_outline,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          AsyncError() => const Text(
                            'Couldn\'t read keys on this computer.',
                          ),
                          _ => const LinearProgressIndicator(),
                        },
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 12,
                          runSpacing: 12,
                          children: [
                            FilledButton.icon(
                              onPressed: () =>
                                  startOpenRouterSignIn(context, ref),
                              icon: const Icon(Icons.login),
                              label: const Text('Sign in with OpenRouter'),
                            ),
                            OutlinedButton.icon(
                              key: const Key('add-key'),
                              onPressed: () => showAddKeyDialog(context),
                              icon: const Icon(Icons.add),
                              label: const Text('Add a key'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
