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
import '../../models/generated/models.dart';

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
      final model = await showModelPicker(
        context,
        list,
        test: (m) => repo.testModel('openrouter', m),
      );
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

  /// Picks a model from [provider]'s list and saves it for [tier]
  /// (both tiers in simple mode).
  Future<void> _changeModel(String provider, [AiTier? tier]) async {
    try {
      final repo = ref.read(aiRepositoryProvider);
      final list = await repo.models(provider);
      if (!mounted) return;
      final model = await showModelPicker(
        context,
        list,
        test: (m) => repo.testModel(provider, m),
      );
      if (model == null) return;
      final uid = ref.read(authUserProvider).value!.uid;
      final ai = ref.read(userDocProvider).value?.ai;
      final picked = AiChoice(provider, model);
      if (tier == null || ai == null || ai.simple) {
        await repo.saveChoice(uid, picked);
      } else {
        final smart = ai.smart == null
            ? picked
            : AiChoice(ai.smart!.provider, ai.smart!.model);
        final fast = ai.fast == null
            ? smart
            : AiChoice(ai.fast!.provider, ai.fast!.model);
        await repo.saveChoices(
          uid,
          smart: tier == AiTier.smart ? picked : smart,
          fast: tier == AiTier.fast ? picked : fast,
          simple: false,
        );
      }
    } on PbException catch (e) {
      if (mounted) showMessage(context, e.message);
    }
  }

  /// Switches between one model and separate Smart/Fast models.
  Future<void> _setAdvanced(bool advanced) async {
    final ai = ref.read(userDocProvider).value?.ai;
    if (ai?.smart == null) return;
    final smart = AiChoice(ai!.smart!.provider, ai.smart!.model);
    final fast = ai.fast == null
        ? smart
        : AiChoice(ai.fast!.provider, ai.fast!.model);
    await ref
        .read(aiRepositoryProvider)
        .saveChoices(
          ref.read(authUserProvider).value!.uid,
          smart: smart,
          fast: advanced ? fast : smart,
          simple: !advanced,
        );
  }

  /// Which saved key to take a model from (asks only when there are several).
  Future<String?> _pickProvider(List<SavedKey> keys) async {
    if (keys.length == 1) return keys.first.provider;
    return showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Which key?'),
        children: [
          for (final k in keys)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context, k.provider),
              child: Text(k.label),
            ),
        ],
      ),
    );
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
                        _ModelsCard(
                          label: label,
                          onChange: (tier) async {
                            final list = keys.value ?? const <SavedKey>[];
                            if (list.isEmpty) {
                              showMessage(context, 'Add a key first.');
                              return;
                            }
                            final fast = ref
                                .read(userDocProvider)
                                .value
                                ?.ai
                                .fast;
                            final String? current = tier == AiTier.fast
                                ? fast?.provider
                                : choice?.provider;
                            final provider = list.length > 1 || current == null
                                ? await _pickProvider(list)
                                : current;
                            if (provider != null) {
                              await _changeModel(provider, tier);
                            }
                          },
                          onAdvanced: _setAdvanced,
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
                        const SizedBox(height: 32),
                        const _UsageCard(),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

/// The chosen model(s): one for everything, or separate Smart and Fast models.
class _ModelsCard extends ConsumerWidget {
  const _ModelsCard({
    required this.label,
    required this.onChange,
    required this.onAdvanced,
  });
  final String Function(String provider) label;
  final ValueChanged<AiTier?> onChange;
  final ValueChanged<bool> onAdvanced;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ai = ref.watch(userDocProvider).value?.ai;
    final smart = ai?.smart;
    final fast = ai?.fast ?? smart;
    final advanced = ai != null && !ai.simple;
    final keys = ref.watch(savedKeysProvider).value;
    // The choice syncs between computers; keys don't.
    bool missingKey(ModelChoice c) =>
        keys != null && !keys.any((k) => k.provider == c.provider);
    Widget row(
      String title,
      String help,
      ModelChoice? c,
      AiTier? tier,
    ) => ListTile(
      leading: Icon(
        c != null && missingKey(c)
            ? Icons.warning_amber_outlined
            : Icons.auto_awesome_outlined,
      ),
      title: Text(
        c == null ? 'No model chosen yet' : '$title: ${label(c.provider)}',
      ),
      subtitle: Text(
        c == null
            ? 'Add a key to choose a model.'
            : missingKey(c)
            ? '${c.model}\nThe ${label(c.provider)} key isn\'t on this computer. '
                  'Add it below to use AI here.'
            : '${c.model}\n$help',
      ),
      isThreeLine: c != null,
      trailing: TextButton(
        key: Key('change-model-${tier?.name ?? 'all'}'),
        onPressed: () => onChange(tier),
        child: Text(c == null ? 'Choose' : 'Change'),
      ),
    );
    return Card(
      child: Column(
        children: [
          if (!advanced)
            row('Model', 'Used for everything.', smart, null)
          else ...[
            row(
              'Smart',
              'Designs and assistant edits. Pick a capable model.',
              smart,
              AiTier.smart,
            ),
            const Divider(height: 1),
            row(
              'Fast',
              'Resume reading, rewrites and image descriptions. A small free model is fine.',
              fast,
              AiTier.fast,
            ),
          ],
          if (smart != null)
            SwitchListTile(
              key: const Key('advanced-models'),
              title: const Text(
                'Use separate models for design and quick tasks',
              ),
              value: advanced,
              onChanged: onAdvanced,
            ),
        ],
      ),
    );
  }
}

final _usageProvider = FutureProvider.autoDispose<List<UsageRow>>(
  (ref) => ref.watch(aiRepositoryProvider).usage(),
);

/// Requests and tokens per model this month, counted on this computer.
class _UsageCard extends ConsumerWidget {
  const _UsageCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final rows = ref.watch(_usageProvider);
    final month = DateTime.now().toIso8601String().substring(0, 7);
    String n(int v) => v >= 1000000
        ? '${(v / 1000000).toStringAsFixed(1)}M'
        : v >= 1000
        ? '${(v / 1000).toStringAsFixed(1)}k'
        : '$v';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Usage this month', style: theme.textTheme.titleSmall),
        const SizedBox(height: 4),
        Text(
          'Counted on this computer from what providers report. Check your provider\'s '
          'dashboard for exact limits and costs.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 8),
        switch (rows) {
          AsyncData(:final value) when value.every((r) => r.month != month) =>
            const Text('No AI requests this month yet.'),
          AsyncData(:final value) => Card(
            child: DataTable(
              columns: const [
                DataColumn(label: Text('Model')),
                DataColumn(label: Text('Requests'), numeric: true),
                DataColumn(label: Text('Tokens in'), numeric: true),
                DataColumn(label: Text('Tokens out'), numeric: true),
              ],
              rows: [
                for (final r in value.where((r) => r.month == month))
                  DataRow(
                    cells: [
                      DataCell(Text(r.model, overflow: TextOverflow.ellipsis)),
                      DataCell(Text('${r.requests}')),
                      DataCell(Text(n(r.inputTokens))),
                      DataCell(Text(n(r.outputTokens))),
                    ],
                  ),
              ],
            ),
          ),
          AsyncError() => const Text(
            'Usage isn\'t available on this computer.',
          ),
          _ => const LinearProgressIndicator(),
        },
      ],
    );
  }
}
