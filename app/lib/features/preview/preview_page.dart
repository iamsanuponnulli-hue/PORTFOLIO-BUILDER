import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/js/pb_bridge.dart';
import '../../core/ui/feedback.dart';
import '../../core/web/site_frame.dart';
import '../../models/generated/models.dart';
import '../project/drafts.dart';
import '../project/project_session.dart';
import '../setup/setup_page.dart';

/// Built-in designs (renderer preset ids) offered in the preview.
const presets = [
  ('calm', 'Calm'),
  ('bold', 'Bold'),
  ('editorial', 'Editorial'),
  ('technical', 'Technical'),
  ('warm', 'Warm'),
  ('mono', 'Mono'),
];

enum PreviewWidth {
  desktop('Desktop', Icons.desktop_windows_outlined, null),
  tablet('Tablet', Icons.tablet_outlined, 820),
  phone('Phone', Icons.phone_iphone, 390);

  const PreviewWidth(this.label, this.icon, this.width);
  final String label;
  final IconData icon;
  final double? width;
}

/// Shows the generated site. Rendering happens in the browser's worker; the
/// page runs in a sandboxed iframe.
class PreviewPage extends ConsumerStatefulWidget {
  const PreviewPage({super.key, required this.projectId});
  final String projectId;

  @override
  ConsumerState<PreviewPage> createState() => _PreviewPageState();
}

class _PreviewPageState extends ConsumerState<PreviewPage> {
  late final ProjectSession session = ProjectSession(
    projectId: widget.projectId,
    repo: ref.read(projectRepositoryProvider),
    drafts: BridgeDraftStore(ref.read(pbBridgeProvider)),
  );

  String? _html;
  String? _error;
  List<Map<String, dynamic>> _checks = const [];
  var _width = PreviewWidth.desktop;
  ProjectDoc? _rendered;
  bool _rendering = false;

  @override
  void initState() {
    super.initState();
    session.addListener(_changed);
    session.load();
  }

  @override
  void dispose() {
    session.removeListener(_changed);
    session.flush().whenComplete(session.dispose);
    super.dispose();
  }

  void _changed() {
    final doc = session.doc;
    if (doc == null) return;
    if (doc.spec == null) {
      // Not set up yet: finish the wizard first.
      context.go('/p/${widget.projectId}/setup?step=${SetupStep.import.name}');
      return;
    }
    if (!identical(doc, _rendered)) _render(doc);
  }

  Future<void> _render(ProjectDoc doc) async {
    if (_rendering) {
      return; // the latest doc is picked up when this one finishes
    }
    _rendering = true;
    _rendered = doc;
    try {
      final pb = ref.read(pbBridgeProvider);
      final assets = await pb.invoke('files', 'previewAssets', [
        widget.projectId,
      ]);
      final state = {
        'content': doc.content.toJson(),
        'spec': doc.spec!.toJson(),
        'custom': doc.custom.toJson(),
        'contactForm': doc.contactForm.toJson(),
      };
      final options = {
        'mode': 'preview',
        'fontSource': 'google',
        'assets': assets.get<Object?>() ?? const {},
      };
      final out = jsonDecode(
        await pb.render(jsonEncode(state), jsonEncode(options)),
      ) as Map<String, dynamic>;
      final html = pb.previewDocument(jsonEncode(out['files']));
      if (!mounted) return;
      setState(() {
        _html = html;
        _error = null;
        _checks = (out['checks'] as List).cast<Map<String, dynamic>>();
      });
    } catch (e) {
      if (mounted) setState(() => _error = e is PbException ? e.message : '$e');
    } finally {
      _rendering = false;
      final latest = session.doc;
      if (mounted && latest != null && !identical(latest, _rendered)) {
        _render(latest);
      }
    }
  }

  Future<void> _usePreset(String id) async {
    final doc = session.doc!;
    try {
      final spec = SiteSpec.fromJson(
        jsonDecode(
          await ref
              .read(pbBridgeProvider)
              .defaultSpec(profileTypeValues.reverse[doc.profileType]!, id),
        ) as Map<String, dynamic>,
      );
      session.update(
        (d) => d.copyWith(
          spec: d.spec!.copyWith(
            theme: spec.theme.copyWith(colorMode: d.spec!.theme.colorMode),
          ),
        ),
      );
    } catch (e) {
      if (mounted) showMessage(context, 'Couldn\'t switch design: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final doc = session.doc;
        final theme = Theme.of(context);
        final errors = _checks.where((c) => c['severity'] == 'error').length;
        final warnings = _checks
            .where((c) => c['severity'] == 'warning')
            .length;
        return Scaffold(
          appBar: AppBar(
            leading: IconButton(
              tooltip: 'Back to portfolios',
              icon: const Icon(Icons.arrow_back),
              onPressed: () => context.go('/'),
            ),
            title: Text(doc?.name ?? 'Portfolio'),
            actions: [
              if (doc != null) ...[
                SegmentedButton<PreviewWidth>(
                  showSelectedIcon: false,
                  segments: [
                    for (final w in PreviewWidth.values)
                      ButtonSegment(
                        value: w,
                        icon: Icon(w.icon),
                        tooltip: w.label,
                      ),
                  ],
                  selected: {_width},
                  onSelectionChanged: (s) => setState(() => _width = s.first),
                ),
                const SizedBox(width: 12),
                TextButton.icon(
                  key: const Key('edit-content'),
                  onPressed: () {
                    session.flush();
                    context.go(
                      '/p/${widget.projectId}/setup?step=${SetupStep.content.name}',
                    );
                  },
                  icon: const Icon(Icons.edit_note),
                  label: const Text('Edit content'),
                ),
                const SizedBox(width: 8),
                SyncIndicator(session: session),
                const SizedBox(width: 16),
              ],
            ],
          ),
          body: switch ((session.loaded, session.missing)) {
            (_, true) => const Center(
              child: Text('This portfolio doesn\'t exist.'),
            ),
            (false, _) => const Center(child: CircularProgressIndicator()),
            _ => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Material(
                  color: theme.colorScheme.surfaceContainerLow,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text('Design', style: theme.textTheme.labelLarge),
                        for (final (id, label) in presets)
                          ActionChip(
                            key: Key('preset-$id'),
                            label: Text(label),
                            onPressed: () => _usePreset(id),
                          ),
                        const SizedBox(width: 12),
                        if (_checks.isNotEmpty)
                          Tooltip(
                            message: _checks
                                .map((c) => '• ${c['message']}')
                                .join('\n'),
                            child: Chip(
                              key: const Key('checks'),
                              avatar: Icon(
                                errors > 0
                                    ? Icons.error_outline
                                    : Icons.info_outline,
                                size: 18,
                                color: errors > 0
                                    ? theme.colorScheme.error
                                    : null,
                              ),
                              label: Text(
                                [
                                      if (errors > 0) '$errors to fix',
                                      if (warnings > 0) '$warnings suggestions',
                                    ]
                                    .join(' · ')
                                    .ifEmpty('${_checks.length} notes'),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
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
                Expanded(
                  child: ColoredBox(
                    color: theme.colorScheme.surfaceContainerHighest,
                    child: _error != null
                        ? Center(
                            child: Text(
                              'The preview couldn\'t be built: $_error',
                            ),
                          )
                        : _html == null
                        ? const Center(child: CircularProgressIndicator())
                        : Center(
                            child: SizedBox(
                              width: _width.width ?? double.infinity,
                              child: SiteFrame(html: _html!),
                            ),
                          ),
                  ),
                ),
              ],
            ),
          },
        );
      },
    );
  }
}

extension on String {
  String ifEmpty(String other) => isEmpty ? other : this;
}
