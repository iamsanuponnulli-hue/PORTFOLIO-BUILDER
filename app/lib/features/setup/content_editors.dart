import 'dart:convert';

import 'package:flutter/material.dart';

/// How a field is edited.
enum FieldKind {
  text,
  multiline,

  /// A list of strings, one per line (e.g. bullet points).
  lines,

  /// A list of strings, comma separated (e.g. technologies).
  csv,
}

class FieldSpec {
  const FieldSpec(
    this.key,
    this.label, {
    this.kind = FieldKind.text,
    this.hint,
    this.required = false,
  });
  final String key;
  final String label;
  final FieldKind kind;
  final String? hint;
  final bool required;
}

/// A list in PortfolioContent edited as JSON maps (keeps one editor for all types).
class ListSection {
  const ListSection({
    required this.key,
    required this.title,
    required this.itemName,
    required this.idPrefix,
    required this.fields,
    required this.titleOf,
    this.subtitleOf,
    required this.empty,
  });

  final String key;
  final String title;
  final String itemName;
  final String idPrefix;
  final List<FieldSpec> fields;
  final String Function(Map<String, dynamic>) titleOf;
  final String Function(Map<String, dynamic>)? subtitleOf;
  final Map<String, dynamic> Function() empty;
}

String _join(List<String> parts) =>
    parts.where((p) => p.trim().isNotEmpty).join(' · ');
String _s(Object? v) => (v as String?) ?? '';

final listSections = <ListSection>[
  ListSection(
    key: 'experience',
    title: 'Experience',
    itemName: 'role',
    idPrefix: 'e',
    fields: const [
      FieldSpec('role', 'Role', required: true),
      FieldSpec('company', 'Company', required: true),
      FieldSpec('start', 'Start', hint: 'e.g. Jan 2022'),
      FieldSpec('end', 'End', hint: 'e.g. Present'),
      FieldSpec('location', 'Location'),
      FieldSpec(
        'bullets',
        'What you did (one per line)',
        kind: FieldKind.lines,
      ),
      FieldSpec(
        'tech',
        'Tools and technologies (comma separated)',
        kind: FieldKind.csv,
      ),
    ],
    titleOf: (m) => '${_s(m['role'])} at ${_s(m['company'])}',
    subtitleOf: (m) => _join([_s(m['start']), _s(m['end'])]),
    empty: () => {
      'company': '',
      'role': '',
      'start': '',
      'end': '',
      'location': '',
      'bullets': <String>[],
      'tech': <String>[],
    },
  ),
  ListSection(
    key: 'projects',
    title: 'Projects',
    itemName: 'project',
    idPrefix: 'p',
    fields: const [
      FieldSpec('title', 'Title', required: true),
      FieldSpec(
        'summary',
        'One or two sentences about it',
        kind: FieldKind.multiline,
      ),
      FieldSpec('role', 'Your role'),
      FieldSpec(
        'tech',
        'Tools and technologies (comma separated)',
        kind: FieldKind.csv,
      ),
      FieldSpec(
        'tags',
        'Tags for filtering (comma separated)',
        kind: FieldKind.csv,
      ),
    ],
    titleOf: (m) => _s(m['title']),
    subtitleOf: (m) => _s(m['summary']),
    empty: () => {
      'title': '',
      'summary': '',
      'role': '',
      'tech': <String>[],
      'tags': <String>[],
      'links': <Object>[],
      'images': <Object>[],
      'featured': false,
    },
  ),
  ListSection(
    key: 'education',
    title: 'Education',
    itemName: 'school',
    idPrefix: 'ed',
    fields: const [
      FieldSpec('institution', 'School or university', required: true),
      FieldSpec('degree', 'Degree or course'),
      FieldSpec('start', 'Start'),
      FieldSpec('end', 'End'),
      FieldSpec('details', 'Details (one per line)', kind: FieldKind.lines),
    ],
    titleOf: (m) => _s(m['institution']),
    subtitleOf: (m) => _join([_s(m['degree']), _s(m['end'])]),
    empty: () => {
      'institution': '',
      'degree': '',
      'start': '',
      'end': '',
      'details': <String>[],
    },
  ),
  for (final (key, title, item, prefix) in [
    ('certifications', 'Certifications', 'certification', 'c'),
    ('awards', 'Awards', 'award', 'a'),
    ('writing', 'Writing', 'article', 'w'),
  ])
    ListSection(
      key: key,
      title: title,
      itemName: item,
      idPrefix: prefix,
      fields: [
        const FieldSpec('title', 'Title', required: true),
        FieldSpec('issuer', key == 'writing' ? 'Published in' : 'From'),
        const FieldSpec('date', 'Date'),
        const FieldSpec('url', 'Link'),
        const FieldSpec(
          'description',
          'Description',
          kind: FieldKind.multiline,
        ),
      ],
      titleOf: (m) => _s(m['title']),
      subtitleOf: (m) => _join([_s(m['issuer']), _s(m['date'])]),
      empty: () => {
        'title': '',
        'issuer': '',
        'date': '',
        'url': '',
        'description': '',
      },
    ),
  ListSection(
    key: 'testimonials',
    title: 'Testimonials',
    itemName: 'quote',
    idPrefix: 't',
    fields: const [
      FieldSpec(
        'quote',
        'What they said',
        kind: FieldKind.multiline,
        required: true,
      ),
      FieldSpec('author', 'Who said it', required: true),
      FieldSpec('role', 'Their role'),
    ],
    titleOf: (m) => '“${_s(m['quote'])}”',
    subtitleOf: (m) => _s(m['author']),
    empty: () => {'quote': '', 'author': '', 'role': ''},
  ),
];

/// Edits one item. Returns the updated map, or null when cancelled.
Future<Map<String, dynamic>?> showItemEditor(
  BuildContext context, {
  required String title,
  required List<FieldSpec> fields,
  required Map<String, dynamic> initial,
}) => showDialog<Map<String, dynamic>>(
  context: context,
  builder: (_) => _ItemEditor(title: title, fields: fields, initial: initial),
);

class _ItemEditor extends StatefulWidget {
  const _ItemEditor({
    required this.title,
    required this.fields,
    required this.initial,
  });
  final String title;
  final List<FieldSpec> fields;
  final Map<String, dynamic> initial;

  @override
  State<_ItemEditor> createState() => _ItemEditorState();
}

class _ItemEditorState extends State<_ItemEditor> {
  final _form = GlobalKey<FormState>();
  late final Map<String, TextEditingController> _c = {
    for (final f in widget.fields)
      f.key: TextEditingController(text: _toText(f, widget.initial[f.key])),
  };

  static String _toText(FieldSpec f, Object? v) => switch (f.kind) {
    FieldKind.lines => ((v as List?) ?? const []).join('\n'),
    FieldKind.csv => ((v as List?) ?? const []).join(', '),
    _ => (v as String?) ?? '',
  };

  static Object _fromText(FieldSpec f, String t) => switch (f.kind) {
    FieldKind.lines =>
      t.split('\n').map((s) => s.trim()).where((s) => s.isNotEmpty).toList(),
    FieldKind.csv =>
      t.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList(),
    _ => t.trim(),
  };

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _save() {
    if (!_form.currentState!.validate()) return;
    final out = jsonDecode(jsonEncode(widget.initial)) as Map<String, dynamic>;
    for (final f in widget.fields) {
      out[f.key] = _fromText(f, _c[f.key]!.text);
    }
    Navigator.pop(context, out);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(
          child: Form(
            key: _form,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final f in widget.fields)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: TextFormField(
                      key: Key('field-${f.key}'),
                      controller: _c[f.key],
                      minLines:
                          f.kind == FieldKind.multiline ||
                              f.kind == FieldKind.lines
                          ? 3
                          : 1,
                      maxLines:
                          f.kind == FieldKind.multiline ||
                              f.kind == FieldKind.lines
                          ? 8
                          : 1,
                      decoration: InputDecoration(
                        labelText: f.label,
                        hintText: f.hint,
                      ),
                      validator: f.required
                          ? (v) => (v ?? '').trim().isEmpty
                                ? 'Fill this in.'
                                : null
                          : null,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          key: const Key('save-item'),
          onPressed: _save,
          child: const Text('Save'),
        ),
      ],
    );
  }
}
