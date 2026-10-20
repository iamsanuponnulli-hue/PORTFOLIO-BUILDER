import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/env.dart';
import '../../../core/js/pb_bridge.dart';
import '../../../core/ui/feedback.dart';
import '../../../core/web/browser.dart';
import '../../../models/generated/models.dart';
import '../../ai/ai_access.dart';
import '../../ai/ai_repository.dart';
import '../../project/project_session.dart';
import '../widgets.dart';

/// Built-in styles offered when there's no reference site (renderer preset ids).
const galleryStyles = [
  ('calm', 'Calm', 'Soft colours, rounded cards'),
  ('bold', 'Bold', 'Big type, strong contrast'),
  ('editorial', 'Editorial', 'Serif headings, magazine feel'),
  ('technical', 'Technical', 'Crisp and code-friendly'),
  ('warm', 'Warm', 'Friendly colours and shapes'),
  ('mono', 'Mono', 'Black and white, nothing extra'),
];

const maxInspiration = 3;

Color? _hex(String h) {
  final v = int.tryParse(h.replaceFirst('#', ''), radix: 16);
  return v == null ? null : Color(0xff000000 | v);
}

/// Step 4: sites, screenshots or styles to borrow from (all optional).
class InspirationStep extends ConsumerStatefulWidget {
  const InspirationStep({
    super.key,
    required this.session,
    required this.onNext,
  });
  final ProjectSession session;
  final VoidCallback onNext;

  @override
  ConsumerState<InspirationStep> createState() => _InspirationStepState();
}

class _InspirationStepState extends ConsumerState<InspirationStep> {
  final _url = TextEditingController();
  String? _busy;
  String? _note;
  Map<String, Object?> _assets = const {};

  /// Page styles from captures this session (kept in memory for the AI reading).
  final _styles = <String, Object?>{};

  PbBridge get _pb => ref.read(pbBridgeProvider);
  String get _projectId => widget.session.projectId;
  List<Inspiration> get _items => widget.session.doc!.inspiration;
  bool get _full => _items.length >= maxInspiration;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadThumbnails();
      _takePending();
    });
  }

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  Future<void> _loadThumbnails() async {
    final r = await _pb.invoke('files', 'previewAssets', [_projectId]);
    if (mounted && r.ok) setState(() => _assets = jsonMap(r.value));
  }

  /// Pages sent with the extension's toolbar button while browsing.
  Future<void> _takePending() async {
    if (_pb.extensionVersion().isEmpty || _full) return;
    final r = await _pb.invoke('inspiration', 'pending', [_projectId]);
    if (!r.ok) return;
    final list = jsonList(r.value);
    if (list.isEmpty) return;
    _addAll(list);
    if (mounted) {
      setState(
        () => _note =
            'Added ${list.length} page${list.length == 1 ? '' : 's'} you sent from the extension.',
      );
    }
  }

  void _addAll(List<Map<String, dynamic>> raw) {
    for (final m in raw) {
      if (m['styles'] != null) _styles[m['id'] as String] = m['styles'];
    }
    final room = maxInspiration - _items.length;
    final added = [
      for (final m in raw.take(room))
        Inspiration.fromJson(
          {
            'url': '',
            'title': '',
            'screenshots': <String>[],
            'borrow': {
              'colors': true,
              'fonts': true,
              'layout': false,
              'mood': true,
            },
            ...m,
          }..remove('styles'),
        ),
    ];
    widget.session.update(
      (d) => d.copyWith(inspiration: [...d.inspiration, ...added]),
    );
    _loadThumbnails();
  }

  Future<void> _capture() async {
    final url = _url.text.trim();
    if (url.isEmpty) {
      setState(() => _note = 'Paste the address of a site you like.');
      return;
    }
    setState(() {
      _busy = 'capture';
      _note = 'Opening $url… allow access if your browser asks.';
    });
    try {
      final r = await _pb.invoke('inspiration', 'capture', [_projectId, url]);
      _addAll([jsonMap(r.get<Object?>())]);
      _url.clear();
      setState(() => _note = null);
    } on PbException catch (e) {
      setState(() => _note = e.message);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _upload() async {
    setState(() => _busy = 'upload');
    try {
      final r = await _pb.invoke('inspiration', 'upload', [_projectId]);
      final list = jsonList(r.get<Object?>());
      if (list.isNotEmpty) _addAll(list);
    } on PbException catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  void _addStyle(String id, String label) {
    if (_full || _items.any((i) => i.url == id)) return;
    _addAll([
      {
        'id': 'g-$id',
        'source': 'gallery',
        'url': id,
        'title': label,
        'brief': {
          'palette': <String>[],
          'background': 'light',
          'fonts': {'heading': '', 'body': ''},
          'layout': <String>[],
          'mood': [id],
          'density': 'comfortable',
          'radius': 8,
        },
        'borrow': {
          'colors': false,
          'fonts': false,
          'layout': false,
          'mood': true,
        },
      },
    ]);
  }

  void _update(Inspiration item, Inspiration Function(Inspiration) change) =>
      widget.session.update(
        (d) => d.copyWith(
          inspiration: [
            for (final i in d.inspiration) i.id == item.id ? change(i) : i,
          ],
        ),
      );

  Future<void> _remove(Inspiration item) async {
    widget.session.update(
      (d) => d.copyWith(
        inspiration: [
          for (final i in d.inspiration)
            if (i.id != item.id) i,
        ],
      ),
    );
    if (item.screenshots.isNotEmpty) {
      await _pb.invoke('inspiration', 'remove', [
        _projectId,
        encode(item.screenshots),
      ]);
    }
  }

  /// Lets the person's AI read the design (sees screenshots if the model can).
  Future<void> _analyze(Inspiration item) async {
    final ai = await ensureAi(context, ref, AiTier.smart);
    if (ai == null) return;
    setState(() => _busy = item.id);
    try {
      final r = await _pb.invoke('inspiration', 'analyze', [
        _projectId,
        ai.provider,
        ai.model,
        encode({
          'screenshots': item.screenshots,
          if (_styles[item.id] != null) 'styles': _styles[item.id],
        }),
      ]);
      final v = jsonMap(r.get<Object?>());
      final brief = DesignBrief.fromJson(jsonMap(v['brief']));
      _update(item, (i) => i.copyWith(brief: brief));
      if (mounted && v['sawImages'] != true && item.screenshots.isNotEmpty) {
        showMessage(
          context,
          '${ai.model} can\'t see images, so it read the page styles only.',
        );
      }
    } catch (e) {
      if (mounted) showAiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = _pb.extensionVersion();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Show us sites you like', style: theme.textTheme.headlineSmall),
        const SizedBox(height: 4),
        const Text(
          'Up to three, all optional. Only their look is borrowed — colours, fonts, layout — '
          'never their words. Screenshots stay on this computer.',
        ),
        const SizedBox(height: 20),
        SectionCard(
          title: 'A site you like',
          subtitle: ext.isEmpty
              ? 'Reading another site needs the free Portfolio Builder extension (Chrome, Edge). '
                    'Without it, upload screenshots instead.'
              : 'Extension $ext installed. It opens the site in a small window, takes screenshots '
                    'and reads its colours and fonts.',
          trailing: Chip(
            avatar: Icon(
              ext.isEmpty ? Icons.extension_off_outlined : Icons.extension,
              size: 18,
            ),
            label: Text(ext.isEmpty ? 'No extension' : 'Extension ready'),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('inspiration-url'),
                      controller: _url,
                      enabled: ext.isNotEmpty && !_full,
                      decoration: const InputDecoration(
                        labelText: 'Site address',
                        hintText: 'https://…',
                      ),
                      onSubmitted: (_) => _capture(),
                    ),
                  ),
                  const SizedBox(width: 12),
                  FilledButton(
                    key: const Key('analyze-site'),
                    onPressed: ext.isEmpty || _full || _busy != null
                        ? null
                        : _capture,
                    child: Text(_busy == 'capture' ? 'Reading…' : 'Analyze'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 12,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    key: const Key('upload-screenshots'),
                    onPressed: _full || _busy != null ? null : _upload,
                    icon: const Icon(Icons.add_photo_alternate_outlined),
                    label: Text(
                      _busy == 'upload' ? 'Reading…' : 'Upload screenshots',
                    ),
                  ),
                  if (ext.isEmpty && Env.extensionUrl.isNotEmpty)
                    TextButton.icon(
                      onPressed: () => openExternal(Env.extensionUrl),
                      icon: const Icon(Icons.open_in_new),
                      label: const Text('Install the extension'),
                    ),
                ],
              ),
              if (_note != null) ...[
                const SizedBox(height: 12),
                Text(_note!, key: const Key('inspiration-note')),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        SectionCard(
          title: 'Or pick a style',
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final (id, label, blurb) in galleryStyles)
                Tooltip(
                  message: blurb,
                  child: FilterChip(
                    key: Key('style-$id'),
                    label: Text(label),
                    selected: _items.any((i) => i.url == id),
                    onSelected: (on) {
                      if (on) {
                        _addStyle(id, label);
                      } else {
                        final it = _items.where((i) => i.url == id).firstOrNull;
                        if (it != null) _remove(it);
                      }
                    },
                  ),
                ),
            ],
          ),
        ),
        for (final item in _items) ...[
          const SizedBox(height: 16),
          _InspirationCard(
            key: Key('inspiration-${item.id}'),
            item: item,
            thumbnail: item.screenshots
                .map((id) => jsonMap(_assets[id])['src'] as String?)
                .whereType<String>()
                .firstOrNull,
            busy: _busy == item.id,
            onBorrow: (b) => _update(item, (i) => i.copyWith(borrow: b)),
            onAnalyze: item.source == InspirationSource.GALLERY
                ? null
                : () => _analyze(item),
            onRemove: () => _remove(item),
          ),
        ],
        const SizedBox(height: 24),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton(
            key: const Key('next'),
            onPressed: widget.onNext,
            child: Text(_items.isEmpty ? 'Skip for now' : 'Next: review'),
          ),
        ),
      ],
    );
  }
}

class _InspirationCard extends StatelessWidget {
  const _InspirationCard({
    super.key,
    required this.item,
    required this.thumbnail,
    required this.busy,
    required this.onBorrow,
    required this.onAnalyze,
    required this.onRemove,
  });
  final Inspiration item;
  final String? thumbnail;
  final bool busy;
  final ValueChanged<Borrow> onBorrow;
  final VoidCallback? onAnalyze;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final b = item.brief;
    final borrow = item.borrow;
    final fonts = [
      b.fonts.heading,
      b.fonts.body,
    ].where((f) => f.isNotEmpty).toSet().join(' / ');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Container(
                width: 160,
                height: 100,
                color: theme.colorScheme.surfaceContainerHighest,
                child: thumbnail == null
                    ? Icon(
                        item.source == InspirationSource.GALLERY
                            ? Icons.palette_outlined
                            : Icons.image_outlined,
                        color: theme.colorScheme.outline,
                      )
                    : Image.network(thumbnail!, fit: BoxFit.cover),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          item.title.isEmpty ? item.url : item.title,
                          style: theme.textTheme.titleMedium,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (onAnalyze != null)
                        TextButton.icon(
                          onPressed: busy ? null : onAnalyze,
                          icon: const Icon(Icons.auto_awesome_outlined),
                          label: Text(busy ? 'Reading…' : 'Read with AI'),
                        ),
                      IconButton(
                        tooltip: 'Remove',
                        onPressed: onRemove,
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                  if (b.palette.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        for (final c in b.palette.take(6))
                          Container(
                            width: 22,
                            height: 22,
                            margin: const EdgeInsets.only(right: 4),
                            decoration: BoxDecoration(
                              color: _hex(c),
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(
                                color: theme.colorScheme.outlineVariant,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 6),
                  Text(
                    [
                      if (fonts.isNotEmpty) 'Fonts: $fonts',
                      if (b.layout.isNotEmpty) 'Layout: ${b.layout.join(', ')}',
                      if (b.mood.isNotEmpty) 'Mood: ${b.mood.join(', ')}',
                    ].join(' · '),
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text('Borrow:', style: theme.textTheme.labelMedium),
                      FilterChip(
                        label: const Text('Colours'),
                        selected: borrow.colors,
                        onSelected: b.palette.isEmpty
                            ? null
                            : (v) => onBorrow(borrow.copyWith(colors: v)),
                      ),
                      FilterChip(
                        label: const Text('Fonts'),
                        selected: borrow.fonts,
                        onSelected: fonts.isEmpty
                            ? null
                            : (v) => onBorrow(borrow.copyWith(fonts: v)),
                      ),
                      FilterChip(
                        label: const Text('Layout'),
                        selected: borrow.layout,
                        onSelected: (v) => onBorrow(borrow.copyWith(layout: v)),
                      ),
                      FilterChip(
                        label: const Text('Mood'),
                        selected: borrow.mood,
                        onSelected: (v) => onBorrow(borrow.copyWith(mood: v)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
