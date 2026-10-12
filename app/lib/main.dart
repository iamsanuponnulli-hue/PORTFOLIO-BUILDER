import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_plugins/url_strategy.dart';

import 'app/app.dart';
import 'app/providers.dart';
import 'core/firebase/firebase_setup.dart';
import 'core/templates.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  usePathUrlStrategy(); // /p/abc instead of /#/p/abc (hosting rewrites to index.html)
  await initFirebase();
  final templates = await Templates.load();
  runApp(
    ProviderScope(
      overrides: [templatesProvider.overrideWithValue(templates)],
      child: const PortfolioBuilderApp(),
    ),
  );
}
