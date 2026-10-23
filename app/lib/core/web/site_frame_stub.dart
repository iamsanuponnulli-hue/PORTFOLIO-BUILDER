import 'package:flutter/widgets.dart';

import 'site_frame_controller.dart';

export 'site_frame_controller.dart';

/// Stand-in used in tests: shows nothing, keeps the document for assertions.
class SiteFrame extends StatelessWidget {
  const SiteFrame({
    super.key,
    required this.html,
    this.controller,
    this.onMessage,
    this.scrollKey,
  });
  final String html;
  final SiteFrameController? controller;
  final ValueChanged<Map<String, Object?>>? onMessage;
  final String? scrollKey;

  @override
  Widget build(BuildContext context) =>
      const SizedBox.expand(key: Key('site-frame'));
}
