import 'dart:async';

import 'package:flutter/material.dart';

/// A text field that reports changes after the user pauses typing.
class SyncedField extends StatefulWidget {
  const SyncedField({
    super.key,
    required this.value,
    required this.onChanged,
    required this.label,
    this.hint,
    this.minLines = 1,
    this.maxLines = 1,
    this.keyboardType,
  });

  final String value;
  final ValueChanged<String> onChanged;
  final String label;
  final String? hint;
  final int minLines;
  final int maxLines;
  final TextInputType? keyboardType;

  @override
  State<SyncedField> createState() => _SyncedFieldState();
}

class _SyncedFieldState extends State<SyncedField> {
  late final _c = TextEditingController(text: widget.value);
  Timer? _debounce;

  @override
  void didUpdateWidget(SyncedField old) {
    super.didUpdateWidget(old);
    // Take outside changes (e.g. an import) unless the user is mid-edit.
    if (widget.value != _c.text && _debounce?.isActive != true) {
      _c.text = widget.value;
    }
  }

  void _changed(String v) {
    _debounce?.cancel();
    _debounce = Timer(
      const Duration(milliseconds: 400),
      () => widget.onChanged(v),
    );
  }

  @override
  void dispose() {
    if (_debounce?.isActive == true) {
      _debounce!.cancel();
      widget.onChanged(_c.text);
    }
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
    controller: _c,
    minLines: widget.minLines,
    maxLines: widget.maxLines,
    keyboardType: widget.keyboardType,
    decoration: InputDecoration(labelText: widget.label, hintText: widget.hint),
    onChanged: _changed,
  );
}

class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    required this.title,
    this.subtitle,
    required this.child,
    this.trailing,
  });
  final String title;
  final String? subtitle;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(title, style: theme.textTheme.titleMedium),
                ),
                ?trailing,
              ],
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 4),
              Text(
                subtitle!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
            const SizedBox(height: 16),
            child,
          ],
        ),
      ),
    );
  }
}
