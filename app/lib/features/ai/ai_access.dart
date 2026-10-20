import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/js/pb_bridge.dart';
import '../../core/ui/feedback.dart';
import 'ai_providers.dart';
import 'ai_repository.dart';
import 'connect_ai_sheet.dart';

/// The model to use for [tier], offering "Connect a free AI" first when none is set
/// up. Returns null when the person skips (the caller then works without AI).
Future<AiChoice?> ensureAi(
  BuildContext context,
  WidgetRef ref, [
  AiTier tier = AiTier.smart,
]) async {
  // Keys may have been added in another tab: read them fresh.
  ref.invalidate(savedKeysProvider);
  var ready = await ref.read(readyAiForTierProvider(tier).future);
  if (ready != null || !context.mounted) return ready;
  if (await showConnectAi(context, ref)) {
    ref.invalidate(savedKeysProvider);
    ready = await ref.read(readyAiForTierProvider(tier).future);
  }
  return ready;
}

/// Error codes where choosing another model (or fixing the key) is the way out.
const _modelProblems = {
  'invalid_key',
  'rate_limited',
  'no_credit',
  'model_unavailable',
  'invalid_output',
  'refused',
  'no_vision',
};

/// Shows an AI error with a one-click way to pick another model when that helps.
void showAiError(BuildContext context, Object error) {
  final e = error is PbException
      ? error
      : PbException('error', 'Something went wrong: $error');
  final messenger = ScaffoldMessenger.of(context);
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(e.message),
        duration: const Duration(seconds: 8),
        action: _modelProblems.contains(e.code)
            ? SnackBarAction(
                label: 'Pick another model',
                onPressed: () => GoRouter.maybeOf(context)?.go('/settings/ai'),
              )
            : null,
      ),
    );
}

/// Shorthand for features that want a plain message when there's no AI.
void showNoAi(BuildContext context) => showMessage(
  context,
  'Connect an AI in Settings → AI to use this. Everything else works without one.',
);
