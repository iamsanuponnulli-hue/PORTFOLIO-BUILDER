import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../models/generated/models.dart' hide Colors;
import 'catalog.dart';
import 'editor_controller.dart';

Color colorOf(String hex) =>
    Color(0xff000000 | (int.tryParse(hex.substring(1), radix: 16) ?? 0));

const _colorLabels = {
  'background': 'Background',
  'surface': 'Cards',
  'text': 'Text',
  'muted': 'Secondary text',
  'primary': 'Links and buttons',
  'accent': 'Accent',
  'border': 'Borders',
};

/// Theme: presets, colours (light and dark), fonts, spacing, corners and motion.
class ThemePanel extends StatefulWidget {
  const ThemePanel({super.key, required this.editor, required this.catalog});
  final EditorController editor;
  final Catalog catalog;

  @override
  State<ThemePanel> createState() => _ThemePanelState();
}

class _ThemePanelState extends State<ThemePanel> {
  var _mode = 'light';

  /// Slider values while dragging (applied once, on release).
  final _dragging = <String, double>{};

  EditorController get editor => widget.editor;
  ThemeTokens get t => editor.doc!.spec!.theme;

  void _tokens(Map<String, dynamic> tokens) => editor.apply([
    {'op': 'updateTheme', 'tokens': tokens},
  ]);

  void _setColor(String key, String hex) {
    final colors = t.colors.toJson();
    (colors[_mode] as Map<String, dynamic>)[key] = hex;
    _tokens({'colors': colors});
  }

  Widget _slider(
    String key,
    String label,
    double value,
    double min,
    double max, {
    int? divisions,
    String Function(double)? format,
  }) {
    final v = _dragging[key] ?? value;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(
            '$label: ${format?.call(v) ?? v.round()}',
            style: Theme.of(context).textTheme.labelMedium,
          ),
        ),
        Slider(
          key: Key('slider-$key'),
          value: v.clamp(min, max),
          min: min,
          max: max,
          divisions: divisions,
          onChanged: (x) => setState(() => _dragging[key] = x),
          onChangeEnd: (x) {
            setState(() => _dragging.remove(key));
            _tokens({
              key: key == 'scale'
                  ? double.parse(x.toStringAsFixed(3))
                  : x.round(),
            });
          },
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = (t.colors.toJson()[_mode] as Map<String, dynamic>)
        .cast<String, String>();
    final contrast = editor.checks
        .where((c) => c.id.startsWith('contrast-'))
        .toList();
    Widget segmented<T extends Enum>(
      String label,
      String key,
      List<T> values,
      T selected,
      Map<T, String> labels,
      EnumValues<T> json,
    ) => Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(label, style: theme.textTheme.labelMedium),
          const SizedBox(height: 6),
          SegmentedButton<T>(
            showSelectedIcon: false,
            segments: [
              for (final v in values)
                ButtonSegment(value: v, label: Text(labels[v]!)),
            ],
            selected: {selected},
            onSelectionChanged: (s) => _tokens({key: json.reverse[s.first]}),
          ),
        ],
      ),
    );
    final fontsBy = <String, List<FontInfo>>{};
    for (final f in widget.catalog.fonts) {
      fontsBy.putIfAbsent(f.category, () => []).add(f);
    }
    DropdownButtonFormField<String> fontPicker(String key, String value) =>
        DropdownButtonFormField<String>(
          key: Key('font-$key'),
          initialValue: widget.catalog.fonts.any((f) => f.family == value)
              ? value
              : null,
          decoration: InputDecoration(
            labelText: switch (key) {
              'heading' => 'Headings',
              'body' => 'Body text',
              _ => 'Code',
            },
          ),
          items: [
            for (final f in widget.catalog.fonts.where(
              (f) =>
                  key == 'mono' ? f.category == 'mono' : f.category != 'mono',
            ))
              DropdownMenuItem(value: f.family, child: Text(f.family)),
          ],
          onChanged: (v) => _tokens({
            'fonts': {...t.fonts.toJson(), key: v},
          }),
        );

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Start from a preset', style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final p in widget.catalog.presets)
              ActionChip(
                key: Key('preset-${p.id}'),
                avatar: CircleAvatar(
                  backgroundColor: colorOf(p.theme.colors.light.primary),
                ),
                label: Text(p.label),
                onPressed: () {
                  final next = p.theme.toJson()
                    ..['colorMode'] = colorModeValues.reverse[t.colorMode];
                  _tokens(next);
                },
              ),
          ],
        ),
        const SizedBox(height: 20),
        segmented<ColorMode>(
          'Light or dark',
          'colorMode',
          const [ColorMode.LIGHT, ColorMode.DARK, ColorMode.AUTO],
          t.colorMode,
          const {
            ColorMode.LIGHT: 'Light',
            ColorMode.DARK: 'Dark',
            ColorMode.AUTO: 'Visitor\'s choice',
          },
          colorModeValues,
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(child: Text('Colours', style: theme.textTheme.titleSmall)),
            SegmentedButton<String>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: 'light', label: Text('Light')),
                ButtonSegment(value: 'dark', label: Text('Dark')),
              ],
              selected: {_mode},
              onSelectionChanged: (s) => setState(() => _mode = s.first),
            ),
          ],
        ),
        if (contrast.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              contrast.map((c) => c.message).join('\n'),
              key: const Key('contrast-warning'),
              style: TextStyle(color: theme.colorScheme.error),
            ),
          ),
        const SizedBox(height: 8),
        for (final MapEntry(:key, value: label) in _colorLabels.entries)
          _ColorField(
            key: Key('color-$_mode-$key'),
            label: label,
            value: colors[key] ?? '#000000',
            onChanged: (hex) => _setColor(key, hex),
          ),
        const SizedBox(height: 20),
        Text('Fonts', style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),
        fontPicker('heading', t.fonts.heading),
        const SizedBox(height: 8),
        fontPicker('body', t.fonts.body),
        const SizedBox(height: 8),
        fontPicker('mono', t.fonts.mono),
        _slider(
          'scale',
          'Heading size steps',
          t.scale,
          1.1,
          1.5,
          divisions: 40,
          format: (v) => v.toStringAsFixed(2),
        ),
        const SizedBox(height: 12),
        Text('Shape and space', style: theme.textTheme.titleSmall),
        _slider(
          'radius',
          'Corner rounding (px)',
          t.radius,
          0,
          32,
          divisions: 32,
        ),
        _slider('width', 'Page width (px)', t.width, 720, 1440, divisions: 36),
        segmented<Density>(
          'Spacing',
          'density',
          Density.values,
          t.density,
          const {
            Density.COMPACT: 'Compact',
            Density.COMFORTABLE: 'Comfortable',
            Density.ROOMY: 'Roomy',
          },
          densityValues,
        ),
        segmented<Shadow>('Shadows', 'shadow', Shadow.values, t.shadow, const {
          Shadow.NONE: 'None',
          Shadow.SOFT: 'Soft',
          Shadow.STRONG: 'Strong',
        }, shadowValues),
        segmented<Motion>('Motion', 'motion', Motion.values, t.motion, const {
          Motion.NONE: 'None',
          Motion.SUBTLE: 'Subtle',
          Motion.LIVELY: 'Lively',
        }, motionValues),
        const SizedBox(height: 16),
      ],
    );
  }
}

/// A colour as #rrggbb with a swatch. Invalid input is ignored until it's valid.
class _ColorField extends StatefulWidget {
  const _ColorField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
  });
  final String label;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  State<_ColorField> createState() => _ColorFieldState();
}

class _ColorFieldState extends State<_ColorField> {
  late final _c = TextEditingController(text: widget.value);
  final _focus = FocusNode();

  @override
  void didUpdateWidget(_ColorField old) {
    super.didUpdateWidget(old);
    if (!_focus.hasFocus && widget.value != _c.text) _c.text = widget.value;
  }

  @override
  void dispose() {
    _c.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _submit(String v) {
    var hex = v.trim().toLowerCase();
    if (!hex.startsWith('#')) hex = '#$hex';
    if (RegExp(r'^#[0-9a-f]{3}$').hasMatch(hex)) {
      hex = '#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}';
    }
    if (RegExp(r'^#[0-9a-f]{6}$').hasMatch(hex) && hex != widget.value) {
      widget.onChanged(hex);
    } else {
      _c.text = widget.value;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: colorOf(widget.value),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(
                color: Theme.of(context).colorScheme.outlineVariant,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(child: Text(widget.label)),
          SizedBox(
            width: 104,
            child: Focus(
              onFocusChange: (has) {
                if (!has) _submit(_c.text);
              },
              child: TextField(
                controller: _c,
                focusNode: _focus,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[#0-9a-fA-F]')),
                  LengthLimitingTextInputFormatter(7),
                ],
                decoration: const InputDecoration(isDense: true),
                style: const TextStyle(fontFamily: 'monospace'),
                onSubmitted: _submit,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
