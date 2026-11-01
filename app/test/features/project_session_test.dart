import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:portfolio_builder/features/account/user_repository.dart';
import 'package:portfolio_builder/features/dashboard/project_repository.dart';
import 'package:portfolio_builder/features/project/drafts.dart';
import 'package:portfolio_builder/features/project/project_session.dart';
import 'package:portfolio_builder/models/generated/models.dart';

import '../helpers.dart';

class MemoryDrafts implements DraftStore {
  final saved = <String, ({int baseRevision, Map<String, dynamic> data})>{};

  @override
  Future<void> save(
    String id,
    int baseRevision,
    Map<String, dynamic> data,
  ) async => saved[id] = (baseRevision: baseRevision, data: data);

  @override
  Future<({int baseRevision, Map<String, dynamic> data})?> get(
    String id,
  ) async => saved[id];

  @override
  Future<void> remove(String id) async => saved.remove(id);
}

/// Refuses every save the way the security rules would for a bad field.
class RefusingRepository extends ProjectRepository {
  RefusingRepository(super.db, super.templates);

  @override
  Future<int> saveWorking(String id, ProjectDoc doc, int baseRevision) =>
      Future.error(const SaveRejected());
}

void main() {
  late FakeFirebaseFirestore db;
  late ProjectRepository repo;
  late MemoryDrafts drafts;
  late String id;

  ProjectSession open([ProjectRepository? r]) => ProjectSession(
    projectId: id,
    repo: r ?? repo,
    drafts: drafts,
    syncEvery: const Duration(hours: 1),
  );

  ProjectDoc renamed(ProjectDoc d, String name) => d.copyWith(name: name);

  /// Another tab or device saves a change, moving the cloud revision on.
  Future<void> editElsewhere() async {
    final entry = (await repo.get(id))!;
    await repo.saveWorking(
      id,
      renamed(entry.doc, 'From elsewhere'),
      entry.doc.revision,
    );
  }

  setUp(() async {
    db = FakeFirebaseFirestore();
    repo = ProjectRepository(db, loadTemplates());
    drafts = MemoryDrafts();
    await UserRepository(db).ensure(uid: 'alice');
    id = await repo.create(
      uid: 'alice',
      name: 'Mine',
      profileType: ProfileType.DEVELOPER,
    );
  });

  test('edits waiting on this device survive a newer cloud copy', () async {
    final first = open();
    await first.load();
    first.update((d) => renamed(d, 'Edited here'));
    await pumpEventQueue();
    first.dispose(); // closed before the sync timer fired
    await editElsewhere();

    final second = open();
    await second.load();
    expect(second.syncState, SyncState.conflict);
    expect(second.doc!.name, 'Edited here');
    expect(drafts.saved, contains(id));

    // Edits made while in conflict stay on this device, not in the cloud.
    second.update((d) => renamed(d, 'Edited again'));
    await second.flush();
    expect(second.syncState, SyncState.conflict);
    expect((await repo.get(id))!.doc.name, 'From elsewhere');

    await second.keepMine();
    expect(second.syncState, SyncState.synced);
    expect((await repo.get(id))!.doc.name, 'Edited again');
    expect(drafts.saved, isEmpty);
    second.dispose();
  });

  test('loading the newer version discards the edits on this device', () async {
    final first = open();
    await first.load();
    first.update((d) => renamed(d, 'Edited here'));
    await pumpEventQueue();
    first.dispose();
    await editElsewhere();

    final second = open();
    await second.load();
    await second.reload();
    expect(second.syncState, SyncState.synced);
    expect(second.doc!.name, 'From elsewhere');
    expect(drafts.saved, isEmpty);
    second.dispose();
  });

  test('a refused save keeps the edits on this device', () async {
    final s = open(RefusingRepository(db, loadTemplates()));
    await s.load();
    s.update((d) => renamed(d, 'Edited here'));
    await s.flush();
    expect(s.syncState, SyncState.rejected);
    expect(drafts.saved[id]!.data['name'], 'Edited here');
    s.dispose();
  });
}
