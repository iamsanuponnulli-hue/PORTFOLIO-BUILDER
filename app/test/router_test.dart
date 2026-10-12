import 'package:flutter_test/flutter_test.dart';
import 'package:portfolio_builder/app/router.dart';

void main() {
  Uri u(String s) => Uri.parse(s);

  group('authRedirect', () {
    test('waits while auth is loading', () {
      expect(authRedirect(AuthState.loading, u('/settings')), isNull);
    });

    test('sends signed-out users to sign-in and remembers the target', () {
      expect(authRedirect(AuthState.signedOut, u('/')), '/signin');
      expect(
        authRedirect(AuthState.signedOut, u('/p/abc')),
        '/signin?from=%2Fp%2Fabc',
      );
      expect(authRedirect(AuthState.signedOut, u('/signin')), isNull);
    });

    test('holds unverified email users on the verification page', () {
      expect(
        authRedirect(AuthState.needsVerification, u('/')),
        '/verify-email',
      );
      expect(
        authRedirect(AuthState.needsVerification, u('/verify-email')),
        isNull,
      );
    });

    test('returns signed-in users to where they were heading', () {
      expect(
        authRedirect(AuthState.signedIn, u('/signin?from=%2Fp%2Fabc')),
        '/p/abc',
      );
      expect(authRedirect(AuthState.signedIn, u('/signin')), '/');
      expect(authRedirect(AuthState.signedIn, u('/verify-email')), '/');
      expect(authRedirect(AuthState.signedIn, u('/settings')), isNull);
    });

    test('ignores unsafe return targets', () {
      expect(
        authRedirect(
          AuthState.signedIn,
          u('/signin?from=https://evil.example'),
        ),
        '/',
      );
      expect(
        authRedirect(AuthState.signedIn, u('/signin?from=//evil.example')),
        '/',
      );
    });
  });
}
