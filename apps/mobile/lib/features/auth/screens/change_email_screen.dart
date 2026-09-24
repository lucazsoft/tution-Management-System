import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/features/auth/data/account_repository.dart';

class ChangeEmailScreen extends ConsumerStatefulWidget {
  const ChangeEmailScreen({super.key});

  @override
  ConsumerState<ChangeEmailScreen> createState() => _ChangeEmailScreenState();
}

class _ChangeEmailScreenState extends ConsumerState<ChangeEmailScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _repository = AccountRepository();
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  bool get _hasProgress =>
      _busy || _email.text.isNotEmpty || _password.text.isNotEmpty;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _back() async {
    if (_busy) return;
    if (!_hasProgress) return context.pop();
    final discard = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancel email change?'),
        content: const Text(
            'The login email on your account will remain unchanged.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Continue editing')),
          FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Discard')),
        ],
      ),
    );
    if (discard == true && mounted) {
      _email.clear();
      _password.clear();
      context.pop();
    }
  }

  Future<void> _submit() async {
    final validEmail =
        RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(_email.text.trim());
    if (!validEmail || _password.text.isEmpty || _busy) {
      setState(() =>
          _error = 'Enter a valid email address and your current password.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _repository.changeEmail(
          password: _password.text, email: _email.text);
      await ref.read(authProvider.notifier).forceLogout();
    } catch (error) {
      if (mounted) {
        setState(
            () => _error = error.toString().replaceFirst('DioException: ', ''));
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: !_hasProgress,
        onPopInvokedWithResult: (didPop, result) {
          if (!didPop) {
            _back();
          }
        },
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Change login email'),
            leading: IconButton(
                onPressed: _busy ? null : _back,
                icon: const Icon(Icons.arrow_back_rounded)),
          ),
          body: SafeArea(
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                const Icon(Icons.mark_email_read_outlined, size: 52),
                const SizedBox(height: 16),
                Text('Secure email change',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 8),
                const Text(
                    'Confirm your current password before changing the email used to sign in.',
                    textAlign: TextAlign.center),
                if (_error != null) ...[
                  const SizedBox(height: 20),
                  Text(_error!,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 28),
                TextField(
                  controller: _email,
                  enabled: !_busy,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(
                      labelText: 'New login email',
                      prefixIcon: Icon(Icons.email_outlined)),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _password,
                  enabled: !_busy,
                  obscureText: _obscure,
                  decoration: InputDecoration(
                    labelText: 'Current password',
                    prefixIcon: const Icon(Icons.lock_outline_rounded),
                    suffixIcon: IconButton(
                        onPressed: () => setState(() => _obscure = !_obscure),
                        icon: Icon(_obscure
                            ? Icons.visibility_off
                            : Icons.visibility)),
                  ),
                ),
                const SizedBox(height: 28),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox.square(
                          dimension: 22,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Change email securely'),
                ),
                const SizedBox(height: 12),
                const Text(
                    'All devices will be signed out after this change. Sign in again with the new email.',
                    textAlign: TextAlign.center),
              ],
            ),
          ),
        ),
      );
}
