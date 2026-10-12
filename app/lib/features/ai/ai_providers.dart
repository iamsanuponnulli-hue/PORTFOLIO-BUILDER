import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import 'ai_repository.dart';

final aiRepositoryProvider = Provider<AiRepository>(
  (ref) =>
      AiRepository(ref.watch(pbBridgeProvider), ref.watch(firestoreProvider)),
);

/// Keys saved on this device. Refresh with `ref.invalidate(savedKeysProvider)`.
final savedKeysProvider = FutureProvider<List<SavedKey>>((ref) {
  // Keys are stored per user on this device; reload when the user changes.
  ref.watch(deviceUserProvider);
  return ref.watch(aiRepositoryProvider).keys();
});

/// The provider and model the user picked, if any, and whether its key is on this device.
final aiChoiceProvider = Provider<AiChoice?>((ref) {
  final smart = ref.watch(userDocProvider).value?.ai.smart;
  if (smart == null) return null;
  return AiChoice(smart.provider, smart.model);
});

/// The chosen provider and model when its key is on this device, else null.
/// Waits for the user doc, so it's safe to read before anything has loaded.
final readyAiProvider = FutureProvider<AiChoice?>((ref) async {
  final smart = (await ref.watch(userDocProvider.future))?.ai.smart;
  if (smart == null) return null;
  final keys = await ref.watch(savedKeysProvider.future);
  return keys.any((k) => k.provider == smart.provider)
      ? AiChoice(smart.provider, smart.model)
      : null;
});
