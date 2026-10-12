import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/ui/feedback.dart';
import 'auth_repository.dart';

class VerifyEmailPage extends ConsumerStatefulWidget {
  const VerifyEmailPage({super.key});

  @override
  ConsumerState<VerifyEmailPage> createState() => _VerifyEmailPageState();
}

class _VerifyEmailPageState extends ConsumerState<VerifyEmailPage> {
  var _busy = false;

  Future<void> _check() async {
    setState(() => _busy = true);
    try {
      final ok = await ref.read(authRepositoryProvider).refreshVerification();
      if (!ok && mounted) {
        showMessage(
          context,
          'Not verified yet. Open the link in the email, then try again.',
        );
      }
    } catch (e) {
      if (mounted) showMessage(context, authErrorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    try {
      await ref.read(authRepositoryProvider).resendVerification();
      if (mounted) showMessage(context, 'Verification email sent again.');
    } catch (e) {
      if (mounted) showMessage(context, authErrorMessage(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final email = ref.watch(authUserProvider).value?.email ?? 'your email';
    final theme = Theme.of(context);
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(
                  Icons.mark_email_unread_outlined,
                  size: 48,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(height: 16),
                Text('Check your email', style: theme.textTheme.headlineSmall),
                const SizedBox(height: 8),
                Text(
                  'We sent a verification link to $email. Open it, then come back here.',
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _busy ? null : _check,
                  child: const Text("I've verified my email"),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: _busy ? null : _resend,
                  child: const Text('Send again'),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => ref.read(authRepositoryProvider).signOut(),
                  child: const Text('Use a different account'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
