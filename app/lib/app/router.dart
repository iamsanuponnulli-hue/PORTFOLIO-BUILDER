import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/ai/ai_settings_page.dart';
import '../features/auth/auth_repository.dart';
import '../features/auth/sign_in_page.dart';
import '../features/auth/verify_email_page.dart';
import '../features/dashboard/dashboard_page.dart';
import '../features/design/directions_page.dart';
import '../features/editor/editor_page.dart';
import '../features/settings/settings_page.dart';
import '../features/setup/setup_page.dart';
import 'providers.dart';

enum AuthState { loading, signedOut, needsVerification, signedIn }

/// Where to send the user for a given auth state, or null to stay.
/// Signed-out users go to /signin and come back to where they were heading.
String? authRedirect(AuthState state, Uri location) {
  final path = location.path;
  final from = location.queryParameters['from'];
  switch (state) {
    case AuthState.loading:
      return null;
    case AuthState.signedOut:
      if (path == '/signin') return null;
      final target = location.toString();
      return target == '/'
          ? '/signin'
          : Uri(path: '/signin', queryParameters: {'from': target}).toString();
    case AuthState.needsVerification:
      return path == '/verify-email' ? null : '/verify-email';
    case AuthState.signedIn:
      if (path == '/signin' || path == '/verify-email') {
        return (from != null && from.startsWith('/') && !from.startsWith('//'))
            ? from
            : '/';
      }
      return null;
  }
}

AuthState authStateOf(AsyncValue<User?> user) => switch (user) {
  AsyncData(value: null) => AuthState.signedOut,
  AsyncData(:final value?) =>
    needsEmailVerification(value)
        ? AuthState.needsVerification
        : AuthState.signedIn,
  AsyncError() => AuthState.signedOut,
  _ => AuthState.loading,
};

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier(0);
  ref.listen(authUserProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    refreshListenable: refresh,
    redirect: (context, state) =>
        authRedirect(authStateOf(ref.read(authUserProvider)), state.uri),
    routes: [
      GoRoute(path: '/signin', builder: (_, _) => const SignInPage()),
      GoRoute(
        path: '/verify-email',
        builder: (_, _) => const VerifyEmailPage(),
      ),
      GoRoute(path: '/', builder: (_, _) => const DashboardPage()),
      GoRoute(path: '/settings', builder: (_, _) => const SettingsPage()),
      GoRoute(
        path: '/settings/ai',
        builder: (_, state) =>
            AiSettingsPage(openRouterCode: state.uri.queryParameters['code']),
      ),
      GoRoute(
        path: '/p/:id',
        builder: (_, state) =>
            EditorPage(projectId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/p/:id/designs',
        builder: (_, state) =>
            DirectionsPage(projectId: state.pathParameters['id']!),
      ),
      // Not nested under /p/:id: each page owns the only open session.
      GoRoute(
        path: '/p/:id/setup',
        builder: (_, state) => SetupPage(
          projectId: state.pathParameters['id']!,
          step: SetupStep.parse(state.uri.queryParameters['step']),
        ),
      ),
    ],
  );
});
