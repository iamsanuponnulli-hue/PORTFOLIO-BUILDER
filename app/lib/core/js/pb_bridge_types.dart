/// What the Dart side can call on window.pb. Grows with each phase.
abstract interface class PbBridge {
  bool get available;
  String get version;

  /// Synchronous call on the page.
  String ping();

  /// Round trip through the background worker.
  Future<String> workerPing();

  /// Applies the shared schema's defaults to portfolio content (runs in the worker).
  Future<String> normalizeContent(String json);
}

class PbUnavailable implements Exception {
  const PbUnavailable();
  @override
  String toString() => 'The browser packages (pb.js) are not loaded.';
}
