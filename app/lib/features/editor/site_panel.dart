import 'package:flutter/material.dart';

import '../../core/web/browser.dart';
import '../../models/generated/models.dart';
import '../setup/widgets.dart';
import 'editor_controller.dart';

class FormService {
  const FormService(
    this.id,
    this.label,
    this.field,
    this.hint,
    this.howTo,
    this.signUp,
    this.valid,
  );
  final String id;
  final String label;
  final String field;
  final String hint;
  final String howTo;
  final String? signUp;
  final bool Function(String value) valid;
}

/// Form services the contact section can send messages to (all have free plans).
final formServices = [
  FormService(
    'none',
    'No form: email and links only',
    '',
    '',
    'Visitors contact you through your email address and links. A "Copy" button is added next to your email.',
    null,
    (_) => true,
  ),
  FormService(
    'formspree',
    'Formspree',
    'Form ID',
    'e.g. xyzabcde (from formspree.io/f/xyzabcde)',
    'Create a free Formspree account, add a form, and copy its ID. Messages arrive in your email.',
    'https://formspree.io/register',
    (v) =>
        RegExp(r'^(https?://formspree\.io/)?(f/)?[a-zA-Z0-9]+$')
            .hasMatch(v.trim()),
  ),
  FormService(
    'web3forms',
    'Web3Forms',
    'Access key',
    'e.g. 1a2b3c4d-…',
    'Get a free access key at web3forms.com with your email address. Messages are emailed to you.',
    'https://web3forms.com/',
    (v) => RegExp(r'^[a-zA-Z0-9-]+$').hasMatch(v.trim()),
  ),
  FormService(
    'endpoint',
    'Getform, Basin, FormSubmit or another service',
    'Form address',
    'https://…',
    'Paste the form address (endpoint) your service gives you. It must start with https://.',
    null,
    (v) => RegExp(r'^https://\S+$', caseSensitive: false).hasMatch(v.trim()),
  ),
  FormService(
    'link',
    'Google Forms, Tally or Typeform link',
    'Share link',
    'https://…',
    'Your site shows a "Contact me" button that opens this form.',
    null,
    (v) => RegExp(r'^https://\S+$', caseSensitive: false).hasMatch(v.trim()),
  ),
];

/// Site settings: search and sharing, address, contact form.
class SitePanel extends StatelessWidget {
  const SitePanel({super.key, required this.editor});
  final EditorController editor;

  void _seo(Map<String, dynamic> seo) => editor.apply([
    {'op': 'setSeo', 'seo': seo},
  ]);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final d = editor.doc!;
    final seo = d.spec!.seo;
    final cf = d.contactForm;
    final service =
        formServices
            .where((s) => s.id == serviceValues.reverse[cf.service])
            .firstOrNull ??
        formServices.first;
    final valueOk = cf.value.trim().isEmpty || service.valid(cf.value);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Contact form', style: theme.textTheme.titleSmall),
        const SizedBox(height: 4),
        Text(
          'Static sites can\'t send email themselves, so messages go through a form '
          'service you sign up for. Testing in this preview never sends anything.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          key: const Key('form-service'),
          initialValue: service.id,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Form service'),
          items: [
            for (final s in formServices)
              DropdownMenuItem(value: s.id, child: Text(s.label)),
          ],
          onChanged: (v) => editor.apply([
            {
              'op': 'setContactForm',
              'contactForm': {'service': v},
            },
          ]),
        ),
        const SizedBox(height: 8),
        Text(service.howTo, style: theme.textTheme.bodySmall),
        if (service.signUp != null)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => openExternal(service.signUp!),
              icon: const Icon(Icons.open_in_new, size: 18),
              label: Text('Open ${service.label}'),
            ),
          ),
        if (service.id != 'none') ...[
          const SizedBox(height: 8),
          SyncedField(
            key: const Key('form-value'),
            label: service.field,
            hint: service.hint,
            value: cf.value,
            onChanged: (v) => editor.apply([
              {
                'op': 'setContactForm',
                'contactForm': {'value': v.trim()},
              },
            ]),
          ),
          if (!valueOk)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'This doesn\'t look like a ${service.field.toLowerCase()} for ${service.label}.',
                key: const Key('form-value-error'),
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ),
          if (!d.spec!.sections.any(
            (s) => s.type == SectionType.CONTACT && s.visible,
          ))
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'Add a Contact section (Sections → Add) to show the form.',
                style: theme.textTheme.bodySmall,
              ),
            ),
        ],
        const SizedBox(height: 28),
        Text('Search and sharing', style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),
        SyncedField(
          key: const Key('seo-title'),
          label: 'Page title',
          hint: 'Defaults to your name and headline',
          value: seo.title,
          onChanged: (v) => _seo({'title': v.trim()}),
        ),
        const SizedBox(height: 12),
        SyncedField(
          key: const Key('seo-description'),
          label: 'Description for search results',
          hint: 'One sentence, up to 160 characters',
          minLines: 2,
          maxLines: 4,
          value: seo.description,
          onChanged: (v) => _seo({
            'description': v.trim().length > 170
                ? v.trim().substring(0, 170)
                : v.trim(),
          }),
        ),
        const SizedBox(height: 12),
        SyncedField(
          key: const Key('seo-url'),
          label: 'Site address (after you publish it)',
          hint: 'https://janedoe.dev',
          keyboardType: TextInputType.url,
          value: seo.url,
          onChanged: (v) => _seo({'url': v.trim()}),
        ),
        const SizedBox(height: 4),
        Text(
          'With an https:// address, the export adds a sitemap, canonical links and a share image.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 12),
        SyncedField(
          label: 'Keywords (comma separated)',
          value: seo.keywords.join(', '),
          onChanged: (v) => _seo({
            'keywords': [
              for (final k in v.split(','))
                if (k.trim().isNotEmpty) k.trim(),
            ].take(20).toList(),
          }),
        ),
      ],
    );
  }
}
