import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/js/pb_bridge.dart';
import '../../../core/ui/feedback.dart';
import '../../../models/generated/models.dart';
import '../../ai/ai_providers.dart';
import '../../ai/connect_ai_sheet.dart';
import '../../project/project_session.dart';
import '../content_merge.dart';
import '../widgets.dart';

/// Step 1: resume, GitHub and LinkedIn imports — all optional.
class ImportStep extends ConsumerStatefulWidget {
  const ImportStep({super.key, required this.session, required this.onNext});
  final ProjectSession session;
  final VoidCallback onNext;

  @override
  ConsumerState<ImportStep> createState() => _ImportStepState();
}

class _ImportStepState extends ConsumerState<ImportStep> {
  final _github = TextEditingController();
  String? _busy;
  String? _resumeNote;
  String? _githubNote;

  @override
  void dispose() {
    _github.dispose();
    super.dispose();
  }

  PbBridge get _pb => ref.read(pbBridgeProvider);

  String _summary(PortfolioContent before, PortfolioContent after) {
    final parts = <String>[
      if (after.experience.length > before.experience.length)
        '${after.experience.length - before.experience.length} roles',
      if (after.projects.length > before.projects.length)
        '${after.projects.length - before.projects.length} projects',
      if (after.education.length > before.education.length)
        '${after.education.length - before.education.length} schools',
      if (after.skills.length > before.skills.length)
        '${after.skills.length - before.skills.length} skill groups',
    ];
    return parts.isEmpty ? 'Nothing new to add.' : 'Added ${parts.join(', ')}.';
  }

  void _merge(PortfolioContent imported, void Function(String) note) {
    final before = widget.session.doc!.content;
    final merged = mergeContent(before, imported);
    widget.session.update((d) => d.copyWith(content: merged));
    note(_summary(before, merged));
  }

  Future<void> _importResume() async {
    setState(() {
      _busy = 'resume';
      _resumeNote = null;
    });
    try {
      final picked = await _pb.invoke('imports', 'pickResume', [
        widget.session.projectId,
      ]);
      final file = jsonMap(picked.get<Object?>());
      if (file.isEmpty) return; // cancelled
      if (file['scanned'] == true) {
        setState(
          () => _resumeNote =
              'This looks like a scanned document, so there\'s no text to read. '
              'Fill in your details on the next step, or try a PDF exported from Word or Google Docs.',
        );
        return;
      }
      // Keys may have been added in another tab: read them fresh.
      ref.invalidate(savedKeysProvider);
      var ready = await ref.read(readyAiProvider.future);
      if (ready == null && mounted) {
        if (await showConnectAi(context, ref)) {
          ref.invalidate(savedKeysProvider);
          ready = await ref.read(readyAiProvider.future);
        }
      }
      final choice = ready;
      if (choice == null) {
        setState(
          () => _resumeNote =
              'Your resume is saved on this computer. Without an AI connected, fill in your '
              'details by hand on the next step.',
        );
        return;
      }
      setState(() => _resumeNote = 'Reading your resume with ${choice.model}…');
      final parsed = await _pb.invoke('ai', 'parseResume', [
        choice.provider,
        choice.model,
        file['text'] as String,
      ]);
      final content = PortfolioContent.fromJson(
        jsonMap(jsonMap(parsed.get<Object?>())['content']),
      );
      _merge(
        content,
        (s) => setState(
          () => _resumeNote = '$s Check the details on the next step.',
        ),
      );
    } on PbException catch (e) {
      setState(() => _resumeNote = e.message);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _importGithub() async {
    if (_github.text.trim().isEmpty) {
      setState(() => _githubNote = 'Enter your GitHub username.');
      return;
    }
    setState(() {
      _busy = 'github';
      _githubNote = null;
    });
    try {
      final r = await _pb.invoke('imports', 'github', [_github.text.trim()]);
      final empty = PortfolioContent.fromJson(
        ref.read(templatesProvider).content,
      );
      _merge(
        githubContent(jsonMap(r.get<Object?>()), empty),
        (s) => setState(() => _githubNote = s),
      );
    } on PbException catch (e) {
      setState(() => _githubNote = e.message);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Watching keeps the user's AI choice live (e.g. changed in another tab).
    final ai = ref.watch(readyAiProvider).value;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Bring in what you already have',
          style: theme.textTheme.headlineSmall,
        ),
        const SizedBox(height: 4),
        const Text(
          'All optional. Files are read on this computer; nothing is uploaded.',
        ),
        const SizedBox(height: 20),
        SectionCard(
          title: 'Resume',
          subtitle:
              'PDF, Word (.docx) or text. Read by your own AI, which copies facts only. '
              '${ai == null ? 'No AI connected yet.' : 'Uses ${ai.model}.'}',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              FilledButton.icon(
                key: const Key('pick-resume'),
                onPressed: _busy != null ? null : _importResume,
                icon: const Icon(Icons.upload_file),
                label: Text(
                  _busy == 'resume' ? 'Reading…' : 'Choose a resume file',
                ),
              ),
              if (_resumeNote != null) ...[
                const SizedBox(height: 12),
                Text(_resumeNote!, key: const Key('resume-note')),
              ],
              const SizedBox(height: 12),
              Text(
                'Using LinkedIn? Open your profile, choose More → Save to PDF, then pick that file here.',
                style: theme.textTheme.bodySmall,
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SectionCard(
          title: 'GitHub',
          subtitle: 'Your own repositories, best first. Read straight from GitHub; no AI needed.',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('github-user'),
                      controller: _github,
                      decoration: const InputDecoration(
                        labelText: 'GitHub username',
                        hintText: 'e.g. janedoe',
                      ),
                      onSubmitted: (_) => _importGithub(),
                    ),
                  ),
                  const SizedBox(width: 12),
                  OutlinedButton(
                    key: const Key('import-github'),
                    onPressed: _busy != null ? null : _importGithub,
                    child: Text(_busy == 'github' ? 'Importing…' : 'Import'),
                  ),
                ],
              ),
              if (_githubNote != null) ...[
                const SizedBox(height: 12),
                Text(_githubNote!, key: const Key('github-note')),
              ],
            ],
          ),
        ),
        const SizedBox(height: 24),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton(
            key: const Key('next'),
            onPressed: () {
              if (_busy != null) {
                showMessage(context, 'Wait for the import to finish.');
                return;
              }
              widget.onNext();
            },
            child: const Text('Next: check your content'),
          ),
        ),
      ],
    );
  }
}
