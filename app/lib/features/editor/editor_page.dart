import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/js/pb_bridge.dart';
import '../../core/web/site_frame.dart';
import '../assistant/assistant_panel.dart';
import '../export/export_dialog.dart';
import '../project/drafts.dart';
import '../project/project_session.dart';
import '../score/score.dart';
import '../setup/setup_page.dart';
import '../setup/steps/content_step.dart';
import '../versions/versions_dialog.dart';
import 'catalog.dart';
import 'code_mode.dart';
import 'editor_controller.dart';
import 'sections_panel.dart';
import 'site_panel.dart';
import 'theme_panel.dart';

const _panels = ['sections', 'theme', 'content', 'site'];

/// The editor workspace: panels, live preview, code mode and the assistant.
class EditorPage extends ConsumerStatefulWidget {
  const EditorPage({super.key, required this.projectId});
  final String projectId;

  @override
  ConsumerState<EditorPage> createState() => _EditorPageState();
}

class _EditorPageState extends ConsumerState<EditorPage>
    with SingleTickerProviderStateMixin {
  late final PbBridge pb = ref.read(pbBridgeProvider);
  late final ProjectSession session = ProjectSession(
    projectId: widget.projectId,
    repo: ref.read(projectRepositoryProvider),
    drafts: BridgeDraftStore(pb),
  );
  late final EditorController editor = EditorController(
    session: session,
    pb: pb,
  );
  late final ScoreTracker score = ScoreTracker(editor);
  final _keys = FocusNode(debugLabel: 'editor shortcuts');
  late final Catalog catalog = Catalog.parse(pb.catalogJson());
  late final TabController tabs = TabController(
    length: _panels.length,
    vsync: this,
  );
  final _assistantKey = GlobalKey<AssistantPanelState>();
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  bool _assistantOpen = true;
  bool _assetsLoaded = false;
  late int _tourStep = pb.prefsGet('tour.editor') == 'done' ? -1 : 0;

  @override
  void initState() {
    super.initState();
    session.addListener(_changed);
    tabs.addListener(() => setState(() {}));
    session.load().then((_) async {
      await editor.refreshAssets();
      if (mounted) setState(() => _assetsLoaded = true);
    });
  }

  @override
  void dispose() {
    _keys.dispose();
    session.removeListener(_changed);
    score.dispose();
    editor.dispose();
    tabs.dispose();
    session.flush().whenComplete(session.dispose);
    super.dispose();
  }

  void _changed() {
    final doc = session.doc;
    if (doc != null && doc.spec == null && mounted) {
      // Not set up yet: finish the wizard first.
      context.go('/p/${widget.projectId}/setup?step=${SetupStep.import.name}');
    }
  }

  void openPanel(String name) {
    final i = _panels.indexOf(name);
    if (i >= 0) tabs.animateTo(i);
    if (editor.mode == EditorMode.code) editor.setMode(EditorMode.visual);
  }

  void _askAbout(String sectionId) {
    if (!_wide) {
      _scaffoldKey.currentState?.openEndDrawer();
    } else {
      setState(() => _assistantOpen = true);
    }
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => _assistantKey.currentState?.askAbout(sectionId),
    );
  }

  bool get _wide => MediaQuery.sizeOf(context).width >= 1280;

  void _endTour() {
    pb.prefsSet('tour.editor', 'done');
    setState(() => _tourStep = -1);
  }

  /// Images the content uses that aren't on this computer (e.g. another device).
  int _missingImages() {
    final d = session.doc;
    if (d == null || !_assetsLoaded) return 0;
    return EditorController.imageIds(d)
        .where((id) => !editor.assets.containsKey(id))
        .length;
  }

  Future<void> _restoreImagesFromBackup() async {
    final r = await pb.invoke('backup', 'pick');
    if (!r.ok || r.value == null) return;
    final v = jsonMap(r.value);
    await pb.invoke('backup', 'restoreFiles', [
      v['token'] as String,
      widget.projectId,
    ]);
    await editor.refreshAssets();
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyZ, control: true):
            editor.undo,
        const SingleActivator(LogicalKeyboardKey.keyZ, meta: true): editor.undo,
        const SingleActivator(
          LogicalKeyboardKey.keyZ,
          control: true,
          shift: true,
        ): editor.redo,
        const SingleActivator(LogicalKeyboardKey.keyZ, meta: true, shift: true):
            editor.redo,
        const SingleActivator(LogicalKeyboardKey.keyY, control: true):
            editor.redo,
      },
      child: Focus(
        focusNode: _keys,
        autofocus: true,
        // After a click in the preview the browser's focus stays there; a click
        // anywhere else in the editor brings the shortcuts back.
        child: Listener(
          onPointerDown: (_) {
            final typing = FocusManager.instance.primaryFocus?.context
                ?.findAncestorWidgetOfExactType<EditableText>();
            if (typing == null) _keys.requestFocus();
          },
          child: ListenableBuilder(
            listenable: Listenable.merge([session, editor]),
            builder: (context, _) => _scaffold(context),
          ),
        ),
      ),
    );
  }

  Widget _scaffold(BuildContext context) {
    final doc = session.doc;
    final theme = Theme.of(context);
    final wide = _wide;
    final ready = session.loaded && doc?.spec != null;
    return Scaffold(
      key: _scaffoldKey,
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Back to portfolios',
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
        ),
        titleSpacing: 0,
        title: Text(doc?.name ?? 'Portfolio', overflow: TextOverflow.ellipsis),
        actions: [
          if (ready) ...[
            SegmentedButton<EditorMode>(
              key: const Key('editor-mode'),
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(
                  value: EditorMode.visual,
                  label: Text('Visual'),
                  icon: Icon(Icons.web_outlined),
                ),
                ButtonSegment(
                  value: EditorMode.code,
                  label: Text('Code'),
                  icon: Icon(Icons.code),
                ),
              ],
              selected: {editor.mode},
              onSelectionChanged: (s) => editor.setMode(s.first),
            ),
            const SizedBox(width: 8),
            IconButton(
              key: const Key('undo'),
              tooltip: 'Undo (Ctrl+Z)',
              onPressed: editor.canUndo ? editor.undo : null,
              icon: const Icon(Icons.undo),
            ),
            IconButton(
              key: const Key('redo'),
              tooltip: 'Redo (Ctrl+Shift+Z)',
              onPressed: editor.canRedo ? editor.redo : null,
              icon: const Icon(Icons.redo),
            ),
            if (wide) SyncIndicator(session: session),
            ListenableBuilder(
              listenable: score,
              builder: (context, _) {
                final s = score.score;
                return TextButton.icon(
                  key: const Key('score-button'),
                  onPressed: () => showDialog<void>(
                    context: context,
                    builder: (_) => AlertDialog(
                      title: const Text('Portfolio score'),
                      content: SizedBox(
                        width: 560,
                        child: SingleChildScrollView(
                          child: ScorePanel(
                            tracker: score,
                            openPanel: openPanel,
                          ),
                        ),
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('Close'),
                        ),
                      ],
                    ),
                  ),
                  icon: Icon(
                    Icons.speed,
                    color: s == null ? null : scoreColor(context, s.total),
                  ),
                  label: Text(s == null ? 'Score' : 'Score ${s.total}'),
                );
              },
            ),
            IconButton(
              key: const Key('history'),
              tooltip: 'History',
              onPressed: () => showVersions(context, ref, editor),
              icon: const Icon(Icons.history),
            ),
            PopupMenuButton<String>(
              tooltip: 'More',
              onSelected: (v) => switch (v) {
                'save' => saveVersion(context, ref, editor),
                'designs' => context.go('/p/${widget.projectId}/designs'),
                'setup' => context.go(
                  '/p/${widget.projectId}/setup?step=${SetupStep.import.name}',
                ),
                'backup' => downloadBackup(context, editor),
                'tour' => setState(() => _tourStep = 0),
                _ => null,
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'save', child: Text('Save a version')),
                PopupMenuItem(
                  value: 'designs',
                  child: Text('New design (keeps your content)'),
                ),
                PopupMenuItem(
                  value: 'setup',
                  child: Text('Import more (resume, GitHub, blog)'),
                ),
                PopupMenuItem(
                  value: 'backup',
                  child: Text('Download project backup'),
                ),
                PopupMenuItem(value: 'tour', child: Text('Show the tour')),
              ],
            ),
            const SizedBox(width: 4),
            FilledButton.icon(
              key: const Key('export'),
              onPressed: () {
                session.flush();
                showExportDialog(context, editor, score, openPanel: openPanel);
              },
              icon: const Icon(Icons.download),
              label: const Text('Export'),
            ),
            const SizedBox(width: 8),
            IconButton(
              key: const Key('assistant-toggle'),
              tooltip: 'Assistant',
              isSelected: wide && _assistantOpen,
              onPressed: () => wide
                  ? setState(() => _assistantOpen = !_assistantOpen)
                  : _scaffoldKey.currentState?.openEndDrawer(),
              icon: const Icon(Icons.auto_awesome_outlined),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
      endDrawer: ready && !wide
          ? Drawer(
              width: 400,
              child: SafeArea(
                child: AssistantPanel(
                  key: _assistantKey,
                  editor: editor,
                  catalog: catalog,
                ),
              ),
            )
          : null,
      body: switch ((session.loaded, session.missing)) {
        (_, true) => const Center(
          child: Text('This portfolio doesn\'t exist.'),
        ),
        (false, _) => const Center(child: CircularProgressIndicator()),
        _ when doc?.spec == null => const Center(
          child: CircularProgressIndicator(),
        ),
        _ => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (session.syncState == SyncState.conflict)
              MaterialBanner(
                content: const Text(
                  'This portfolio was changed in another tab or device.',
                ),
                actions: [
                  TextButton(
                    onPressed: session.reload,
                    child: const Text('Load the newer version'),
                  ),
                ],
              ),
            if (session.syncState == SyncState.dailyLimit)
              MaterialBanner(
                content: const Text(
                  'Today\'s free cloud saving allowance is used up. Your edits are safe on '
                  'this computer and sync automatically tomorrow.',
                ),
                actions: [
                  TextButton(
                    onPressed: () => downloadBackup(context, editor),
                    child: const Text('Download a backup'),
                  ),
                ],
              ),
            if (_missingImages() > 0)
              MaterialBanner(
                key: const Key('missing-images'),
                content: Text(
                  '${_missingImages()} image${_missingImages() == 1 ? ' is' : 's are'} on another computer. '
                  'Images stay on the device they were added on.',
                ),
                actions: [
                  TextButton(
                    onPressed: _restoreImagesFromBackup,
                    child: const Text('Import from a backup'),
                  ),
                  TextButton(
                    onPressed: () => openPanel('content'),
                    child: const Text('Add them again'),
                  ),
                ],
              ),
            Expanded(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (editor.mode == EditorMode.visual) ...[
                    SizedBox(
                      width: tabs.index == 2 ? 460 : (wide ? 360 : 320),
                      child: _leftPanel(theme),
                    ),
                    const VerticalDivider(width: 1),
                    Expanded(child: _preview(theme)),
                  ] else ...[
                    Expanded(
                      flex: 3,
                      child: CodeMode(editor: editor, catalog: catalog),
                    ),
                    const VerticalDivider(width: 1),
                    Expanded(flex: 2, child: _preview(theme)),
                  ],
                  if (wide && _assistantOpen) ...[
                    const VerticalDivider(width: 1),
                    SizedBox(
                      width: 380,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
                            child: Text(
                              'Assistant',
                              style: theme.textTheme.titleSmall,
                            ),
                          ),
                          Expanded(
                            child: AssistantPanel(
                              key: _assistantKey,
                              editor: editor,
                              catalog: catalog,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      },
    );
  }

  Widget _leftPanel(ThemeData theme) => Material(
    color: theme.colorScheme.surfaceContainerLow,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TabBar(
          controller: tabs,
          isScrollable: false,
          labelPadding: EdgeInsets.zero,
          tabs: const [
            Tab(key: Key('tab-sections'), text: 'Sections'),
            Tab(key: Key('tab-theme'), text: 'Theme'),
            Tab(key: Key('tab-content'), text: 'Content'),
            Tab(key: Key('tab-site'), text: 'Site'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: tabs,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              SectionsPanel(
                editor: editor,
                catalog: catalog,
                onAskAssistant: _askAbout,
              ),
              ThemePanel(editor: editor, catalog: catalog),
              SingleChildScrollView(
                padding: const EdgeInsets.all(12),
                child: ContentStep(
                  session: session,
                  embedded: true,
                  onImageAdded: editor.refreshAssets,
                ),
              ),
              SitePanel(editor: editor),
            ],
          ),
        ),
      ],
    ),
  );

  Widget _preview(ThemeData theme) {
    final errors = editor.checks.where((c) => c.severity == 'error').length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Material(
          color: theme.colorScheme.surfaceContainerLow,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            child: Wrap(
              spacing: 8,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SegmentedButton<PreviewWidth>(
                  showSelectedIcon: false,
                  segments: [
                    for (final w in PreviewWidth.values)
                      ButtonSegment(
                        value: w,
                        tooltip: w.label,
                        icon: Icon(switch (w) {
                          PreviewWidth.desktop =>
                            Icons.desktop_windows_outlined,
                          PreviewWidth.tablet => Icons.tablet_outlined,
                          PreviewWidth.phone => Icons.phone_iphone,
                        }),
                      ),
                  ],
                  selected: {editor.width},
                  onSelectionChanged: (s) => editor.setWidth(s.first),
                ),
                if (editor.mode == EditorMode.visual)
                  SegmentedButton<PreviewTool>(
                    key: const Key('preview-tool'),
                    showSelectedIcon: false,
                    segments: const [
                      ButtonSegment(
                        value: PreviewTool.edit,
                        tooltip: 'Click text to edit it',
                        icon: Icon(Icons.edit_outlined),
                      ),
                      ButtonSegment(
                        value: PreviewTool.select,
                        tooltip: 'Click a section to select it',
                        icon: Icon(Icons.ads_click),
                      ),
                      ButtonSegment(
                        value: PreviewTool.view,
                        tooltip: 'Use the site like a visitor',
                        icon: Icon(Icons.mouse_outlined),
                      ),
                    ],
                    selected: {editor.tool},
                    onSelectionChanged: (s) => editor.setTool(s.first),
                  ),
                if (editor.page != 'index.html')
                  InputChip(
                    avatar: const Icon(Icons.description_outlined, size: 18),
                    label: Text(editor.page),
                    deleteIcon: const Icon(Icons.home_outlined, size: 18),
                    deleteButtonTooltipMessage: 'Back to the home page',
                    onDeleted: () => editor.showPage('index.html'),
                  ),
                if (errors > 0)
                  ActionChip(
                    avatar: Icon(
                      Icons.error_outline,
                      color: theme.colorScheme.error,
                      size: 18,
                    ),
                    label: Text('$errors to fix'),
                    onPressed: () => showExportDialog(
                      context,
                      editor,
                      score,
                      openPanel: openPanel,
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (editor.proposal != null)
          MaterialBanner(
            key: const Key('proposal-banner'),
            backgroundColor: theme.colorScheme.tertiaryContainer,
            content: const Text(
              'Previewing the assistant\'s changes. Accept or reject them in the assistant.',
            ),
            actions: [
              TextButton(
                onPressed: editor.discardProposal,
                child: const Text('Reject'),
              ),
            ],
          ),
        if (_tourStep >= 0)
          _Tour(
            step: _tourStep,
            onNext: () => setState(() => _tourStep++),
            onDone: _endTour,
          ),
        Expanded(
          child: ColoredBox(
            color: theme.colorScheme.surfaceContainerHighest,
            child: editor.error != null
                ? Center(
                    child: Text(
                      'The preview couldn\'t be built: ${editor.error}',
                    ),
                  )
                : editor.html == null
                ? const Center(child: CircularProgressIndicator())
                : Center(
                    child: SizedBox(
                      width: editor.width.width ?? double.infinity,
                      child: SiteFrame(
                        html: editor.html!,
                        controller: editor.frame,
                        onMessage: editor.onPreviewMessage,
                        scrollKey: editor.page,
                      ),
                    ),
                  ),
          ),
        ),
      ],
    );
  }
}

const _tourSteps = [
  (
    Icons.edit_outlined,
    'Click any text in the preview to change it. Press Enter or click away to save.',
  ),
  (
    Icons.view_agenda_outlined,
    'Sections: drag to reorder, hide, or try other layouts. Theme: colours, fonts and spacing.',
  ),
  (
    Icons.auto_awesome_outlined,
    'Ask the assistant for bigger changes ("make it warmer"). You preview everything before it\'s saved.',
  ),
  (
    Icons.download,
    'Export downloads your site as plain files you can put on any free host.',
  ),
];

class _Tour extends StatelessWidget {
  const _Tour({required this.step, required this.onNext, required this.onDone});
  final int step;
  final VoidCallback onNext;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final (icon, text) = _tourSteps[step.clamp(0, _tourSteps.length - 1)];
    final last = step >= _tourSteps.length - 1;
    return MaterialBanner(
      key: const Key('tour'),
      leading: Icon(icon),
      content: Text('${step + 1}/${_tourSteps.length} · $text'),
      actions: [
        TextButton(onPressed: onDone, child: const Text('Skip')),
        FilledButton(
          key: const Key('tour-next'),
          onPressed: last ? onDone : onNext,
          child: Text(last ? 'Got it' : 'Next'),
        ),
      ],
    );
  }
}
