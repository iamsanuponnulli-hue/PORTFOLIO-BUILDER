import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'providers.dart';
import 'router.dart';
import 'theme.dart';

class PortfolioBuilderApp extends ConsumerWidget {
  const PortfolioBuilderApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(deviceUserProvider);
    // Keeps the user document (AI choice, project count) loaded for every screen.
    ref.listen(userDocProvider, (_, _) {});
    return MaterialApp.router(
      title: 'Portfolio Builder',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      routerConfig: ref.watch(routerProvider),
    );
  }
}
