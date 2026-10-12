import 'package:flutter/material.dart';

import '../../models/generated/models.dart';
import '../../models/profile_types.dart';

class NewProjectResult {
  const NewProjectResult(this.name, this.profileType);
  final String name;
  final ProfileType profileType;
}

/// Name + profile type. The full setup wizard follows in Phase 2.
Future<NewProjectResult?> showNewProjectDialog(
  BuildContext context, {
  String? suggestedName,
}) {
  return showDialog<NewProjectResult>(
    context: context,
    builder: (_) => _NewProjectDialog(suggestedName: suggestedName ?? ''),
  );
}

class _NewProjectDialog extends StatefulWidget {
  const _NewProjectDialog({required this.suggestedName});
  final String suggestedName;

  @override
  State<_NewProjectDialog> createState() => _NewProjectDialogState();
}

class _NewProjectDialogState extends State<_NewProjectDialog> {
  late final _name = TextEditingController(text: widget.suggestedName);
  final _form = GlobalKey<FormState>();
  var _type = ProfileType.DEVELOPER;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _submit() {
    if (_form.currentState!.validate()) {
      Navigator.pop(context, NewProjectResult(_name.text.trim(), _type));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('New portfolio'),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Form(
            key: _form,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  key: const Key('project-name'),
                  controller: _name,
                  autofocus: true,
                  maxLength: 80,
                  decoration: const InputDecoration(
                    labelText: 'Name',
                    hintText: 'e.g. Jane Doe — Developer',
                  ),
                  validator: nameValidator,
                  onFieldSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: 8),
                Text(
                  'What kind of portfolio?',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 4),
                RadioGroup<ProfileType>(
                  groupValue: _type,
                  onChanged: (v) => setState(() => _type = v ?? _type),
                  child: Column(
                    children: [
                      for (final t in [
                        ProfileType.DEVELOPER,
                        ProfileType.DESIGNER,
                        ProfileType.STUDENT,
                        ProfileType.PROFESSIONAL,
                      ])
                        RadioListTile<ProfileType>(
                          value: t,
                          title: Text(t.label),
                          subtitle: Text(t.blurb),
                          contentPadding: EdgeInsets.zero,
                        ),
                    ],
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
          key: const Key('create-project'),
          onPressed: _submit,
          child: const Text('Create'),
        ),
      ],
    );
  }
}

String? nameValidator(String? v) {
  final t = (v ?? '').trim();
  if (t.isEmpty) return 'Give your portfolio a name.';
  if (t.length > 80) return 'Keep the name under 80 characters.';
  return null;
}

Future<String?> showRenameDialog(BuildContext context, String current) {
  final controller = TextEditingController(text: current);
  final form = GlobalKey<FormState>();
  return showDialog<String>(
    context: context,
    builder: (context) {
      void submit() {
        if (form.currentState!.validate()) {
          Navigator.pop(context, controller.text.trim());
        }
      }

      return AlertDialog(
        title: const Text('Rename portfolio'),
        content: SizedBox(
          width: 420,
          child: Form(
            key: form,
            child: TextFormField(
              controller: controller,
              autofocus: true,
              maxLength: 80,
              decoration: const InputDecoration(labelText: 'Name'),
              validator: nameValidator,
              onFieldSubmitted: (_) => submit(),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(onPressed: submit, child: const Text('Rename')),
        ],
      );
    },
  ).whenComplete(controller.dispose);
}
