import 'package:flutter/widgets.dart';

/// Stand-in used in tests: shows nothing, keeps the document for assertions.
class SiteFrame extends StatelessWidget {
  const SiteFrame({super.key, required this.html});
  final String html;

  @override
  Widget build(BuildContext context) =>
      const SizedBox.expand(key: Key('site-frame'));
}
