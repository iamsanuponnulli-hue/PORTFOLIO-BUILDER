import 'dart:convert';

import '../../models/generated/models.dart';

class VariantInfo {
  const VariantInfo(this.id, this.label);
  final String id;
  final String label;
}

class SectionInfo {
  const SectionInfo(this.type, this.label, this.defaultTitle, this.variants);
  final String type;
  final String label;
  final String defaultTitle;
  final List<VariantInfo> variants;
}

class PresetInfo {
  const PresetInfo(this.id, this.label, this.theme);
  final String id;
  final String label;
  final ThemeTokens theme;
}

class FontInfo {
  const FontInfo(this.family, this.category);
  final String family;
  final String category;
}

/// What the renderer can draw (from packages/renderer, via the bridge).
class Catalog {
  const Catalog({
    required this.sections,
    required this.nav,
    required this.presets,
    required this.fonts,
  });

  final Map<String, SectionInfo> sections;
  final List<VariantInfo> nav;
  final List<PresetInfo> presets;
  final List<FontInfo> fonts;

  static const empty = Catalog(sections: {}, nav: [], presets: [], fonts: []);

  factory Catalog.parse(String json) {
    final j = jsonDecode(json) as Map<String, dynamic>;
    if (j.isEmpty) return empty;
    List<VariantInfo> variants(Object? v) => [
      for (final x in (v as List? ?? const []).cast<Map<String, dynamic>>())
        VariantInfo(x['id'] as String, x['label'] as String),
    ];
    return Catalog(
      sections: {
        for (final MapEntry(:key, :value)
            in (j['sections'] as Map<String, dynamic>? ?? const {}).entries)
          key: SectionInfo(
            key,
            (value as Map<String, dynamic>)['label'] as String,
            value['defaultTitle'] as String? ?? '',
            variants(value['variants']),
          ),
      },
      nav: variants(j['nav']),
      presets: [
        for (final p
            in (j['presets'] as List? ?? const []).cast<Map<String, dynamic>>())
          PresetInfo(
            p['id'] as String,
            p['label'] as String,
            ThemeTokens.fromJson(p['theme'] as Map<String, dynamic>),
          ),
      ],
      fonts: [
        for (final f
            in (j['fonts'] as List? ?? const []).cast<Map<String, dynamic>>())
          FontInfo(f['family'] as String, f['category'] as String),
      ],
    );
  }

  /// Types people can add from the library (custom ones come from code or AI).
  Iterable<SectionInfo> get library =>
      sections.values.where((s) => s.type != 'custom');

  SectionInfo? info(SectionType type) =>
      sections[sectionTypeValues.reverse[type]];

  String label(SectionType type) =>
      info(type)?.label ?? sectionTypeValues.reverse[type] ?? '';

  String variantLabel(SectionType type, String variant) =>
      info(type)?.variants.where((v) => v.id == variant).firstOrNull?.label ??
      variant;

  /// The heading a section shows (its title option, else the default).
  String title(SectionSpec s) {
    final t = s.options['title'];
    if (t is String && t.trim().isNotEmpty) return t.trim();
    final d = info(s.type)?.defaultTitle ?? '';
    return d.isEmpty ? label(s.type) : d;
  }
}
