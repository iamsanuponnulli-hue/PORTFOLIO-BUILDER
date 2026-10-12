import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/templates.dart';
import '../../models/generated/models.dart';

/// A project document with its Firestore id.
class ProjectEntry {
  const ProjectEntry(this.id, this.doc);
  final String id;
  final ProjectDoc doc;
}

/// The cloud copy changed since this device loaded it (e.g. edited in another tab).
class StaleWrite implements Exception {
  const StaleWrite();
}

class ProjectLimitReached implements Exception {
  const ProjectLimitReached(this.limit);
  final int limit;
  @override
  String toString() =>
      'You can have up to $limit portfolios. Delete one to create another.';
}

/// Projects and the per-user counter that enforces the project limit.
/// Every write goes through a transaction so the counter and projects stay in step
/// (security rules reject any create/delete that doesn't move the counter by one).
class ProjectRepository {
  ProjectRepository(
    this._db,
    this._templates, {
    DateTime Function()? clock,
    this.maxProjects = 5,
  }) : _clock = clock ?? DateTime.now;

  final FirebaseFirestore _db;
  final Templates _templates;
  final DateTime Function() _clock;
  final int maxProjects;

  CollectionReference<Map<String, dynamic>> get _projects =>
      _db.collection('projects');
  DocumentReference<Map<String, dynamic>> _user(String uid) =>
      _db.doc('users/$uid');
  int get _now => _clock().millisecondsSinceEpoch;

  Stream<List<ProjectEntry>> watchAll(String uid) => _projects
      .where('ownerId', isEqualTo: uid)
      .orderBy('updatedAt', descending: true)
      .snapshots()
      .map(
        (q) => [
          for (final d in q.docs)
            ProjectEntry(d.id, ProjectDoc.fromJson(d.data())),
        ],
      );

  Stream<ProjectEntry?> watch(String id) => _projects
      .doc(id)
      .snapshots()
      .map(
        (s) => s.exists && s.data() != null
            ? ProjectEntry(s.id, ProjectDoc.fromJson(s.data()!))
            : null,
      );

  Future<ProjectEntry?> get(String id) async {
    final s = await _projects.doc(id).get();
    return s.exists && s.data() != null
        ? ProjectEntry(s.id, ProjectDoc.fromJson(s.data()!))
        : null;
  }

  Future<String> create({
    required String uid,
    required String name,
    required ProfileType profileType,
  }) {
    final now = _now;
    return _insert(uid, {
      'ownerId': uid,
      'name': name.trim(),
      'profileType': profileTypeValues.reverse[profileType],
      'status': 'draft',
      'goals': _templates.goals,
      'content': _templates.content,
      'custom': _templates.custom,
      'contactForm': _templates.contactForm,
      'revision': 0,
      'createdAt': now,
      'updatedAt': now,
    });
  }

  Future<String> duplicate({
    required String uid,
    required ProjectEntry source,
  }) {
    final now = _now;
    final json = source.doc.toJson()
      ..remove('currentVersionId')
      ..addAll({
        'name': _copyName(source.doc.name),
        'revision': 0,
        'createdAt': now,
        'updatedAt': now,
      });
    if (json['spec'] == null) json.remove('spec');
    return _insert(uid, json);
  }

  Future<void> rename(ProjectEntry entry, String name) =>
      _projects.doc(entry.id).update({
        'name': name.trim(),
        'revision': entry.doc.revision + 1,
        'updatedAt': _now,
      });

  /// Writes a locally edited project. Security rules require the revision to move
  /// on by exactly one, so a stale copy can never overwrite newer changes.
  Future<int> saveWorking(String id, ProjectDoc doc, int baseRevision) async {
    final revision = baseRevision + 1;
    final j = doc.toJson();
    try {
      await _projects.doc(id).update({
        for (final k in [
          'name',
          'status',
          'goals',
          'content',
          'spec',
          'custom',
          'contactForm',
        ])
          k: j[k],
        'revision': revision,
        'updatedAt': _now,
      });
    } on FirebaseException catch (e) {
      if (e.code == 'permission-denied') throw const StaleWrite();
      rethrow;
    }
    return revision;
  }

  /// Deletes the project, its version history and decrements the counter.
  Future<void> delete({
    required String uid,
    required ProjectEntry entry,
  }) async {
    final ref = _projects.doc(entry.id);
    final versions = await ref.collection('versions').get();
    for (final v in versions.docs) {
      await v.reference.delete();
    }
    await _db.runTransaction((tx) async {
      final user = await tx.get(_user(uid));
      final count = (user.data()?['projectCount'] as num?)?.toInt() ?? 0;
      tx.delete(ref);
      tx.update(_user(uid), {'projectCount': count > 0 ? count - 1 : 0});
    });
  }

  Future<String> _insert(String uid, Map<String, dynamic> data) async {
    final ref = _projects.doc();
    await _db.runTransaction((tx) async {
      final user = await tx.get(_user(uid));
      final count = (user.data()?['projectCount'] as num?)?.toInt() ?? 0;
      if (count >= maxProjects) throw ProjectLimitReached(maxProjects);
      tx.set(ref, data);
      tx.update(_user(uid), {'projectCount': count + 1});
    });
    return ref.id;
  }

  static String _copyName(String name) {
    final copy = 'Copy of $name';
    return copy.length <= 80 ? copy : copy.substring(0, 80);
  }
}
