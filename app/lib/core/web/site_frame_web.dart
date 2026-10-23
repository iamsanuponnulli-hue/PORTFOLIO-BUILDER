import 'dart:async';
import 'dart:js_interop';

import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

import 'site_frame_controller.dart';

export 'site_frame_controller.dart';

/// Shows [html] in an iframe that may run its own scripts but can't reach this
/// app (no allow-same-origin), so user code in the site can't read keys or data.
/// The page and the app talk only through postMessage ([onMessage], [controller]).
///
/// A new [html] loads in a hidden second iframe that replaces the visible one once
/// it has loaded, so edits don't flash a blank page. While [scrollKey] stays the
/// same (the editor passes the page name), the new page opens at the old one's
/// scroll position instead of jumping to the top.
class SiteFrame extends StatefulWidget {
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
  State<SiteFrame> createState() => _SiteFrameState();
}

/// Reports the page's scroll position to the app (only added with a scrollKey).
const _reportScroll =
    '<script>(function(){var t;addEventListener("scroll",function(){clearTimeout(t);'
    't=setTimeout(function(){parent.postMessage({pbFrame:"scroll",y:scrollY},"*")},80)},'
    '{passive:true})})()</script>';

/// Restores a scroll position once the page has its final height (fonts and
/// images loaded), without the site's smooth scrolling.
String _restoreScroll(double y) =>
    '<script>addEventListener("load",function(){var s=document.documentElement.style;'
    's.scrollBehavior="auto";scrollTo(0,${y.round()});s.scrollBehavior=""})</script>';

class _SiteFrameState extends State<SiteFrame> {
  web.HTMLIFrameElement? _front;
  web.HTMLIFrameElement? _back;
  StreamSubscription<web.MessageEvent>? _messages;
  final _loads = <StreamSubscription<web.Event>>[];
  Timer? _fallback;
  var _swapPending = false;
  double _scrollY = 0;

  @override
  void initState() {
    super.initState();
    widget.controller?.attach(_post);
    _messages = web.EventStreamProviders.messageEvent
        .forTarget(web.window)
        .listen(_onMessage);
  }

  bool _from(web.MessageEvent e, web.HTMLIFrameElement? f) {
    final w = f?.contentWindow;
    return w != null && (e.source?.strictEquals(w).toDart ?? false);
  }

  void _onMessage(web.MessageEvent e) {
    final fromFront = _from(e, _front);
    // The page loading in the background announces itself before it's shown.
    if (!fromFront && !_from(e, _back)) return;
    final data = e.data.dartify();
    if (data is! Map) return;
    if (data['pbFrame'] == 'scroll') {
      if (fromFront) _scrollY = (data['y'] as num?)?.toDouble() ?? 0;
      return;
    }
    widget.onMessage?.call(data.cast<String, Object?>());
  }

  /// Messages go to both pages: the one in the background is about to be shown.
  void _post(Map<String, Object?> message) {
    for (final f in [_front, _back]) {
      f?.contentWindow?.postMessage(message.jsify(), '*'.toJS);
    }
  }

  String _document(String html, {required bool keepScroll}) {
    if (widget.scrollKey == null) return html;
    final extra =
        _reportScroll +
        (keepScroll && _scrollY > 0 ? _restoreScroll(_scrollY) : '');
    final at = html.indexOf('<head>');
    return at < 0 ? '$extra$html' : html.replaceRange(at + 6, at + 6, extra);
  }

  void _load(String html, {required bool keepScroll}) {
    final back = _back;
    if (back == null) return;
    if (!keepScroll) _scrollY = 0;
    _swapPending = true;
    back.srcdoc = _document(html, keepScroll: keepScroll).toJS;
    // A page whose load never finishes (a stuck image) still gets shown.
    _fallback?.cancel();
    _fallback = Timer(const Duration(seconds: 4), _swap);
  }

  void _onLoad(web.HTMLIFrameElement f) {
    if (identical(f, _back) && _swapPending) _swap();
  }

  void _swap() {
    _fallback?.cancel();
    if (!_swapPending) return;
    _swapPending = false;
    final old = _front;
    final next = _back;
    if (old == null || next == null) return;
    _show(next, true);
    _show(old, false);
    _front = next;
    _back = old;
    // Stop the old page's scripts and free its memory.
    old.srcdoc = ''.toJS;
  }

  void _show(web.HTMLIFrameElement f, bool visible) {
    f.style
      ..visibility = visible ? 'visible' : 'hidden'
      ..pointerEvents = visible ? 'auto' : 'none';
    if (visible) {
      f.removeAttribute('aria-hidden');
      f.removeAttribute('tabindex');
    } else {
      f.setAttribute('aria-hidden', 'true');
      f.setAttribute('tabindex', '-1');
    }
  }

  @override
  void didUpdateWidget(SiteFrame old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller?.attach(null);
      widget.controller?.attach(_post);
    }
    if (old.html != widget.html) {
      _load(widget.html, keepScroll: old.scrollKey == widget.scrollKey);
    }
  }

  @override
  void dispose() {
    _fallback?.cancel();
    _messages?.cancel();
    for (final l in _loads) {
      l.cancel();
    }
    widget.controller?.attach(null);
    super.dispose();
  }

  web.HTMLIFrameElement _iframe() {
    final f = web.document.createElement('iframe') as web.HTMLIFrameElement;
    f.setAttribute('sandbox', 'allow-scripts allow-popups');
    f.setAttribute('title', 'Site preview');
    f.style
      ..position = 'absolute'
      ..inset = '0'
      ..border = '0'
      ..width = '100%'
      ..height = '100%'
      ..backgroundColor = 'white';
    _loads.add(
      web.EventStreamProviders.loadEvent.forTarget(f).listen((_) => _onLoad(f)),
    );
    return f;
  }

  @override
  Widget build(BuildContext context) => HtmlElementView.fromTagName(
    key: const Key('site-frame'),
    tagName: 'div',
    onElementCreated: (e) {
      final box = e as web.HTMLDivElement;
      box.style
        ..position = 'relative'
        ..width = '100%'
        ..height = '100%'
        ..overflow = 'hidden'
        ..backgroundColor = 'white';
      final front = _iframe();
      final back = _iframe();
      _show(back, false);
      box
        ..append(back)
        ..append(front);
      front.srcdoc = _document(widget.html, keepScroll: false).toJS;
      _front = front;
      _back = back;
    },
  );
}
