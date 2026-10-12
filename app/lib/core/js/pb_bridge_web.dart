import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'pb_bridge_types.dart';

@JS('pb')
external _PbApi? get _pb;

extension type _PbApi._(JSObject _) implements JSObject {
  external String get version;
  external String ping();
  external _PbWorker get worker;
  external String previewDocument(String filesJson, String page);
  external void setUser(String uid);
  external _PbAi get ai;
}

extension type _PbAi._(JSObject _) implements JSObject {
  external String providers();
}

extension type _PbWorker._(JSObject _) implements JSObject {
  external JSPromise<JSString> ping();
  external JSPromise<JSString> normalizeContent(String json);
  external JSPromise<JSString> defaultSpec(
    String profileType,
    String? presetId,
  );
  external JSPromise<JSString> applyOperations(
    String stateJson,
    String opsJson,
  );
  external JSPromise<JSString> render(String stateJson, String optionsJson);
}

PbBridge createPbBridge() => _WebBridge();

JSAny? _toJs(Object? v) => switch (v) {
  null => null,
  final String s => s.toJS,
  final num n => n.toJS,
  final bool b => b.toJS,
  _ => throw ArgumentError('Unsupported bridge argument: $v'),
};

class _WebBridge implements PbBridge {
  _PbApi get _api => _pb ?? (throw const PbUnavailable());

  @override
  bool get available => _pb != null;

  @override
  String get version => _pb?.version ?? 'unavailable';

  @override
  String ping() => _api.ping();

  @override
  Future<String> workerPing() async => (await _api.worker.ping().toDart).toDart;

  @override
  Future<String> normalizeContent(String json) async =>
      (await _api.worker.normalizeContent(json).toDart).toDart;

  @override
  Future<String> defaultSpec(String profileType, [String? presetId]) async =>
      (await _api.worker.defaultSpec(profileType, presetId).toDart).toDart;

  @override
  Future<String> applyOperations(String stateJson, String opsJson) async =>
      (await _api.worker.applyOperations(stateJson, opsJson).toDart).toDart;

  @override
  Future<String> render(String stateJson, String optionsJson) async =>
      (await _api.worker.render(stateJson, optionsJson).toDart).toDart;

  @override
  String previewDocument(String filesJson, [String page = 'index.html']) =>
      _api.previewDocument(filesJson, page);

  @override
  void setUser(String uid) => _pb?.setUser(uid);

  @override
  String providersJson() => _pb?.ai.providers() ?? '[]';

  @override
  Future<PbResult> invoke(
    String namespace,
    String method, [
    List<Object?> args = const [],
  ]) async {
    final api = _pb;
    if (api == null) {
      return const PbResult.error(
        'unavailable',
        'The browser packages are not loaded.',
      );
    }
    final target = api.getProperty<JSObject>(namespace.toJS);
    final promise = target.callMethodVarArgs<JSPromise<JSString>>(
      method.toJS,
      args.map(_toJs).toList(),
    );
    return PbResult.parse((await promise.toDart).toDart);
  }
}
