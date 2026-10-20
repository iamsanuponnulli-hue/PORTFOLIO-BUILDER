import 'dart:convert';

/// Result of a bridge call that can fail: `{"ok":true,"value":…}` or
/// `{"ok":false,"error":{"code","message"}}` (see packages/bridge/src/main.ts).
class PbResult {
  const PbResult.ok(this.value) : errorCode = null, errorMessage = null;
  const PbResult.error(this.errorCode, this.errorMessage) : value = null;

  final Object? value;
  final String? errorCode;
  final String? errorMessage;

  bool get ok => errorCode == null;

  factory PbResult.parse(String json) {
    final m = jsonDecode(json) as Map<String, dynamic>;
    if (m['ok'] == true) return PbResult.ok(m['value']);
    final e = (m['error'] as Map?) ?? const {};
    return PbResult.error(
      e['code'] as String? ?? 'error',
      e['message'] as String? ?? 'Something went wrong.',
    );
  }

  /// The value, or throws [PbException] with the friendly message.
  T get<T>() {
    if (!ok) throw PbException(errorCode!, errorMessage!);
    return value as T;
  }
}

class PbException implements Exception {
  const PbException(this.code, this.message);
  final String code;
  final String message;
  @override
  String toString() => message;
}

/// What the Dart side can call on window.pb.
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
  /// With [editor], text can be edited inline and sections selected.
  String previewDocument(
    String filesJson, [
    String page = 'index.html',
    bool editor = false,
  ]);

  /// Small settings kept on this device for the signed-in user ('' when unset).
  String prefsGet(String key);
  void prefsSet(String key, String value);

  /// Section types and layouts, presets and fonts (JSON; see Catalog).
  String catalogJson();

  /// The companion extension's version, or '' when it isn't installed.
  String extensionVersion();

  /// Switches on-device storage to this user ('' after sign-out).
  void setUser(String uid);

  /// AI providers with free-tier flags and key guides (JSON array).
  String providersJson();

  /// Calls `pb.<namespace>.<method>(...args)`, which resolves to a [PbResult] JSON.
  Future<PbResult> invoke(
    String namespace,
    String method, [
    List<Object?> args = const [],
  ]);
}

class PbUnavailable implements Exception {
  const PbUnavailable();
  @override
  String toString() => 'The browser packages (pb.js) are not loaded.';
}

List<Map<String, dynamic>> jsonList(Object? v) =>
    (v as List? ?? const []).cast<Map<String, dynamic>>();

Map<String, dynamic> jsonMap(Object? v) =>
    (v as Map?)?.cast<String, dynamic>() ?? const {};

String encode(Object? v) => jsonEncode(v);
