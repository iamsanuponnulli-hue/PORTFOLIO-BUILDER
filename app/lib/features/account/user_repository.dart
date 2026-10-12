import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/generated/models.dart';

/// users/{uid}: profile and AI preferences. API keys are never stored here.
class UserRepository {
  UserRepository(this._db, {DateTime Function()? clock})
    : _clock = clock ?? DateTime.now;
  final FirebaseFirestore _db;
  final DateTime Function() _clock;

  DocumentReference<Map<String, dynamic>> _ref(String uid) =>
      _db.doc('users/$uid');

  /// Creates the user document on first sign-in. Safe to call repeatedly.
  Future<void> ensure({
    required String uid,
    String? displayName,
    String? email,
  }) async {
    final ref = _ref(uid);
    final snap = await ref.get();
    if (snap.exists) return;
    final doc = UserDoc(
      ai: AiSettings(mode: Mode.STARTER, simple: true),
      createdAt: _clock().millisecondsSinceEpoch,
      displayName: displayName ?? '',
      email: email ?? '',
      projectCount: 0,
    );
    await ref.set(_withoutNulls(doc.toJson()));
  }

  Stream<UserDoc?> watch(String uid) => _ref(uid).snapshots().map(
    (s) => s.exists && s.data() != null ? UserDoc.fromJson(s.data()!) : null,
  );
}

/// Firestore rules use `keys().hasOnly(...)`, so drop null optionals instead of storing them.
Map<String, dynamic> _withoutNulls(Map<String, dynamic> m) => {
  for (final e in m.entries)
    if (e.value != null)
      e.key: e.value is Map<String, dynamic> ? _withoutNulls(e.value) : e.value,
};
