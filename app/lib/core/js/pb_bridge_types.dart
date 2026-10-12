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

  /// Starting design (SiteSpec JSON) for a profile type, optionally with a theme preset.
  Future<String> defaultSpec(String profileType, [String? presetId]);

  /// Validates and applies operations to a site state. Returns the new state JSON.
  Future<String> applyOperations(String stateJson, String opsJson);

  /// Builds the site. Returns `{files, checks, fonts}` as JSON.
  Future<String> render(String stateJson, String optionsJson);

  /// One self-contained HTML document for the sandboxed preview iframe.
  String previewDocument(String filesJson, [String page = 'index.html']);
}

class PbUnavailable implements Exception {
  const PbUnavailable();
  @override
  String toString() => 'The browser packages (pb.js) are not loaded.';
}
