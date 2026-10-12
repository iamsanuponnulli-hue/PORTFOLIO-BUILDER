import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/ui/feedback.dart';
import 'auth_repository.dart';

enum _Mode { signIn, signUp }

class SignInPage extends ConsumerStatefulWidget {
  const SignInPage({super.key});

  @override
  ConsumerState<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends ConsumerState<SignInPage> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  var _mode = _Mode.signIn;
  var _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function(AuthRepository auth) action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action(ref.read(authRepositoryProvider));
    } catch (e) {
      if (mounted) setState(() => _error = authErrorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _submitEmail() {
    if (!_form.currentState!.validate()) return;
    _run(
      (auth) => _mode == _Mode.signIn
          ? auth.signInWithEmail(_email.text, _password.text)
          : auth.signUpWithEmail(_name.text, _email.text, _password.text),
    );
  }

  Future<void> _resetPassword() async {
    if (_email.text.trim().isEmpty) {
      setState(
        () => _error = 'Enter your email first, then choose "Forgot password".',
      );
      return;
    }
    await _run((auth) => auth.sendPasswordReset(_email.text));
    if (mounted && _error == null) {
      showMessage(
        context,
        'Password reset link sent to ${_email.text.trim()}.',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final signUp = _mode == _Mode.signUp;
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Portfolio Builder',
                  style: theme.textTheme.headlineMedium,
                ),
                const SizedBox(height: 8),
                Text(
                  'Build a portfolio website you own, in minutes.',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 32),
                OutlinedButton.icon(
                  key: const Key('google'),
                  onPressed: _busy
                      ? null
                      : () => _run((a) => a.signInWithGoogle()),
                  icon: const Icon(Icons.account_circle_outlined),
                  label: const Text('Continue with Google'),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  key: const Key('github'),
                  onPressed: _busy
                      ? null
                      : () => _run((a) => a.signInWithGitHub()),
                  icon: const Icon(Icons.code),
                  label: const Text('Continue with GitHub'),
                ),
                const SizedBox(height: 24),
                Row(
                  children: [
                    const Expanded(child: Divider()),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text(
                        'or use email',
                        style: theme.textTheme.labelMedium,
                      ),
                    ),
                    const Expanded(child: Divider()),
                  ],
                ),
                const SizedBox(height: 24),
                Form(
                  key: _form,
                  child: AutofillGroup(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (signUp) ...[
                          TextFormField(
                            controller: _name,
                            decoration: const InputDecoration(
                              labelText: 'Your name',
                            ),
                            autofillHints: const [AutofillHints.name],
                            textInputAction: TextInputAction.next,
                            validator: (v) => (v ?? '').trim().isEmpty
                                ? 'Enter your name.'
                                : null,
                          ),
                          const SizedBox(height: 12),
                        ],
                        TextFormField(
                          key: const Key('email'),
                          controller: _email,
                          decoration: const InputDecoration(labelText: 'Email'),
                          keyboardType: TextInputType.emailAddress,
                          autofillHints: const [AutofillHints.email],
                          textInputAction: TextInputAction.next,
                          validator: (v) => (v ?? '').contains('@')
                              ? null
                              : 'Enter a valid email address.',
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          key: const Key('password'),
                          controller: _password,
                          decoration: const InputDecoration(
                            labelText: 'Password',
                          ),
                          obscureText: true,
                          autofillHints: [
                            signUp
                                ? AutofillHints.newPassword
                                : AutofillHints.password,
                          ],
                          onFieldSubmitted: (_) => _submitEmail(),
                          validator: (v) => (v ?? '').length < 8
                              ? 'Use at least 8 characters.'
                              : null,
                        ),
                      ],
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    key: const Key('auth-error'),
                    style: TextStyle(color: theme.colorScheme.error),
                  ),
                ],
                const SizedBox(height: 16),
                FilledButton(
                  key: const Key('submit'),
                  onPressed: _busy ? null : _submitEmail,
                  child: Text(signUp ? 'Create account' : 'Sign in'),
                ),
                const SizedBox(height: 8),
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  children: [
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() {
                              _mode = signUp ? _Mode.signIn : _Mode.signUp;
                              _error = null;
                            }),
                      child: Text(
                        signUp ? 'I have an account' : 'Create an account',
                      ),
                    ),
                    if (!signUp)
                      TextButton(
                        onPressed: _busy ? null : _resetPassword,
                        child: const Text('Forgot password'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
