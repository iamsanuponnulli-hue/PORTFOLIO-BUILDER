import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:portfolio_builder/features/account/user_repository.dart';
import 'package:portfolio_builder/features/dashboard/project_repository.dart';
import 'package:portfolio_builder/models/generated/models.dart';

import '../helpers.dart';

void main() {
  late FakeFirebaseFirestore db;
  late ProjectRepository repo;
  var now = DateTime(2026, 10, 12, 10);

  Future<int> count() async =>
      (await db.doc('users/alice').get()).data()!['projectCount'] as int;

  setUp(() async {
    db = FakeFirebaseFirestore();
    now = DateTime(2026, 10, 12, 10);
    repo = ProjectRepository(db, loadTemplates(), clock: () => now);
    await UserRepository(
      db,
      clock: () => now,
    ).ensure(uid: 'alice', displayName: 'Alice', email: 'a@example.com');
  });

  test('user doc is created once with no API keys', () async {
    final data = (await db.doc('users/alice').get()).data()!;
    expect(data['projectCount'], 0);
    expect(data['ai'], {'simple': true});
    await UserRepository(db).ensure(uid: 'alice');
    expect((await db.doc('users/alice').get()).data()!['displayName'], 'Alice');
  });

  test(
    'create writes a full draft project from the templates and counts it',
    () async {
      final id = await repo.create(
        uid: 'alice',
        name: '  Jane  ',
        profileType: ProfileType.DESIGNER,
      );
      final doc = ProjectDoc.fromJson(
        (await db.doc('projects/$id').get()).data()!,
      );
      expect(doc.name, 'Jane');
      expect(doc.profileType, ProfileType.DESIGNER);
      expect(doc.status, ProjectStatus.DRAFT);
      expect(doc.revision, 0);
      expect(doc.content.projects, isEmpty);
      expect(doc.goals.tone, Tone.MINIMAL);
      expect(await count(), 1);
    },
  );

  test('refuses a sixth project', () async {
    for (var i = 0; i < 5; i++) {
      await repo.create(
        uid: 'alice',
        name: 'P$i',
        profileType: ProfileType.DEVELOPER,
      );
    }
    await expectLater(
      repo.create(uid: 'alice', name: 'P6', profileType: ProfileType.DEVELOPER),
      throwsA(isA<ProjectLimitReached>()),
    );
    expect(await count(), 5);
  });

  test('lists only the owner\'s projects, newest first', () async {
    await repo.create(
      uid: 'alice',
      name: 'Old',
      profileType: ProfileType.DEVELOPER,
    );
    now = now.add(const Duration(hours: 1));
    await repo.create(
      uid: 'alice',
      name: 'New',
      profileType: ProfileType.DEVELOPER,
    );
    await db.collection('projects').add({
      'ownerId': 'bob',
      'name': 'Bob',
      'updatedAt': 0,
    });
    final list = await repo.watchAll('alice').first;
    expect(list.map((e) => e.doc.name), ['New', 'Old']);
  });

  test('rename advances the revision', () async {
    final id = await repo.create(
      uid: 'alice',
      name: 'A',
      profileType: ProfileType.STUDENT,
    );
    final entry = (await repo.get(id))!;
    await repo.rename(entry, 'B');
    final after = (await repo.get(id))!;
    expect(after.doc.name, 'B');
    expect(after.doc.revision, 1);
  });

  test('duplicate copies content under a new name and counts it', () async {
    final id = await repo.create(
      uid: 'alice',
      name: 'Jane',
      profileType: ProfileType.STUDENT,
    );
    final entry = (await repo.get(id))!;
    final copyId = await repo.duplicate(uid: 'alice', source: entry);
    final copy = (await repo.get(copyId))!;
    expect(copy.doc.name, 'Copy of Jane');
    expect(copy.doc.profileType, ProfileType.STUDENT);
    expect(copy.doc.revision, 0);
    expect(await count(), 2);
  });

  test(
    'delete removes the project and its versions and frees a slot',
    () async {
      final id = await repo.create(
        uid: 'alice',
        name: 'A',
        profileType: ProfileType.STUDENT,
      );
      await db.collection('projects/$id/versions').add({
        'source': 'manual',
        'createdAt': 1,
      });
      final entry = (await repo.get(id))!;
      await repo.delete(uid: 'alice', entry: entry);
      expect((await db.doc('projects/$id').get()).exists, isFalse);
      expect(
        (await db.collection('projects/$id/versions').get()).docs,
        isEmpty,
      );
      expect(await count(), 0);
    },
  );
}
