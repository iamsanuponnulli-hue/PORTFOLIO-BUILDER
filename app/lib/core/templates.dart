import 'dart:convert';

import 'package:flutter/services.dart';

/// Default values generated from the shared schema (packages/schema), so Dart
/// never re-declares defaults by hand. Regenerate with `pnpm codegen`.
class Templates {
  Templates(this._data);
  final Map<String, dynamic> _data;

  static Future<Templates> load([AssetBundle? bundle]) async {
    final raw = await (bundle ?? rootBundle).loadString(
      'assets/schema/templates.json',
    );
    return Templates(jsonDecode(raw) as Map<String, dynamic>);
  }

  /// Deep copies so callers can't mutate the shared template.
  Map<String, dynamic> get content => _copy('content');
  Map<String, dynamic> get goals => _copy('goals');
  Map<String, dynamic> get custom => _copy('custom');
  Map<String, dynamic> get contactForm => _copy('contactForm');

  Map<String, dynamic> _copy(String key) =>
      jsonDecode(jsonEncode(_data[key])) as Map<String, dynamic>;
}
