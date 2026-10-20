import 'package:flutter/material.dart';

import 'ai_repository.dart';

/// Lets the user pick a model, with free and capability labels. Returns its id.
Future<String?> showModelPicker(BuildContext context, ModelList list) =>
    showDialog<String>(
      context: context,
      builder: (_) => _ModelPicker(list: list),
    );

class _ModelPicker extends StatefulWidget {
  const _ModelPicker({required this.list});
  final ModelList list;

  @override
  State<_ModelPicker> createState() => _ModelPickerState();
}

class _ModelPickerState extends State<_ModelPicker> {
  late String? _selected =
      widget.list.suggested ?? widget.list.models.firstOrNull?.id;
  late bool _freeOnly =
      widget.list.models.any((m) => m.free) &&
      widget.list.models.any((m) => !m.free);
  var _query = '';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final q = _query.toLowerCase();
    final shown =
        widget.list.models
            .where((m) => !_freeOnly || m.free)
            .where(
              (m) =>
                  q.isEmpty ||
                  m.id.toLowerCase().contains(q) ||
                  m.label.toLowerCase().contains(q),
            )
            .toList()
          ..sort((a, b) {
            if (a.id == widget.list.suggested) return -1;
            if (b.id == widget.list.suggested) return 1;
            return a.label.compareTo(b.label);
          });
    return AlertDialog(
      title: const Text('Choose a model'),
      content: SizedBox(
        width: 520,
        height: 440,
        child: Column(
          children: [
            TextField(
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: 'Search models',
              ),
              onChanged: (v) => setState(() => _query = v),
            ),
            if (widget.list.models.any((m) => !m.free) &&
                widget.list.models.any((m) => m.free))
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Free models only'),
                value: _freeOnly,
                onChanged: (v) => setState(() => _freeOnly = v),
              ),
            Text(
              'Models without "Reads images" still work: inspiration uses page styles only, '
              'and image descriptions are written from context.',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            Expanded(
              child: shown.isEmpty
                  ? const Center(child: Text('No models match.'))
                  : RadioGroup<String>(
                      groupValue: _selected,
                      onChanged: (v) => setState(() => _selected = v),
                      child: ListView.builder(
                        itemCount: shown.length,
                        itemBuilder: (_, i) {
                          final m = shown[i];
                          return RadioListTile<String>(
                            value: m.id,
                            title: Text(
                              m.label,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: Wrap(
                              spacing: 6,
                              runSpacing: 4,
                              children: [
                                if (m.id == widget.list.suggested ||
                                    m.recommended)
                                  _Badge(
                                    'Recommended',
                                    theme.colorScheme.primary,
                                  )
                                else
                                  _Badge('Untested', theme.colorScheme.outline),
                                if (m.free)
                                  _Badge('Free', theme.colorScheme.tertiary),
                                if (m.images)
                                  _Badge(
                                    'Reads images',
                                    theme.colorScheme.secondary,
                                  ),
                                if (!m.smart)
                                  _Badge(
                                    'Small model',
                                    theme.colorScheme.outline,
                                  ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          key: const Key('use-model'),
          onPressed: _selected == null
              ? null
              : () => Navigator.pop(context, _selected),
          child: const Text('Use this model'),
        ),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge(this.text, this.color);
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
    decoration: BoxDecoration(
      border: Border.all(color: color),
      borderRadius: BorderRadius.circular(4),
    ),
    child: Text(text, style: TextStyle(fontSize: 11, color: color)),
  );
}
