import 'package:flutter/material.dart';

import 'project_session.dart';

/// Shown when edits couldn't be synced: a conflict (keep mine or load the newer
/// version) or a refused save. Nothing when syncing is fine.
class SyncBanner extends StatelessWidget {
  const SyncBanner({super.key, required this.session, this.onBackup});
  final ProjectSession session;

  /// Downloads a backup, offered so the person never has to lose edits.
  final VoidCallback? onBackup;

  @override
  Widget build(BuildContext context) {
    final backup = onBackup == null
        ? null
        : TextButton(
            onPressed: onBackup,
            child: const Text('Download a backup'),
          );
    return switch (session.syncState) {
      SyncState.conflict => MaterialBanner(
        key: const Key('sync-conflict'),
        content: const Text(
          'This portfolio was changed in another tab or device. Your changes here '
          'are kept on this computer until you choose.',
        ),
        actions: [
          ?backup,
          TextButton(
            onPressed: session.reload,
            child: const Text('Load the newer version'),
          ),
          TextButton(
            key: const Key('keep-mine'),
            onPressed: session.keepMine,
            child: const Text('Keep my changes'),
          ),
        ],
      ),
      SyncState.rejected => MaterialBanner(
        key: const Key('sync-rejected'),
        content: const Text(
          'Your latest changes couldn\'t be saved to the cloud. They\'re kept on this '
          'computer; download a backup to be safe.',
        ),
        actions: [backup ?? const SizedBox.shrink()],
      ),
      _ => const SizedBox.shrink(),
    };
  }
}
