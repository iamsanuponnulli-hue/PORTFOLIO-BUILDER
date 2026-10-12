import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/js/pb_bridge.dart';

/// A provider the user can add a key for (from packages/ai, via the bridge).
class AiProvider {
  const AiProvider({
    required this.id,
    required this.label,
    required this.free,
    required this.steps,
    required this.dataNote,
    this.keyUrl,
  });

  final String id;
  final String label;
  final bool free;
  final String? keyUrl;
  final List<String> steps;
  final String dataNote;

  factory AiProvider.fromJson(Map<String, dynamic> j) => AiProvider(
    id: j['id'] as String,
    label: j['label'] as String,
    free: j['free'] as bool? ?? false,
    keyUrl: j['keyUrl'] as String?,
    steps: (j['steps'] as List? ?? const []).cast<String>(),
    dataNote: j['dataNote'] as String? ?? '',
  );
}

/// A key saved on this device (only the last 4 characters are ever shown).
class SavedKey {
  const SavedKey({
    required this.provider,
    required this.label,
    required this.last4,
  });
  final String provider;
  final String label;
  final String last4;

  factory SavedKey.fromJson(Map<String, dynamic> j) => SavedKey(
    provider: j['provider'] as String,
    label: j['label'] as String? ?? j['provider'] as String,
    last4: j['last4'] as String? ?? '',
  );
}

class AiModel {
  const AiModel({
    required this.id,
    required this.label,
    required this.free,
    required this.images,
    required this.smart,
  });
  final String id;
  final String label;
  final bool free;
  final bool images;
  final bool smart;

  factory AiModel.fromJson(Map<String, dynamic> j) {
    final caps = jsonMap(j['capabilities']);
    return AiModel(
      id: j['id'] as String,
      label: j['label'] as String? ?? j['id'] as String,
      free: j['free'] as bool? ?? false,
      images: caps['images'] as bool? ?? false,
      smart: caps['smart'] as bool? ?? true,
    );
  }
}

class ModelList {
  const ModelList(this.models, this.suggested);
  final List<AiModel> models;
  final String? suggested;

  factory ModelList.fromJson(Object? v) {
    final m = jsonMap(v);
    return ModelList(
      jsonList(m['models']).map(AiModel.fromJson).toList(),
      m['suggested'] as String?,
    );
  }
}

/// The provider + model the user picked (stored in users/{uid}.ai; never the key).
class AiChoice {
  const AiChoice(this.provider, this.model);
  final String provider;
  final String model;
}

/// AI setup: keys live on this device (via the bridge), the model choice syncs
/// through the user's Firestore document.
class AiRepository {
  AiRepository(this._pb, this._db);
  final PbBridge _pb;
  final FirebaseFirestore _db;

  List<AiProvider> providers() => (jsonDecode(_pb.providersJson()) as List)
      .cast<Map<String, dynamic>>()
      .map(AiProvider.fromJson)
      .toList();

  Future<List<SavedKey>> keys() async =>
      jsonList((await _pb.invoke('keys', 'list')).get<Object?>())
          .map(SavedKey.fromJson)
          .toList();

  /// Checks the key with the provider, then saves it on this device.
  Future<ModelList> addKey({
    required String provider,
    required String apiKey,
    required String label,
    String baseUrl = '',
  }) async {
    final r = await _pb.invoke('keys', 'add', [
      provider,
      apiKey,
      baseUrl,
      label,
    ]);
    return ModelList.fromJson(r.get<Object?>());
  }

  Future<ModelList> models(String provider) async => ModelList.fromJson(
    (await _pb.invoke('keys', 'models', [provider])).get<Object?>(),
  );

  Future<void> removeKey(String provider) async =>
      (await _pb.invoke('keys', 'remove', [provider])).get<Object?>();

  /// Returns the openrouter.ai URL to send the browser to.
  Future<String> startOpenRouter(String callbackUrl) async =>
      (await _pb.invoke('openRouter', 'start', [callbackUrl])).get<String>();

  Future<ModelList> finishOpenRouter(String code) async => ModelList.fromJson(
    (await _pb.invoke('openRouter', 'finish', [code])).get<Object?>(),
  );

  Future<void> saveChoice(String uid, AiChoice choice) =>
      _db.doc('users/$uid').update({
        'ai': {
          'simple': true,
          'smart': {'provider': choice.provider, 'model': choice.model},
          'fast': {'provider': choice.provider, 'model': choice.model},
        },
      });
}
