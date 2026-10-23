import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/js/pb_bridge.dart';
import '../../core/web/browser.dart';
import 'ai_providers.dart';
import 'ai_repository.dart';
import 'model_picker_dialog.dart';

/// Add a key: pick a provider, follow the steps, paste, check, pick a model.
/// Returns true when a key and model were saved.
Future<bool> showAddKeyDialog(
  BuildContext context, {
  String? initialProvider,
}) async {
  final saved = await showDialog<bool>(
    context: context,
    builder: (_) => _AddKeyDialog(initialProvider: initialProvider),
  );
  return saved ?? false;
}

class _AddKeyDialog extends ConsumerStatefulWidget {
  const _AddKeyDialog({this.initialProvider});
  final String? initialProvider;

  @override
  ConsumerState<_AddKeyDialog> createState() => _AddKeyDialogState();
}

class _AddKeyDialogState extends ConsumerState<_AddKeyDialog> {
  late final List<AiProvider> _providers = ref
      .read(aiRepositoryProvider)
      .providers()
      .where((p) => p.id != 'openrouter')
      .toList();
  late String _provider =
      widget.initialProvider ?? _providers.firstOrNull?.id ?? 'gemini';
  final _key = TextEditingController();
  final _baseUrl = TextEditingController();
  var _busy = false;
  String? _error;

  AiProvider? get _info =>
      _providers.where((p) => p.id == _provider).firstOrNull;

  @override
  void dispose() {
    _key.dispose();
    _baseUrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_key.text.trim().isEmpty) {
      setState(() => _error = 'Paste your key first.');
      return;
    }
    if (_provider == 'custom' && !_baseUrl.text.trim().startsWith('https://')) {
      setState(
        () => _error = 'Enter the service address, starting with https://',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final repo = ref.read(aiRepositoryProvider);
      final list = await repo.addKey(
        provider: _provider,
        apiKey: _key.text,
        baseUrl: _baseUrl.text.trim(),
        label: _info?.label ?? _provider,
      );
      ref.invalidate(savedKeysProvider);
      if (!mounted) return;
      final model = await showModelPicker(
        context,
        list,
        test: (m) => repo.testModel(_provider, m),
      );
      if (model == null || !mounted) return;
      final uid = ref.read(authUserProvider).value!.uid;
      await repo.saveChoice(uid, AiChoice(_provider, model));
      if (mounted) Navigator.pop(context, true);
    } on PbException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final info = _info;
    return AlertDialog(
      title: const Text('Add an AI key'),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                key: const Key('provider'),
                initialValue: _provider,
                decoration: const InputDecoration(labelText: 'Provider'),
                items: [
                  for (final p in _providers)
                    DropdownMenuItem(
                      value: p.id,
                      child: Text(p.free ? '${p.label}  ·  free' : p.label),
                    ),
                ],
                onChanged: _busy
                    ? null
                    : (v) => setState(() => _provider = v ?? _provider),
              ),
              if (info != null) ...[
                const SizedBox(height: 16),
                for (final (i, step) in info.steps.indexed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text('${i + 1}. $step'),
                  ),
                if (info.keyUrl != null)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () => openExternal(info.keyUrl!),
                      icon: const Icon(Icons.open_in_new, size: 18),
                      label: Text(
                        'Get a ${info.free ? 'free ' : ''}key from ${info.label}',
                      ),
                    ),
                  ),
              ],
              const SizedBox(height: 8),
              if (_provider == 'custom') ...[
                TextField(
                  controller: _baseUrl,
                  decoration: const InputDecoration(
                    labelText: 'Service address',
                    hintText: 'https://example.com/v1',
                  ),
                ),
                const SizedBox(height: 12),
              ],
              TextField(
                key: const Key('api-key'),
                controller: _key,
                obscureText: true,
                autocorrect: false,
                enableSuggestions: false,
                decoration: const InputDecoration(labelText: 'API key'),
                onSubmitted: (_) => _save(),
              ),
              const SizedBox(height: 8),
              Text(
                'Your key stays on this computer, encrypted. It is never uploaded.',
                style: theme.textTheme.bodySmall,
              ),
              if (info != null && info.dataNote.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(info.dataNote, style: theme.textTheme.bodySmall),
                ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          key: const Key('save-key'),
          onPressed: _busy ? null : _save,
          child: Text(_busy ? 'Checking…' : 'Check and save'),
        ),
      ],
    );
  }
}
