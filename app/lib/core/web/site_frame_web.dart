import 'dart:async';
import 'dart:js_interop';

import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

import 'site_frame_controller.dart';

export 'site_frame_controller.dart';

/// Shows [html] in an iframe that may run its own scripts but can't reach this
/// app (no allow-same-origin), so user code in the site can't read keys or data.
/// The page and the app talk only through postMessage ([onMessage], [controller]).
class SiteFrame extends StatefulWidget {
  const SiteFrame({
    super.key,
    required this.html,
    this.controller,
    this.onMessage,
  });
  final String html;
  final SiteFrameController? controller;
  final ValueChanged<Map<String, Object?>>? onMessage;

  @override
  State<SiteFrame> createState() => _SiteFrameState();
}

class _SiteFrameState extends State<SiteFrame> {
  web.HTMLIFrameElement? _frame;
  StreamSubscription<web.MessageEvent>? _messages;

  @override
  void initState() {
    super.initState();
    widget.controller?.attach(_post);
    _messages = web.EventStreamProviders.messageEvent
        .forTarget(web.window)
        .listen(_onMessage);
  }

  void _onMessage(web.MessageEvent e) {
    final frame = _frame?.contentWindow;
    if (frame == null || widget.onMessage == null) return;
    // Only messages from this preview's own page.
    if (!(e.source?.strictEquals(frame).toDart ?? false)) return;
    final data = e.data.dartify();
    if (data is Map) widget.onMessage!(data.cast<String, Object?>());
  }

  void _post(Map<String, Object?> message) =>
      _frame?.contentWindow?.postMessage(message.jsify(), '*'.toJS);

  @override
  void didUpdateWidget(SiteFrame old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller?.attach(null);
      widget.controller?.attach(_post);
    }
    if (old.html != widget.html) _frame?.srcdoc = widget.html.toJS;
  }

  @override
  void dispose() {
    _messages?.cancel();
    widget.controller?.attach(null);
    super.dispose();
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
