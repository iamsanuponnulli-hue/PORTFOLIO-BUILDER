import 'package:flutter/material.dart';

import '../../core/ui/feedback.dart';
import '../../models/generated/models.dart' hide Colors;
import '../setup/widgets.dart';
import 'catalog.dart';
import 'editor_controller.dart';

/// Sections: add, remove, drag to reorder, hide, switch layout, rename.
class SectionsPanel extends StatelessWidget {
  const SectionsPanel({
    super.key,
    required this.editor,
    required this.catalog,
    this.onAskAssistant,
  });
  final EditorController editor;
  final Catalog catalog;

  /// Opens the assistant about one section (e.g. "Redesign this section").
  final void Function(String sectionId)? onAskAssistant;

  SiteSpec get _spec => editor.doc!.spec!;

  Future<void> _add(BuildContext context, SectionInfo info) async {
    final sections = _spec.sections;
    // New sections go before Contact, which usually ends the page.
    final contact = sections.indexWhere((s) => s.type == SectionType.CONTACT);
    await editor.apply([
      {
        'op': 'addSection',
        'type': info.type,
        'variant': info.variants.first.id,
        'index': contact >= 0 ? contact : sections.length,
      },
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final spec = _spec;
    final empty = {
      for (final c in editor.checks)
        if (c.id.startsWith('empty-') && c.sectionId != null) c.sectionId!,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Drag to reorder. Click a section to edit it.',
                  style: theme.textTheme.bodySmall,
                ),
              ),
              MenuAnchor(
                menuChildren: [
                  for (final info in catalog.library)
                    MenuItemButton(
                      key: Key('add-section-${info.type}'),
                      onPressed: () => _add(context, info),
                      child: Text(info.label),
                    ),
                ],
                builder: (context, c, _) => TextButton.icon(
                  key: const Key('add-section'),
                  onPressed: () => c.isOpen ? c.close() : c.open(),
                  icon: const Icon(Icons.add),
                  label: const Text('Add'),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ReorderableListView.builder(
            buildDefaultDragHandles: false,
            padding: const EdgeInsets.only(bottom: 16),
            itemCount: spec.sections.length,
            onReorderItem: (from, to) => editor.apply([
              {'op': 'moveSection', 'id': spec.sections[from].id, 'index': to},
            ]),
            itemBuilder: (context, i) {
              final s = spec.sections[i];
              return _SectionTile(
                key: ValueKey(s.id),
                index: i,
                section: s,
                editor: editor,
                catalog: catalog,
                isEmpty: empty.contains(s.id),
                onAsk: onAskAssistant,
              );
            },
          ),
        ),
        const Divider(height: 1),
        _SiteStructure(editor: editor, catalog: catalog),
      ],
    );
  }
}

class _SectionTile extends StatelessWidget {
  const _SectionTile({
    super.key,
    required this.index,
    required this.section,
    required this.editor,
    required this.catalog,
    required this.isEmpty,
    required this.onAsk,
  });
  final int index;
  final SectionSpec section;
  final EditorController editor;
  final Catalog catalog;
  final bool isEmpty;
  final void Function(String sectionId)? onAsk;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = section;
    final selected = editor.selected == s.id;
    final info = catalog.info(s.type);
    final variants = info?.variants ?? const <VariantInfo>[];
    return Material(
      color: selected
          ? theme.colorScheme.secondaryContainer
          : Colors.transparent,
      child: InkWell(
        onTap: () => editor.select(selected ? null : s.id),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  ReorderableDragStartListener(
                    index: index,
                    child: const Padding(
                      padding: EdgeInsets.all(8),
                      child: Icon(Icons.drag_indicator, size: 20),
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          catalog.title(s),
                          style: theme.textTheme.titleSmall?.copyWith(
                            color: s.visible ? null : theme.disabledColor,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          [
                            if (catalog.title(s) != catalog.label(s.type))
                              catalog.label(s.type),
                            s.custom
                                ? 'Custom code'
                                : catalog.variantLabel(s.type, s.variant),
                            if (!s.visible) 'Hidden',
                            if (isEmpty && s.visible) 'Nothing to show yet',
                          ].join(' · '),
                          style: theme.textTheme.bodySmall,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    key: Key('toggle-${s.id}'),
                    tooltip: s.visible ? 'Hide' : 'Show',
                    icon: Icon(
                      s.visible
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                      size: 20,
                    ),
                    onPressed: () => editor.apply([
                      {'op': 'toggleSection', 'id': s.id},
                    ]),
                  ),
                ],
              ),
              if (selected) ...[
                const SizedBox(height: 4),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (!s.custom && variants.length > 1)
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            for (final v in variants)
                              ChoiceChip(
                                key: Key('variant-${s.id}-${v.id}'),
                                label: Text(v.label),
                                selected: v.id == s.variant,
                                onSelected: (_) => editor.apply([
                                  {
                                    'op': 'setVariant',
                                    'id': s.id,
                                    'variant': v.id,
                                  },
                                ]),
                              ),
                          ],
                        ),
                      const SizedBox(height: 8),
                      if (s.type != SectionType.HERO)
                        SyncedField(
                          key: Key('title-${s.id}'),
                          label: 'Section title',
                          value: (s.options['title'] as String?) ?? '',
                          hint: info?.defaultTitle,
                          onChanged: (v) => editor.apply([
                            {
                              'op': 'setSectionOptions',
                              'id': s.id,
                              'options': {'title': v.trim()},
                            },
                          ]),
                        ),
                      if (s.type == SectionType.PROJECTS)
                        CheckboxListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          title: const Text('Let visitors filter by tag'),
                          value: s.options['filter'] == true,
                          onChanged: (v) => editor.apply([
                            {
                              'op': 'setSectionOptions',
                              'id': s.id,
                              'options': {'filter': v == true},
                            },
                          ]),
                        ),
                      if (s.type == SectionType.CONTACT) ...[
                        const SizedBox(height: 8),
                        SyncedField(
                          label: 'Line above the contact details',
                          hint: 'e.g. Open to new roles from June.',
                          value: (s.options['lead'] as String?) ?? '',
                          onChanged: (v) => editor.apply([
                            {
                              'op': 'setSectionOptions',
                              'id': s.id,
                              'options': {'lead': v.trim()},
                            },
                          ]),
                        ),
                      ],
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 4,
                        runSpacing: 4,
                        children: [
                          if (!s.custom && variants.length > 1)
                            TextButton.icon(
                              key: Key('another-layout-${s.id}'),
                              onPressed: () {
                                final at = variants.indexWhere(
                                  (v) => v.id == s.variant,
                                );
                                editor.apply([
                                  {
                                    'op': 'setVariant',
                                    'id': s.id,
                                    'variant':
                                        variants[(at + 1) % variants.length].id,
                                  },
                                ]);
                              },
                              icon: const Icon(Icons.shuffle, size: 18),
                              label: const Text('Try another layout'),
                            ),
                          if (onAsk != null)
                            TextButton.icon(
                              onPressed: () => onAsk!(s.id),
                              icon: const Icon(
                                Icons.auto_awesome_outlined,
                                size: 18,
                              ),
                              label: const Text('Ask the assistant'),
                            ),
                          if (s.custom && s.type != SectionType.CUSTOM)
                            TextButton.icon(
                              onPressed: () async {
                                final ok = await confirm(
                                  context,
                                  title: 'Use the generated layout again?',
                                  message: 'Your custom code for this section will be removed. You can undo this.',
                                  action: 'Use generated layout',
                                );
                                if (ok) {
                                  editor.apply([
                                    {'op': 'revertToManaged', 'id': s.id},
                                  ]);
                                }
                              },
                              icon: const Icon(Icons.restore, size: 18),
                              label: const Text('Back to generated layout'),
                            ),
                          TextButton.icon(
                            key: Key('remove-${s.id}'),
                            style: TextButton.styleFrom(
                              foregroundColor: theme.colorScheme.error,
                            ),
                            onPressed: () {
                              editor.select(null);
                              editor.apply([
                                {'op': 'removeSection', 'id': s.id},
                              ]);
                              showMessage(
                                context,
                                'Removed "${catalog.title(s)}". Undo with ↶ or Ctrl+Z.',
                              );
                            },
                            icon: const Icon(Icons.delete_outline, size: 18),
                            label: const Text('Remove'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Navigation layout and case-study pages.
class _SiteStructure extends StatelessWidget {
  const _SiteStructure({required this.editor, required this.catalog});
  final EditorController editor;
  final Catalog catalog;

  @override
  Widget build(BuildContext context) {
    final spec = editor.doc!.spec!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (catalog.nav.length > 1)
            DropdownButtonFormField<String>(
              initialValue: spec.nav.variant,
              decoration: const InputDecoration(labelText: 'Navigation'),
              items: [
                for (final v in catalog.nav)
                  DropdownMenuItem(value: v.id, child: Text(v.label)),
              ],
              onChanged: (v) => editor.apply([
                {'op': 'setNav', 'variant': v},
              ]),
            ),
          SwitchListTile(
            key: const Key('case-studies'),
            contentPadding: EdgeInsets.zero,
            title: const Text('Case-study pages'),
            subtitle: const Text('A page for each project with a case study.'),
            value: spec.pages.caseStudies,
            onChanged: (v) => editor.apply([
              {
                'op': 'setPages',
                'pages': {'caseStudies': v},
              },
            ]),
          ),
        ],
      ),
    );
  }
}
