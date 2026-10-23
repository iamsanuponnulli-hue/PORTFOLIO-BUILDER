import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/js/pb_bridge.dart';
import '../../../core/ui/feedback.dart';
import '../../../models/generated/models.dart';
import '../../project/project_session.dart';
import '../content_ai.dart';
import '../content_editors.dart';
import '../widgets.dart';

/// Step 2: check and complete everything the site will say.
class ContentStep extends ConsumerStatefulWidget {
  const ContentStep({
    super.key,
    required this.session,
    this.onNext,
    this.embedded = false,
    this.onImageAdded,
  });
  final ProjectSession session;

  /// Called after an image is stored (the editor reloads its preview images).
  final VoidCallback? onImageAdded;

  /// The wizard's "Next" button (left out in the editor).
  final VoidCallback? onNext;

  /// Shown in the editor's Content panel: no page heading.
  final bool embedded;

  @override
  ConsumerState<ContentStep> createState() => _ContentStepState();
}

class _ContentStepState extends ConsumerState<ContentStep> {
  bool _pickingPhoto = false;

  PortfolioContent get _content => widget.session.doc!.content;

  /// Edits the content as JSON, so one code path covers every section.
  void _edit(void Function(Map<String, dynamic> j) change) {
    widget.session.update((d) {
      final j =
          jsonDecode(jsonEncode(d.content.toJson())) as Map<String, dynamic>;
      change(j);
      return d.copyWith(content: PortfolioContent.fromJson(j));
    });
  }

  void _setProfile(String key, String value) =>
      _edit((j) => (j['profile'] as Map)[key] = value);

  Future<void> _pickPhoto() async {
    setState(() => _pickingPhoto = true);
    try {
      final r = await ref.read(pbBridgeProvider).invoke('files', 'pickImage', [
        widget.session.projectId,
        'photo',
      ]);
      if (r.get<Object?>() == null) return;
      widget.onImageAdded?.call();
      final name = _content.profile.name.trim();
      _edit(
        (j) => (j['profile'] as Map)['photo'] = {
          'assetId': 'photo',
          'alt': name.isEmpty ? 'Portrait' : name,
        },
      );
    } on PbException catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _pickingPhoto = false);
    }
  }

  /// Adds a screenshot or photo to a project (kept on this computer).
  Future<void> _addProjectImage(int index) async {
    final project = _content.projects[index];
    final fileId = 'img-${project.id}-${DateTime.now().millisecondsSinceEpoch}';
    try {
      final r = await ref.read(pbBridgeProvider).invoke('files', 'pickImage', [
        widget.session.projectId,
        fileId,
      ]);
      if (r.get<Object?>() == null) return;
      widget.onImageAdded?.call();
      _edit(
        (j) => (((j['projects'] as List)[index] as Map)['images'] as List).add({
          'assetId': fileId,
          'alt': project.title,
        }),
      );
    } on PbException catch (e) {
      if (mounted) showMessage(context, e.message);
    }
  }

  String _newId(String prefix, List items) {
    final ids = {for (final x in items) (x as Map)['id']};
    for (var n = items.length + 1; ; n++) {
      if (!ids.contains('$prefix$n')) return '$prefix$n';
    }
  }

  Future<void> _editItem(ListSection s, [int? index]) async {
    final list = (_content.toJson()[s.key] as List)
        .cast<Map<String, dynamic>>();
    final initial = index == null ? s.empty() : list[index];
    final result = await showItemEditor(
      context,
      title: index == null ? 'Add ${s.itemName}' : 'Edit ${s.itemName}',
      fields: s.fields,
      initial: initial,
    );
    if (result == null) return;
    _edit((j) {
      final items = j[s.key] as List;
      if (index == null) {
        items.add({...result, 'id': _newId(s.idPrefix, items)});
      } else {
        items[index] = result;
      }
    });
  }

  void _move(String key, int index, int by) => _edit((j) {
    final items = j[key] as List;
    final to = index + by;
    if (to < 0 || to >= items.length) return;
    items.insert(to, items.removeAt(index));
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final content = _content;
    final p = content.profile;
    final json = content.toJson();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!widget.embedded) ...[
          Text(
            'Check and complete your content',
            style: theme.textTheme.headlineSmall,
          ),
          const SizedBox(height: 4),
          const Text(
            'This is what your site will say. The design comes next, and you can change everything later.',
          ),
          const SizedBox(height: 20),
        ],
        SectionCard(
          title: 'About you',
          trailing: TextButton.icon(
            key: const Key('polish-profile'),
            onPressed: () => polishText(
              context,
              ref,
              widget.session,
              what: 'The headline, tagline and about text of a portfolio',
              items: [
                TextItem(['profile', 'headline'], 'Headline', p.headline),
                TextItem(['profile', 'tagline'], 'Tagline', p.tagline),
                TextItem(['profile', 'bio'], 'About', p.bio),
              ],
            ),
            icon: const Icon(Icons.auto_awesome_outlined, size: 18),
            label: const Text('Polish wording'),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    child: Icon(
                      p.photo == null ? Icons.person_outline : Icons.check,
                    ),
                  ),
                  const SizedBox(width: 16),
                  OutlinedButton.icon(
                    key: const Key('pick-photo'),
                    onPressed: _pickingPhoto ? null : _pickPhoto,
                    icon: const Icon(Icons.image_outlined),
                    label: Text(
                      p.photo == null ? 'Add a photo' : 'Change photo',
                    ),
                  ),
                  if (p.photo != null)
                    TextButton(
                      onPressed: () =>
                          _edit((j) => (j['profile'] as Map)['photo'] = null),
                      child: const Text('Remove'),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              SyncedField(
                key: const Key('profile-name'),
                label: 'Name',
                value: p.name,
                onChanged: (v) => _setProfile('name', v),
              ),
              const SizedBox(height: 12),
              SyncedField(
                key: const Key('profile-headline'),
                label: 'Headline',
                hint: 'e.g. Frontend engineer who loves accessible design',
                value: p.headline,
                onChanged: (v) => _setProfile('headline', v),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: SyncedField(
                      label: 'Tagline (optional)',
                      value: p.tagline,
                      onChanged: (v) => _setProfile('tagline', v),
                    ),
                  ),
                  IconButton(
                    key: const Key('suggest-tagline'),
                    tooltip: 'Suggest taglines',
                    onPressed: () =>
                        suggestTagline(context, ref, widget.session),
                    icon: const Icon(Icons.auto_awesome_outlined),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SyncedField(
                key: const Key('profile-bio'),
                label: 'About',
                hint: 'A few sentences in your own words.',
                minLines: 3,
                maxLines: 10,
                value: p.bio,
                onChanged: (v) => _setProfile('bio', v),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: SyncedField(
                      label: 'Location',
                      value: p.location,
                      onChanged: (v) => _setProfile('location', v),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SyncedField(
                      label: 'Public email',
                      keyboardType: TextInputType.emailAddress,
                      value: p.email,
                      onChanged: (v) => _setProfile('email', v),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SectionCard(
          title: 'Links',
          subtitle: 'GitHub, LinkedIn, Dribbble, your blog…',
          trailing: IconButton(
            key: const Key('add-link'),
            tooltip: 'Add a link',
            icon: const Icon(Icons.add),
            onPressed: () async {
              final r = await showItemEditor(
                context,
                title: 'Add a link',
                fields: const [
                  FieldSpec(
                    'label',
                    'Label',
                    hint: 'e.g. GitHub',
                    required: true,
                  ),
                  FieldSpec(
                    'url',
                    'Address',
                    hint: 'https://…',
                    required: true,
                  ),
                ],
                initial: {'label': '', 'url': ''},
              );
              if (r != null) {
                _edit((j) => ((j['profile'] as Map)['socials'] as List).add(r));
              }
            },
          ),
          child: p.socials.isEmpty
              ? const Text('No links yet.')
              : Column(
                  children: [
                    for (final (i, s) in p.socials.indexed)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(s.label),
                        subtitle: Text(s.url, overflow: TextOverflow.ellipsis),
                        trailing: IconButton(
                          tooltip: 'Remove',
                          icon: const Icon(Icons.close),
                          onPressed: () => _edit(
                            (j) => ((j['profile'] as Map)['socials'] as List)
                                .removeAt(i),
                          ),
                        ),
                      ),
                  ],
                ),
        ),
        const SizedBox(height: 16),
        _SkillsCard(
          groups: content.skills,
          onChanged: (groups) =>
              _edit((j) => j['skills'] = [for (final g in groups) g.toJson()]),
        ),
        for (final s in listSections) ...[
          const SizedBox(height: 16),
          SectionCard(
            title: s.title,
            trailing: IconButton(
              key: Key('add-${s.key}'),
              tooltip: 'Add ${s.itemName}',
              icon: const Icon(Icons.add),
              onPressed: () => _editItem(s),
            ),
            child: Builder(
              builder: (context) {
                final items = (json[s.key] as List)
                    .cast<Map<String, dynamic>>();
                if (items.isEmpty) {
                  return Text(
                    'No ${s.title.toLowerCase()} yet. Leave it empty to hide the section.',
                  );
                }
                return Column(
                  children: [
                    for (final (i, m) in items.indexed)
                      ListTile(
                        key: Key('${s.key}-$i'),
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          s.titleOf(m),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle:
                            s.subtitleOf == null || s.subtitleOf!(m).isEmpty
                            ? null
                            : Text(
                                s.subtitleOf!(m),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                        onTap: () => _editItem(s, i),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (s.key == 'experience')
                              IconButton(
                                key: Key('polish-${s.key}-$i'),
                                tooltip: 'Improve the bullet points',
                                icon: const Icon(Icons.auto_awesome_outlined),
                                onPressed: () => polishText(
                                  context,
                                  ref,
                                  widget.session,
                                  what:
                                      'Bullet points for ${s.titleOf(m)} (action verb + outcome)',
                                  items: [
                                    for (final (b, text)
                                        in ((m['bullets'] as List?) ?? const [])
                                            .cast<String>()
                                            .indexed)
                                      TextItem(
                                        ['experience', i, 'bullets', b],
                                        'Bullet ${b + 1}',
                                        text,
                                      ),
                                  ],
                                ),
                              ),
                            if (s.key == 'projects')
                              PopupMenuButton<String>(
                                key: Key('project-ai-$i'),
                                tooltip: 'Write with AI',
                                icon: const Icon(Icons.auto_awesome_outlined),
                                onSelected: (a) => a == 'image'
                                    ? _addProjectImage(i)
                                    : a == 'case'
                                    ? caseStudyInterview(
                                        context,
                                        ref,
                                        widget.session,
                                        i,
                                      )
                                    : polishText(
                                        context,
                                        ref,
                                        widget.session,
                                        what:
                                            'A short summary of the project "${s.titleOf(m)}"',
                                        items: [
                                          TextItem(
                                            ['projects', i, 'summary'],
                                            'Summary',
                                            (m['summary'] as String?) ?? '',
                                          ),
                                        ],
                                      ),
                                itemBuilder: (_) => [
                                  PopupMenuItem(
                                    value: 'image',
                                    child: Text(
                                      'Add an image (${((m['images'] as List?) ?? const []).length} so far)',
                                    ),
                                  ),
                                  const PopupMenuItem(
                                    value: 'summary',
                                    child: Text('Improve the summary'),
                                  ),
                                  PopupMenuItem(
                                    value: 'case',
                                    child: Text(
                                      m['caseStudy'] == null
                                          ? 'Write a case study'
                                          : 'Edit the case study',
                                    ),
                                  ),
                                ],
                              ),
                            IconButton(
                              tooltip: 'Move up',
                              icon: const Icon(Icons.arrow_upward),
                              onPressed: i == 0
                                  ? null
                                  : () => _move(s.key, i, -1),
                            ),
                            IconButton(
                              tooltip: 'Remove',
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () async {
                                final ok = await confirm(
                                  context,
                                  title: 'Remove this ${s.itemName}?',
                                  message: s.titleOf(items[i]),
                                  action: 'Remove',
                                );
                                if (ok) {
                                  _edit((j) => (j[s.key] as List).removeAt(i));
                                }
                              },
                            ),
                          ],
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
        ],
        if (widget.onNext != null) ...[
          const SizedBox(height: 24),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(
              key: const Key('next'),
              onPressed: widget.onNext,
              child: const Text('Next: your goals'),
            ),
          ),
        ],
      ],
    );
  }
}

class _SkillsCard extends StatelessWidget {
  const _SkillsCard({required this.groups, required this.onChanged});
  final List<SkillGroup> groups;
  final ValueChanged<List<SkillGroup>> onChanged;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: 'Skills',
      subtitle: 'Grouped, e.g. "Languages: TypeScript, Dart". Comma separated.',
      trailing: IconButton(
        key: const Key('add-skills'),
        tooltip: 'Add a group',
        icon: const Icon(Icons.add),
        onPressed: () => onChanged([
          ...groups,
          SkillGroup(group: 'Skills', items: const []),
        ]),
      ),
      child: groups.isEmpty
          ? const Text('No skills yet.')
          : Column(
              children: [
                for (final (i, g) in groups.indexed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 160,
                          child: SyncedField(
                            label: 'Group',
                            value: g.group,
                            onChanged: (v) => onChanged([
                              for (final (k, x) in groups.indexed)
                                k == i ? x.copyWith(group: v.trim()) : x,
                            ]),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: SyncedField(
                            key: Key('skills-$i'),
                            label: 'Skills',
                            value: g.items.join(', '),
                            onChanged: (v) => onChanged([
                              for (final (k, x) in groups.indexed)
                                k == i
                                    ? x.copyWith(
                                        items: v
                                            .split(',')
                                            .map((s) => s.trim())
                                            .where((s) => s.isNotEmpty)
                                            .toList(),
                                      )
                                    : x,
                            ]),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Remove group',
                          icon: const Icon(Icons.close),
                          onPressed: () => onChanged([...groups]..removeAt(i)),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }
}
