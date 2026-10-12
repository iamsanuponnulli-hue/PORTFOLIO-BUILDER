import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/js/pb_bridge.dart';
import '../core/templates.dart';
import '../features/account/account_service.dart';
import '../features/account/user_repository.dart';
import '../features/auth/auth_repository.dart';
import '../features/dashboard/project_repository.dart';
import '../models/generated/models.dart';

// Infrastructure — overridden in tests.
final firebaseAuthProvider = Provider<FirebaseAuth>(
  (ref) => FirebaseAuth.instance,
);
final firestoreProvider = Provider<FirebaseFirestore>(
  (ref) => FirebaseFirestore.instance,
);
final templatesProvider = Provider<Templates>(
  (ref) => throw UnimplementedError('loaded in main'),
);
final pbBridgeProvider = Provider<PbBridge>((ref) => createPbBridge());

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(firebaseAuthProvider)),
);
final userRepositoryProvider = Provider<UserRepository>(
  (ref) => UserRepository(ref.watch(firestoreProvider)),
);
final projectRepositoryProvider = Provider<ProjectRepository>(
  (ref) => ProjectRepository(
    ref.watch(firestoreProvider),
    ref.watch(templatesProvider),
  ),
);

final accountServiceProvider = Provider<AccountService>(
  (ref) => AccountService(
    ref.watch(firebaseAuthProvider),
    ref.watch(userRepositoryProvider),
    ref.watch(projectRepositoryProvider),
  ),
);

/// The signed-in Firebase user (null when signed out). Emits on verification changes too.
final authUserProvider = StreamProvider<User?>(
  (ref) => ref.watch(authRepositoryProvider).userChanges(),
);

/// Creates users/{uid} on first sign-in, then streams it.
final userDocProvider = StreamProvider<UserDoc?>((ref) async* {
  final user = ref.watch(authUserProvider).value;
  if (user == null || needsEmailVerification(user)) {
    yield null;
    return;
  }
  final repo = ref.watch(userRepositoryProvider);
  await repo.ensure(
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
  );
  yield* repo.watch(user.uid);
});

final projectsProvider = StreamProvider<List<ProjectEntry>>((ref) {
  final user = ref.watch(authUserProvider).value;
  final userDoc = ref.watch(userDocProvider).value;
  // Wait for the user document so project writes can update its counter.
  if (user == null || userDoc == null) return const Stream.empty();
  return ref.watch(projectRepositoryProvider).watchAll(user.uid);
});

final projectProvider = StreamProvider.family<ProjectEntry?, String>(
  (ref, id) => ref.watch(projectRepositoryProvider).watch(id),
);
