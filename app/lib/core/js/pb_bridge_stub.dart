import 'pb_bridge_types.dart';

PbBridge createPbBridge() => const _UnavailableBridge();

class _UnavailableBridge implements PbBridge {
  const _UnavailableBridge();
  @override
  bool get available => false;
  @override
  String get version => 'unavailable';
  @override
  String ping() => throw const PbUnavailable();
  @override
  Future<String> workerPing() => Future.error(const PbUnavailable());
  @override
  Future<String> normalizeContent(String json) =>
      Future.error(const PbUnavailable());
  @override
  Future<String> defaultSpec(String profileType, [String? presetId]) =>
      Future.error(const PbUnavailable());
  @override
  Future<String> applyOperations(String stateJson, String opsJson) =>
      Future.error(const PbUnavailable());
  @override
  Future<String> render(String stateJson, String optionsJson) =>
      Future.error(const PbUnavailable());
  @override
  String previewDocument(String filesJson, [String page = 'index.html']) =>
      throw const PbUnavailable();
  @override
  void setUser(String uid) {}
  @override
  String providersJson() => '[]';
  @override
  Future<PbResult> invoke(
    String namespace,
    String method, [
    List<Object?> args = const [],
  ]) async => const PbResult.error(
    'unavailable',
    'The browser packages (pb.js) are not loaded.',
  );
}
