import 'package:firebase_auth/firebase_auth.dart';

import '../dashboard/project_repository.dart';
import 'user_repository.dart';

/// Thrown when the account was signed in too long ago to be deleted safely.
class RecentSignInRequired implements Exception {
  const RecentSignInRequired();
  @override
  String toString() =>
      'For your security, sign out, sign in again, and then delete your account.';
}

/// Deletes an account and everything it owns.
///
/// There is no server function on the free plan, so the app does the cleanup:
/// projects (with their history) first, then the user document, then the sign-in
/// account itself. Firebase only deletes accounts that signed in recently, so that
/// is checked up front — otherwise the data could be gone while the account stays.
class AccountService {
  AccountService(
    this._auth,
    this._users,
    this._projects, {
    DateTime Function()? clock,
    this.signedInAt,
  }) : _clock = clock ?? DateTime.now;

  final FirebaseAuth _auth;
  final UserRepository _users;
  final ProjectRepository _projects;
  final DateTime Function() _clock;

  /// When the current sign-in happened (overridable in tests).
  final Future<DateTime?> Function()? signedInAt;

  static const recentWindow = Duration(minutes: 5);

  Future<void> deleteAccount() async {
    final user = _auth.currentUser;
    if (user == null) return;
    final when = signedInAt != null
        ? await signedInAt!()
        : (await user.getIdTokenResult()).authTime;
    if (when == null || _clock().difference(when) > recentWindow) {
      throw const RecentSignInRequired();
    }
    final projects = await _projects.watchAll(user.uid).first;
    for (final p in projects) {
      await _projects.delete(uid: user.uid, entry: p);
    }
    await _users.delete(user.uid);
    await user.delete();
  }
}
