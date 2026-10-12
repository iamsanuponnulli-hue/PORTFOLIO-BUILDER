import 'dart:js_interop';

import 'pb_bridge_types.dart';

@JS('pb')
external _PbApi? get _pb;

extension type _PbApi._(JSObject _) implements JSObject {
  external String get version;
  external String ping();
  external _PbWorker get worker;
}

extension type _PbWorker._(JSObject _) implements JSObject {
  external JSPromise<JSString> ping();
  external JSPromise<JSString> normalizeContent(String json);
}

PbBridge createPbBridge() => _WebBridge();

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
}
