import 'dart:js_interop';

import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

/// Shows [html] in an iframe that may run its own scripts but can't reach this
/// app (no allow-same-origin), so user code in the site can't read keys or data.
class SiteFrame extends StatefulWidget {
  const SiteFrame({super.key, required this.html});
  final String html;

  @override
  State<SiteFrame> createState() => _SiteFrameState();
}

class _SiteFrameState extends State<SiteFrame> {
  web.HTMLIFrameElement? _frame;

  @override
  void didUpdateWidget(SiteFrame old) {
    super.didUpdateWidget(old);
    if (old.html != widget.html) _frame?.srcdoc = widget.html.toJS;
  }

  @override
  Widget build(BuildContext context) => HtmlElementView.fromTagName(
    key: const Key('site-frame'),
    tagName: 'iframe',
    onElementCreated: (e) {
      final f = e as web.HTMLIFrameElement;
      f.setAttribute('sandbox', 'allow-scripts allow-popups');
      f.setAttribute('title', 'Site preview');
      f.style
        ..border = '0'
        ..width = '100%'
        ..height = '100%'
        ..backgroundColor = 'white';
      f.srcdoc = widget.html.toJS;
      _frame = f;
    },
  );
}
