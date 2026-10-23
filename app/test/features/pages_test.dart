import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:portfolio_builder/app/providers.dart';
import 'package:portfolio_builder/features/auth/sign_in_page.dart';
import 'package:portfolio_builder/features/dashboard/dashboard_page.dart';

import '../helpers.dart';

void main() {
  setUp(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    binding.platformDispatcher.views.first.physicalSize = const Size(1280, 900);
    binding.platformDispatcher.views.first.devicePixelRatio = 1;
  });

  Widget wrap(Widget child, List overrides) => ProviderScope(
    overrides: [
      templatesProvider.overrideWithValue(loadTemplates()),
      ...overrides.cast(),
    ],
    child: MaterialApp(home: child),
  );

  testWidgets('sign-in page offers Google only', (tester) async {
    await tester.pumpWidget(
      wrap(const SignInPage(), [
        firebaseAuthProvider.overrideWithValue(MockFirebaseAuth()),
      ]),
    );
    expect(find.text('Continue with Google'), findsOneWidget);
    expect(find.text('Continue with GitHub'), findsNothing);
    expect(find.byKey(const Key('email')), findsNothing);
  });

  testWidgets('dashboard creates a portfolio and shows the count', (
    tester,
  ) async {
    final user = MockUser(
      uid: 'alice',
      email: 'a@example.com',
      isEmailVerified: true,
    );
    final auth = MockFirebaseAuth(signedIn: true, mockUser: user);
    final db = FakeFirebaseFirestore();
    await tester.pumpWidget(
      wrap(const DashboardPage(), [
        firebaseAuthProvider.overrideWithValue(auth),
        firestoreProvider.overrideWithValue(db),
      ]),
    );
    await tester.pumpAndSettle();
    expect(find.text('No portfolios yet'), findsOneWidget);
    expect(find.text('0 of 5 used'), findsOneWidget);

    // fake_cloud_firestore doesn't notify listeners about transaction writes,
    // so seed the project directly (repository writes are covered elsewhere).
    final t = loadTemplates();
    await tester.runAsync(() async {
      await db.collection('projects').add({
        'ownerId': 'alice',
        'name': 'Jane — Dev',
        'profileType': 'developer',
        'status': 'draft',
        'goals': t.goals,
        'content': t.content,
        'custom': t.custom,
        'contactForm': t.contactForm,
        'revision': 0,
        'createdAt': 0,
        'updatedAt': 0,
      });
      await db.doc('users/alice').update({'projectCount': 1});
    });
    await tester.pumpAndSettle();
    expect(find.text('Jane — Dev'), findsOneWidget);
    expect(find.text('1 of 5 used'), findsOneWidget);
  });

  testWidgets('new portfolio dialog requires a name', (tester) async {
    final user = MockUser(
      uid: 'alice',
      email: 'a@example.com',
      isEmailVerified: true,
    );
    await tester.pumpWidget(
      wrap(const DashboardPage(), [
        firebaseAuthProvider.overrideWithValue(
          MockFirebaseAuth(signedIn: true, mockUser: user),
        ),
        firestoreProvider.overrideWithValue(FakeFirebaseFirestore()),
      ]),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('new-project')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('create-project')));
    await tester.pump();
    expect(find.text('Give your portfolio a name.'), findsOneWidget);
  });
}
