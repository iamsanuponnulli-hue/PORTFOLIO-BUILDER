import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/js/pb_bridge.dart';
import '../../core/web/site_frame.dart';
import '../../models/generated/models.dart';
import '../ai/ai_access.dart';
import '../ai/ai_providers.dart';
import '../ai/ai_repository.dart';
import '../project/drafts.dart';
import '../project/project_session.dart';
import '../setup/setup_page.dart';

/// One design offered for the person's content.
class Direction {
  const Direction(this.id, this.name, this.description, this.spec);
  final String id;
  final String name;
  final String description;
  final SiteSpec spec;

  factory Direction.fromJson(Map<String, dynamic> j) => Direction(
    j['id'] as String,
    j['name'] as String? ?? 'Design',
    j['description'] as String? ?? '',
    SiteSpec.fromJson(jsonMap(j['spec'])),
  );
}

/// Site state for the renderer (content, design, code, contact form).
Map<String, dynamic> siteState(ProjectDoc d, [SiteSpec? spec]) => {
  'content': d.content.toJson(),
  'spec': (spec ?? d.spec)!.toJson(),
  'custom': d.custom.toJson(),
  'contactForm': d.contactForm.toJson(),
};

/// "Pick a design direction": three designs for the same content.
class DirectionsPage extends ConsumerStatefulWidget {
  const DirectionsPage({super.key, required this.projectId});
  final String projectId;

  @override
  ConsumerState<DirectionsPage> createState() => _DirectionsPageState();
}

class _DirectionsPageState extends ConsumerState<DirectionsPage> {
  late final ProjectSession session = ProjectSession(
    projectId: widget.projectId,
    repo: ref.read(projectRepositoryProvider),
    drafts: BridgeDraftStore(ref.read(pbBridgeProvider)),
  );

  List<Direction> _directions = const [];
  final _previews = <String, String>{};
  final _seen = <String>[];
  var _round = 0;
  bool _loading = false;
  bool _applying = false;
  String? _note;
  AiChoice? _ai;

  PbBridge get _pb => ref.read(pbBridgeProvider);

  @override
  void initState() {
    super.initState();
    session.load().then((_) {
      if (mounted && session.doc != null) _generate();
    });
  }

  @override
  void dispose() {
    session.flush().whenComplete(session.dispose);
    super.dispose();
  }

  Future<void> _generate() async {
    final doc = session.doc!;
    setState(() {
      _loading = true;
      _note = null;
    });
    // Keys may have changed in another tab.
    ref.invalidate(savedKeysProvider);
    _ai = await ref.read(readyAiForTierProvider(AiTier.smart).future);
    List<Direction> list = const [];
    final goals = doc.goals.toJson();
    final inspiration = [for (final i in doc.inspiration) i.toJson()];
    if (_ai != null) {
      setState(() => _note = 'Designing with ${_ai!.model}…');
      try {
        final r = await _pb.invoke('ai', 'directions', [
          _ai!.provider,
          _ai!.model,
          jsonEncode({
            'profileType': profileTypeValues.reverse[doc.profileType],
            'goals': goals,
            'state': {'content': doc.content.toJson()},
            'inspiration': inspiration,
            'avoid': _seen,
          }),
        ]);
        list = jsonList(jsonMap(r.get<Object?>())['directions'])
            .map(Direction.fromJson)
            .toList();
        _note = null;
      } on PbException catch (e) {
        _note = '${e.message} Showing designs made without AI instead.';
      }
    }
    if (list.isEmpty) {
      final r = await _pb.invoke('site', 'directions', [
        profileTypeValues.reverse[doc.profileType],
        jsonEncode({
          'tone': toneValues.reverse[doc.goals.tone],
          'colorPreference': doc.goals.colorPreference,
          'colorMode': colorModeValues.reverse[doc.goals.colorMode],
        }),
        jsonEncode(inspiration),
        _round,
      ]);
      if (!r.ok) {
        setState(() {
          _loading = false;
          _note = r.errorMessage;
        });
        return;
      }
      list = jsonList(r.value).map(Direction.fromJson).toList();
    }
    _seen.addAll(list.map((d) => d.name));
    _round++;
    if (!mounted) return;
    setState(() {
      _directions = list;
      _previews.clear();
      _loading = false;
    });
    await _renderPreviews(doc, list);
  }

  Future<void> _renderPreviews(ProjectDoc doc, List<Direction> list) async {
    final assets = (await _pb.invoke('files', 'previewAssets', [
      widget.projectId,
    ])).value;
    for (final d in list) {
      try {
        final out = jsonDecode(
          await _pb.render(
            jsonEncode(siteState(doc, d.spec)),
            jsonEncode({
              'mode': 'preview',
              'fontSource': 'google',
              'assets': assets ?? const {},
            }),
          ),
        ) as Map<String, dynamic>;
        final html = _pb.previewDocument(jsonEncode(out['files']));
        if (mounted) setState(() => _previews[d.id] = html);
      } catch (_) {
        // A preview that fails to build just stays blank.
      }
    }
  }

  Future<void> _use(Direction d) async {
    setState(() => _applying = true);
    final hadDesign = session.doc!.spec != null;
    // A new design replaces sections; custom.css and custom.js are kept.
    session.update(
      (doc) => doc.copyWith(
        spec: d.spec,
        status: ProjectStatus.EDITING,
        custom: doc.custom.copyWith(sections: const {}),
      ),
    );
    await session.flush();
    try {
      await ref
          .read(versionRepositoryProvider)
          .save(
            widget.projectId,
            session.doc!,
            source: hadDesign
                ? VersionSource.REGENERATE
                : VersionSource.GENERATE,
            summary: 'Design: ${d.name}',
          );
    } catch (_) {
      // History is a convenience; the design itself is saved.
    }
    if (mounted) context.go('/p/${widget.projectId}');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Keeps the AI choice loaded (and live if it changes in Settings).
    ref.watch(readyAiForTierProvider(AiTier.smart));
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final doc = session.doc;
        return Scaffold(
          appBar: AppBar(
            leading: IconButton(
              tooltip: doc?.spec == null ? 'Back to setup' : 'Back to editor',
              icon: const Icon(Icons.arrow_back),
              onPressed: () => context.go(
                doc?.spec == null
                    ? '/p/${widget.projectId}/setup?step=${SetupStep.review.name}'
                    : '/p/${widget.projectId}',
              ),
            ),
            title: Text(
              doc == null ? 'Designs' : 'Designs for ${doc.name}',
              overflow: TextOverflow.ellipsis,
            ),
            actions: [
              if (doc != null) SyncIndicator(session: session),
              const SizedBox(width: 16),
            ],
          ),
          body: switch ((session.loaded, session.missing)) {
            (_, true) => const Center(
              child: Text('This portfolio doesn\'t exist.'),
            ),
            (false, _) => const Center(child: CircularProgressIndicator()),
            _ => ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Text(
                  'Three designs — same content, different look',
                  style: theme.textTheme.headlineSmall,
                ),
                const SizedBox(height: 4),
                Text(
                  doc!.spec == null
                      ? 'Pick one to start. You can change colours, fonts and every section afterwards.'
                      : 'Your content stays as it is. Custom sections are replaced; custom.css and custom.js are kept.',
                ),
                if (_ai == null && !_loading) ...[
                  const SizedBox(height: 12),
                  Card(
                    color: theme.colorScheme.secondaryContainer,
                    child: ListTile(
                      leading: const Icon(Icons.auto_awesome_outlined),
                      title: const Text(
                        'Made from built-in styles and your choices.',
                      ),
                      subtitle: const Text(
                        'Connect a free AI for designs shaped around your content and references.',
                      ),
                      trailing: TextButton(
                        key: const Key('connect-ai-designs'),
                        onPressed: () async {
                          if (await ensureAi(context, ref) != null) {
                            _round = 0;
                            _generate();
                          }
                        },
                        child: const Text('Connect AI'),
                      ),
                    ),
                  ),
                ],
                if (_note != null) ...[
                  const SizedBox(height: 12),
                  Text(_note!, key: const Key('directions-note')),
                ],
                const SizedBox(height: 20),
                if (_loading && _directions.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(48),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else
                  LayoutBuilder(
                    builder: (context, c) {
                      final perRow = c.maxWidth > 1000
                          ? 3
                          : c.maxWidth > 640
                          ? 2
                          : 1;
                      final w = (c.maxWidth - (perRow - 1) * 16) / perRow;
                      return Wrap(
                        spacing: 16,
                        runSpacing: 16,
                        children: [
                          for (final d in _directions)
                            SizedBox(
                              width: w,
                              child: _DirectionCard(
                                direction: d,
                                html: _previews[d.id],
                                busy: _applying,
                                onUse: () => _use(d),
                              ),
                            ),
                        ],
                      );
                    },
                  ),
                const SizedBox(height: 24),
                Center(
                  child: OutlinedButton.icon(
                    key: const Key('more-designs'),
                    onPressed: _loading || _applying ? null : _generate,
                    icon: const Icon(Icons.refresh),
                    label: Text(_loading ? 'Designing…' : 'Show 3 more'),
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

class _DirectionCard extends StatelessWidget {
  const _DirectionCard({
    required this.direction,
    required this.html,
    required this.busy,
    required this.onUse,
  });
  final Direction direction;
  final String? html;
  final bool busy;
  final VoidCallback onUse;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = direction.spec.theme;
    Color hex(String h) =>
        Color(0xff000000 | int.parse(h.substring(1), radix: 16));
    final colors = t.colorMode == ColorMode.DARK
        ? t.colors.dark
        : t.colors.light;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AspectRatio(
            aspectRatio: 16 / 11,
            child: html == null
                ? ColoredBox(
                    color: hex(colors.background),
                    child: const Center(child: CircularProgressIndicator()),
                  )
                // A desktop-width page, scaled down to fit the card.
                : IgnorePointer(
                    child: ClipRect(
                      child: FittedBox(
                        fit: BoxFit.cover,
                        alignment: Alignment.topCenter,
                        child: SizedBox(
                          width: 1280,
                          height: 880,
                          child: SiteFrame(html: html!),
                        ),
                      ),
                    ),
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        direction.name,
                        style: theme.textTheme.titleMedium,
                      ),
                    ),
                    for (final c in [
                      colors.primary,
                      colors.accent,
                      colors.text,
                    ])
                      Container(
                        width: 16,
                        height: 16,
                        margin: const EdgeInsets.only(left: 4),
                        decoration: BoxDecoration(
                          color: hex(c),
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: theme.colorScheme.outlineVariant,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  [
                    if (direction.description.isNotEmpty) direction.description,
                    '${t.fonts.heading} / ${t.fonts.body}',
                  ].join(' · '),
                  style: theme.textTheme.bodySmall,
                ),
                const SizedBox(height: 12),
                FilledButton(
                  key: Key('use-${direction.id}'),
                  onPressed: busy ? null : onUse,
                  child: const Text('Use this design'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
