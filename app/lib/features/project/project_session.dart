import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../models/generated/models.dart';
import '../dashboard/project_repository.dart';
import 'drafts.dart';

enum SyncState { synced, savedOnDevice, syncing, conflict, offline, dailyLimit }

/// One open project, saved local-first: every edit is kept on this device at once,
/// and synced to Firestore at most every [syncEvery] (and on [flush]) to stay
/// within the free plan's daily write allowance.
class ProjectSession extends ChangeNotifier {
  ProjectSession({
    required this.projectId,
    required this.repo,
    required this.drafts,
    this.syncEvery = const Duration(seconds: 30),
  });

  final String projectId;
  final ProjectRepository repo;
  final DraftStore drafts;
  final Duration syncEvery;

  ProjectDoc? _doc;
  int _baseRevision = 0;
  var _sync = SyncState.synced;
  Timer? _timer;
  Future<void>? _flushing;
  bool _disposed = false;
  bool restoredDraft = false;

  ProjectDoc? get doc => _doc;
  SyncState get syncState => _sync;
  bool get loaded => _doc != null;
  bool get missing => _loadedOnce && _doc == null;
  bool _loadedOnce = false;

  /// Loads the cloud copy, then any newer unsynced edits from this device.
  Future<void> load() async {
    final entry = await repo.get(projectId);
    _loadedOnce = true;
    if (entry == null) {
      _notify();
      return;
    }
    _doc = entry.doc;
    _baseRevision = entry.doc.revision;
    final draft = await drafts.get(projectId);
    if (draft != null) {
      if (draft.baseRevision == _baseRevision) {
        _doc = parseProject({...entry.doc.toJson(), ...draft.data});
        restoredDraft = true;
        _sync = SyncState.savedOnDevice;
        _schedule();
      } else {
        // The cloud copy moved on (edited elsewhere): it wins.
        await drafts.remove(projectId);
      }
    }
    _notify();
  }

  /// Applies an edit. Saved on this device immediately, synced later.
  void update(ProjectDoc Function(ProjectDoc doc) change) {
    final current = _doc;
    if (current == null) return;
    _doc = change(current);
    _sync = SyncState.savedOnDevice;
    _notify();
    unawaited(drafts.save(projectId, _baseRevision, _editable(_doc!)));
    _schedule();
  }

  /// Syncs now (call before leaving a screen).
  Future<void> flush() =>
      _flushing ??= _doFlush().whenComplete(() => _flushing = null);

  Future<void> _doFlush() async {
    _timer?.cancel();
    final doc = _doc;
    final nothingToDo =
        _sync == SyncState.synced || _sync == SyncState.conflict;
    if (doc == null || nothingToDo) return;
    _sync = SyncState.syncing;
    _notify();
    try {
      final revision = await repo.saveWorking(projectId, doc, _baseRevision);
      _baseRevision = revision;
      if (identical(_doc, doc)) {
        _doc = doc.copyWith(revision: revision);
        _sync = SyncState.synced;
        await drafts.remove(projectId);
      } else {
        // Edited while syncing: keep the newer edits and sync them next.
        _doc = _doc!.copyWith(revision: revision);
        _sync = SyncState.savedOnDevice;
        await drafts.save(projectId, _baseRevision, _editable(_doc!));
        _schedule();
      }
    } on StaleWrite {
      _sync = SyncState.conflict;
    } on DailyLimitReached {
      // Firestore's free daily writes are used up: keep everything on this
      // device and try again in an hour (the allowance resets daily).
      _sync = SyncState.dailyLimit;
      _timer?.cancel();
      _timer = Timer(const Duration(hours: 1), () => unawaited(flush()));
    } catch (_) {
      _sync = SyncState.offline;
      _schedule();
    }
    _notify();
  }

  /// Discards local edits and reloads the cloud copy (after a conflict).
  Future<void> reload() async {
    await drafts.remove(projectId);
    _sync = SyncState.synced;
    restoredDraft = false;
    await load();
  }

  void _schedule() {
    _timer?.cancel();
    _timer = Timer(syncEvery, () => unawaited(flush()));
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  static Map<String, dynamic> _editable(ProjectDoc d) {
    final j = d.toJson();
    return {for (final k in editableFields) k: j[k]};
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    super.dispose();
  }
}
