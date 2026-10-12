import 'package:firebase_auth/firebase_auth.dart';

/// Sign-in with Google, GitHub, or email + password (email must be verified).
class AuthRepository {
  AuthRepository(this._auth);
  final FirebaseAuth _auth;

  Stream<User?> userChanges() => _auth.userChanges();
  User? get currentUser => _auth.currentUser;

  Future<void> signInWithGoogle() =>
      _auth.signInWithPopup(GoogleAuthProvider());

  Future<void> signInWithGitHub() =>
      _auth.signInWithPopup(GithubAuthProvider());

  Future<void> signInWithEmail(String email, String password) =>
      _auth.signInWithEmailAndPassword(email: email.trim(), password: password);

  Future<void> signUpWithEmail(
    String name,
    String email,
    String password,
  ) async {
    final cred = await _auth.createUserWithEmailAndPassword(
      email: email.trim(),
      password: password,
    );
    await cred.user?.updateDisplayName(name.trim());
    await cred.user?.sendEmailVerification();
  }

  Future<void> sendPasswordReset(String email) =>
      _auth.sendPasswordResetEmail(email: email.trim());

  Future<void> resendVerification() async =>
      _auth.currentUser?.sendEmailVerification();

  /// Reloads the user and refreshes the ID token so security rules see the
  /// new `email_verified` value. Returns true when the email is now verified.
  Future<bool> refreshVerification() async {
    final user = _auth.currentUser;
    if (user == null) return false;
    await user.reload();
    final fresh = _auth.currentUser;
    if (fresh?.emailVerified ?? false) {
      await fresh!.getIdToken(true);
      return true;
    }
    return false;
  }

  Future<void> signOut() => _auth.signOut();

  /// Deletes the account. The server function then removes all of its data.
  Future<void> deleteAccount() async => _auth.currentUser?.delete();
}

/// Email/password accounts must verify their email; Google and GitHub accounts don't.
bool needsEmailVerification(User user) =>
    !user.emailVerified &&
    user.providerData.every((p) => p.providerId == 'password');

/// Turns Firebase error codes into sentences a person can act on.
String authErrorMessage(Object error) {
  if (error is! FirebaseAuthException) {
    return 'Something went wrong. Try again.';
  }
  return switch (error.code) {
    'invalid-email' => 'That email address doesn\'t look right.',
    'invalid-credential' ||
    'wrong-password' ||
    'user-not-found' => 'Email or password is incorrect.',
    'email-already-in-use' =>
      'An account with this email already exists. Sign in instead.',
    'weak-password' => 'Use a password with at least 8 characters.',
    'too-many-requests' =>
      'Too many attempts. Wait a few minutes and try again.',
    'popup-closed-by-user' ||
    'cancelled-popup-request' => 'Sign-in window was closed.',
    'popup-blocked' =>
      'Your browser blocked the sign-in window. Allow pop-ups and try again.',
    'account-exists-with-different-credential' =>
      'This email is already linked to another sign-in method. Use that one.',
    'requires-recent-login' =>
      'For your security, sign in again and then retry.',
    'network-request-failed' =>
      'No connection. Check your internet and try again.',
    _ => error.message ?? 'Sign-in failed. Try again.',
  };
}
