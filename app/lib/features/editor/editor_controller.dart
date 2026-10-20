import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../../core/js/pb_bridge.dart';
import '../../core/web/site_frame_controller.dart';
import '../../models/generated/models.dart';
import '../project/project_session.dart';

enum PreviewWidth {
  desktop('Desktop', null),
  tablet('Tablet', 820),
  phone('Phone', 390);

  const PreviewWidth(this.label, this.width);
  final String label;
  final double? width;
}

enum EditorMode { visual, code }

/// What a click in the preview does.
enum PreviewTool { edit, select, view }

/// One instant check from the renderer (see packages/renderer/src/checks.ts).
class Check {
  const Check(this.id, this.severity, this.message, {this.sectionId});
  final String id;
  final String severity;
  final String message;
  final String? sectionId;

  factory Check.fromJson(Map<String, dynamic> j) => Check(
    j['id'] as String,
    j['severity'] as String,
    j['message'] as String,
    sectionId: j['sectionId'] as String?,
  );
}

/// A change the assistant proposed, shown in the preview until accepted.
class Proposal {
  const Proposal({
    required this.prompt,
    required this.summary,
    required this.operations,
    required this.changes,
    required this.skipped,
    required this.contentChanges,
    required this.state,
    this.source = VersionSource.ASSISTANT,
  });
  final String prompt;
  final String summary;
  final List<Map<String, dynamic>> operations;
  final List<String> changes;
  final List<String> skipped;

  /// Indexes into [operations] that change content (the person confirms these).
  final List<int> contentChanges;

  /// The site with the proposal applied (previewed, not saved).
  final Map<String, dynamic> state;
  final VersionSource source;
}

/// The site-defining parts of a project, compared and restored by undo/redo.
class SiteSnapshot {
  SiteSnapshot(this.content, this.spec, this.custom, this.contactForm)
    : key = jsonEncode([
        content.toJson(),
        spec?.toJson(),
        custom.toJson(),
        contactForm.toJson(),
      ]);

  factory SiteSnapshot.of(ProjectDoc d) =>
      SiteSnapshot(d.content, d.spec, d.custom, d.contactForm);

  final PortfolioContent content;
  final SiteSpec? spec;
  final CustomCode custom;
  final ContactForm contactForm;
  final String key;

  ProjectDoc applyTo(ProjectDoc d) => d.copyWith(
    content: content,
    spec: spec,
    custom: custom,
    contactForm: contactForm,
  );
}

/// The editor's state: rendering, undo/redo, selection and AI proposals.
/// Every change goes through the project session (saved on this device at once).
class EditorController extends ChangeNotifier {
  EditorController({
    required this.session,
    required this.pb,
    this.historyLimit = 100,
    this.coalesce = const Duration(milliseconds: 1200),
    this.renderDelay = const Duration(milliseconds: 120),
  }) {
    session.addListener(_onSession);
    _onSession();
  }

  final ProjectSession session;
  final PbBridge pb;
  final int historyLimit;

  /// Changes closer together than this are one undo step (e.g. typing).
  final Duration coalesce;
  final Duration renderDelay;

  final frame = SiteFrameController();

  var mode = EditorMode.visual;
  var width = PreviewWidth.desktop;
  var tool = PreviewTool.edit;
  var page = 'index.html';
  String? selected;
  Proposal? proposal;

  String? html;
  String? error;
  List<Check> checks = const [];
  Map<String, dynamic> files = const {};
  Map<String, Object?> assets = const {};

  final _past = <SiteSnapshot>[];
  final _future = <SiteSnapshot>[];
  SiteSnapshot? _last;
  DateTime _lastChange = DateTime.fromMillisecondsSinceEpoch(0);
  bool _restoring = false;
  bool _disposed = false;
  Timer? _renderTimer;
  bool _rendering = false;
  bool _renderAgain = false;

  bool get canUndo => _past.isNotEmpty;
  bool get canRedo => _future.isNotEmpty;
  ProjectDoc? get doc => session.doc;

  /// The renderer's site state for the current project.
  Map<String, dynamic> get state => stateOf(doc!);

  static Map<String, dynamic> stateOf(ProjectDoc d) => {
    'content': d.content.toJson(),
    'spec': d.spec!.toJson(),
    'custom': d.custom.toJson(),
    'contactForm': d.contactForm.toJson(),
  };

  void _onSession() {
    final d = session.doc;
    if (d == null || d.spec == null) return;
    final now = SiteSnapshot.of(d);
    final last = _last;
    if (last == null) {
      _last = now;
      scheduleRender(immediate: true);
      return;
    }
    if (now.key == last.key) return;
    if (!_restoring) {
      final at = DateTime.now();
      // A burst of edits (typing, dragging a slider) is one undo step.
      if (_past.isEmpty || at.difference(_lastChange) > coalesce) {
        _past.add(last);
        if (_past.length > historyLimit) _past.removeAt(0);
      }
      _lastChange = at;
      _future.clear();
    }
    _last = now;
    scheduleRender();
  }

  /// Applies operations (validated in the worker). One undo step.
  Future<void> apply(List<Map<String, dynamic>> ops) async {
    final d = doc;
    if (d == null || ops.isEmpty) return;
    final next = jsonDecode(
      await pb.applyOperations(jsonEncode(stateOf(d)), jsonEncode(ops)),
    ) as Map<String, dynamic>;
    _lastChange = DateTime.fromMillisecondsSinceEpoch(0); // never merge
    session.update((p) => withState(p, next));
  }

  /// The project with a renderer state's fields.
  static ProjectDoc withState(ProjectDoc p, Map<String, dynamic> s) =>
      p.copyWith(
        content: PortfolioContent.fromJson(jsonMap(s['content'])),
        spec: SiteSpec.fromJson(jsonMap(s['spec'])),
        custom: CustomCode.fromJson(jsonMap(s['custom'])),
        contactForm: ContactForm.fromJson(jsonMap(s['contactForm'])),
      );

  void undo() => _travel(_past, _future);
  void redo() => _travel(_future, _past);

  void _travel(List<SiteSnapshot> from, List<SiteSnapshot> to) {
    final d = doc;
    if (from.isEmpty || d == null) return;
    final target = from.removeLast();
    to.add(SiteSnapshot.of(d));
    _restoring = true;
    try {
      session.update(target.applyTo);
    } finally {
      _restoring = false;
    }
    _lastChange = DateTime.fromMillisecondsSinceEpoch(0);
    notifyListeners();
  }

  void setMode(EditorMode m) {
    mode = m;
    notifyListeners();
  }

  void setWidth(PreviewWidth w) {
    width = w;
    notifyListeners();
  }

  void setTool(PreviewTool t) {
    tool = t;
    frame.post({
      'pb': 'mode',
      'mode': switch (t) {
        PreviewTool.edit => 'edit',
        PreviewTool.select => 'select',
        PreviewTool.view => 'view',
      },
    });
    notifyListeners();
  }

  void select(String? sectionId, {bool scroll = true}) {
    selected = sectionId;
    if (scroll) frame.post({'pb': 'highlight', 'id': sectionId});
    notifyListeners();
  }

  void showPage(String p) {
    page = p;
    _showFiles();
    notifyListeners();
  }

  /// Messages from the preview page (inline edits, selection, page links).
  Future<void> onPreviewMessage(Map<String, Object?> m) async {
    switch (m['pb']) {
      case 'edit':
        final target = m['target'] as String? ?? '';
        final value = m['value'] as String? ?? '';
        if (target.startsWith('content:')) {
          await apply([
            {
              'op': 'updateContent',
              'path': target.substring(8),
              'value': value,
            },
          ]);
        } else if (target.startsWith('option:')) {
          final parts = target.split(':');
          if (parts.length == 3) {
            await apply([
              {
                'op': 'setSectionOptions',
                'id': parts[1],
                'options': {parts[2]: value},
              },
            ]);
          }
        }
      case 'select':
        select(m['id'] as String?, scroll: false);
      case 'navigate':
        final p = m['page'] as String? ?? 'index.html';
        if (files.containsKey(p)) showPage(p);
      case 'ready':
        // Keep the page's tool in step after every re-render.
        if (tool != PreviewTool.edit) setTool(tool);
        if (selected != null) {
          frame.post({'pb': 'highlight', 'id': selected});
        }
    }
  }

  // ---- Assistant proposals: previewed in memory, saved only when accepted ----

  void propose(Proposal p) {
    proposal = p;
    scheduleRender(immediate: true);
    notifyListeners();
  }

  void discardProposal() {
    proposal = null;
    scheduleRender(immediate: true);
    notifyListeners();
  }

  /// Applies the proposal to the current site, leaving out content changes the
  /// person unticked. Returns the operations applied.
  Future<List<Map<String, dynamic>>> acceptProposal({
    Set<int> skipContent = const {},
  }) async {
    final p = proposal;
    if (p == null) return const [];
    final ops = [
      for (final (i, op) in p.operations.indexed)
        if (!skipContent.contains(i)) op,
    ];
    proposal = null;
    await apply(ops);
    notifyListeners();
    return ops;
  }

  // ---- Rendering ----

  Future<void> refreshAssets() async {
    final r = await pb.invoke('files', 'previewAssets', [session.projectId]);
    if (r.ok) assets = jsonMap(r.value);
    scheduleRender(immediate: true);
  }

  void scheduleRender({bool immediate = false}) {
    _renderTimer?.cancel();
    _renderTimer = Timer(immediate ? Duration.zero : renderDelay, _render);
  }

  Future<void> _render() async {
    if (_disposed || doc?.spec == null) return;
    if (_rendering) {
      _renderAgain = true;
      return;
    }
    _rendering = true;
    try {
      final s = proposal?.state ?? state;
      final out = jsonDecode(
        await pb.render(
          jsonEncode(s),
          jsonEncode({
            'mode': 'preview',
            'editable': proposal == null,
            'fontSource': 'google',
            'assets': assets,
          }),
        ),
      ) as Map<String, dynamic>;
      files = jsonMap(out['files']);
      if (proposal == null) {
        checks = jsonList(out['checks']).map(Check.fromJson).toList();
      }
      if (!files.containsKey(page)) page = 'index.html';
      _showFiles();
      error = null;
    } catch (e) {
      error = e is PbException ? e.message : '$e';
    } finally {
      _rendering = false;
      if (!_disposed) {
        notifyListeners();
        if (_renderAgain) {
          _renderAgain = false;
          scheduleRender(immediate: true);
        }
      }
    }
  }

  void _showFiles() {
    try {
      html = pb.previewDocument(jsonEncode(files), page, proposal == null);
    } catch (e) {
      error = '$e';
    }
  }

  /// The downloadable files (export mode), e.g. for code mode.
  Future<Map<String, dynamic>> exportFiles() async {
    final out = jsonDecode(
      await pb.render(
        jsonEncode(state),
        jsonEncode({'mode': 'export', 'fontSource': 'system'}),
      ),
    ) as Map<String, dynamic>;
    return jsonMap(out['files']);
  }

  @override
  void dispose() {
    _disposed = true;
    _renderTimer?.cancel();
    session.removeListener(_onSession);
    super.dispose();
  }
}
