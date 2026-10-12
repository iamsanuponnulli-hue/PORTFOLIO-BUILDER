import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:portfolio_builder/features/account/account_service.dart';
import 'package:portfolio_builder/features/account/user_repository.dart';
import 'package:portfolio_builder/features/dashboard/project_repository.dart';

import '../helpers.dart';

void main() {
  final now = DateTime(2026, 10, 12, 10);

  Future<(FakeFirebaseFirestore, MockFirebaseAuth, AccountService)> setUpWith(
    DateTime signedInAt,
  ) async {
    final db = FakeFirebaseFirestore();
    final user = MockUser(
      uid: 'alice',
      email: 'a@example.com',
      isEmailVerified: true,
    );
    final auth = MockFirebaseAuth(signedIn: true, mockUser: user);
    final users = UserRepository(db, clock: () => now);
    final projects = ProjectRepository(db, loadTemplates(), clock: () => now);
    await users.ensure(uid: 'alice');
    // Seed directly: fake_cloud_firestore doesn't notify listeners about transactions.
    final t = loadTemplates();
    await db.collection('projects').add({
      'ownerId': 'alice',
      'name': 'A',
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
    final service = AccountService(
      auth,
      users,
      projects,
      clock: () => now,
      signedInAt: () async => signedInAt,
    );
    return (db, auth, service);
  }

  test('deletes projects, the user document and the account', () async {
    final (db, auth, service) = await setUpWith(
      now.subtract(const Duration(minutes: 1)),
    );
    await service.deleteAccount();
    expect((await db.collection('projects').get()).docs, isEmpty);
    expect((await db.doc('users/alice').get()).exists, isFalse);
  });

  test('refuses before touching data when the sign-in is old', () async {
    final (db, auth, service) = await setUpWith(
      now.subtract(const Duration(hours: 2)),
    );
    await expectLater(
      service.deleteAccount(),
      throwsA(isA<RecentSignInRequired>()),
    );
    expect((await db.collection('projects').get()).docs, hasLength(1));
    expect(auth.currentUser, isNotNull);
  });
}
