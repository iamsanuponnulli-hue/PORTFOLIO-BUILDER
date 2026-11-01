import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/generated/models.dart';

class VersionEntry {
  const VersionEntry(this.id, this.doc);
  final String id;
  final VersionDoc doc;
}

/// What a version holds: everything that defines the site.
Map<String, dynamic> siteSnapshot(ProjectDoc d) => {
  'content': d.content.toJson(),
  'spec': d.spec?.toJson(),
  'custom': d.custom.toJson(),
  'contactForm': d.contactForm.toJson(),
};

/// The project with a version's site restored (name, goals and status are kept).
ProjectDoc restoreSnapshot(ProjectDoc current, VersionDoc v) {
  final s = jsonDecode(v.snapshot) as Map<String, dynamic>;
  return current.copyWith(
    content: PortfolioContent.fromJson(s['content'] as Map<String, dynamic>),
    spec: s['spec'] == null
        ? current.spec
        : SiteSpec.fromJson(s['spec'] as Map<String, dynamic>),
    custom: CustomCode.fromJson(s['custom'] as Map<String, dynamic>),
    contactForm: ContactForm.fromJson(s['contactForm'] as Map<String, dynamic>),
  );
}

/// projects/{pid}/versions: immutable snapshots; the newest [keep] are kept, in
/// slots v0…v{keep-1} (the security rules allow no other ids).
class VersionRepository {
  VersionRepository(this._db, {DateTime Function()? clock, this.keep = 30})
    : _clock = clock ?? DateTime.now;

  final FirebaseFirestore _db;
  final DateTime Function() _clock;
  final int keep;

  CollectionReference<Map<String, dynamic>> _versions(String projectId) =>
      _db.collection('projects/$projectId/versions');

  /// Saves a snapshot in a free slot, first removing the oldest ones so at most
  /// [keep] remain. Returns its id.
  Future<String> save(
    String projectId,
    ProjectDoc doc, {
    required VersionSource source,
    String summary = '',
    String prompt = '',
  }) async {
    final snapshot = jsonEncode(siteSnapshot(doc));
    if (snapshot.length > 900000) {
      throw StateError('This version is too large to save in history.');
    }
    final all = await _versions(projectId)
        .orderBy('createdAt', descending: true)
        .get();
    for (final d in all.docs.skip(keep - 1)) {
      await d.reference.delete();
    }
    final taken = {for (final d in all.docs.take(keep - 1)) d.id};
    final slot = [for (var i = 0; i < keep; i++) 'v$i']
        .firstWhere((id) => !taken.contains(id));
    await _versions(projectId)
        .doc(slot)
        .set(
          VersionDoc(
            createdAt: _clock().millisecondsSinceEpoch,
            source: source,
            summary: summary.length > 500 ? summary.substring(0, 500) : summary,
            prompt: prompt.length > 2000 ? prompt.substring(0, 2000) : prompt,
            snapshot: snapshot,
          ).toJson(),
        );
    return slot;
  }

  /// Newest first.
  Future<List<VersionEntry>> list(String projectId) async {
    final q = await _versions(projectId)
        .orderBy('createdAt', descending: true)
        .limit(keep)
        .get();
    return [
      for (final d in q.docs) VersionEntry(d.id, VersionDoc.fromJson(d.data())),
    ];
  }
}
