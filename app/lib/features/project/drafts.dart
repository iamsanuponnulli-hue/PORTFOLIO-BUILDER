import 'dart:convert';

import '../../core/js/pb_bridge.dart';

/// Unsynced edits kept on this device (IndexedDB via the bridge).
abstract interface class DraftStore {
  Future<void> save(
    String projectId,
    int baseRevision,
    Map<String, dynamic> data,
  );
  Future<({int baseRevision, Map<String, dynamic> data})?> get(
    String projectId,
  );
  Future<void> remove(String projectId);
}

class BridgeDraftStore implements DraftStore {
  BridgeDraftStore(this._pb);
  final PbBridge _pb;

  @override
  Future<void> save(
    String projectId,
    int baseRevision,
    Map<String, dynamic> data,
  ) async => (await _pb.invoke('drafts', 'save', [
    projectId,
    baseRevision,
    jsonEncode(data),
  ])).get<Object?>();

  @override
  Future<({int baseRevision, Map<String, dynamic> data})?> get(
    String projectId,
  ) async {
    final r = await _pb.invoke('drafts', 'get', [projectId]);
    if (!r.ok || r.value == null) return null;
    final m = jsonMap(r.value);
    return (
      baseRevision: (m['baseRevision'] as num).toInt(),
      data: jsonMap(m['data']),
    );
  }

  @override
  Future<void> remove(String projectId) async =>
      _pb.invoke('drafts', 'remove', [projectId]);
}
