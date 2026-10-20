/// Sends messages into a [SiteFrame]'s page (e.g. switch to select mode).
class SiteFrameController {
  void Function(Map<String, Object?> message)? _post;
  final sent = <Map<String, Object?>>[];

  /// Delivered to the page with postMessage (kept in [sent] in tests).
  void post(Map<String, Object?> message) {
    sent.add(message);
    if (sent.length > 50) sent.removeAt(0);
    _post?.call(message);
  }

  // ignore: use_setters_to_change_properties
  void attach(void Function(Map<String, Object?> message)? post) =>
      _post = post;
}
