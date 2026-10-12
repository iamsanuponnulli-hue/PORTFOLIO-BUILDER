import 'dart:convert';
import 'dart:io';

import 'package:portfolio_builder/core/templates.dart';

/// Loads the real generated templates from the asset file.
Templates loadTemplates() {
  final raw = File('assets/schema/templates.json').readAsStringSync();
  return Templates(jsonDecode(raw) as Map<String, dynamic>);
}
