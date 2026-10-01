import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/features/auth/data/account_repository.dart';
import 'package:tms_mobile/features/auth/widgets/forgot_password_prompt.dart';

class ChangeMobileScreen extends ConsumerStatefulWidget {
  const ChangeMobileScreen({super.key});

  @override
  ConsumerState<ChangeMobileScreen> createState() => _ChangeMobileScreenState();
}

class _ChangeMobileScreenState extends ConsumerState<ChangeMobileScreen> {
  final _password = TextEditingController();
  final _phone = TextEditingController();
  final _currentCode = TextEditingController();
  final _newCode = TextEditingController();
  final _repository = AccountRepository();
  MobileChangeChallenge? _challenge;
  bool _busy = false;
  bool _obscurePassword = true;
  String? _error;

  bool get _hasProgress =>
      _busy ||
      _password.text.isNotEmpty ||
      _phone.text.isNotEmpty ||
      _challenge != null;

  @override
  void dispose() {
    _password.dispose();
    _phone.dispose();
    _currentCode.dispose();
    _newCode.dispose();
    super.dispose();
  }

  Future<bool> _confirmExit() async {
    if (!_hasProgress) return true;
    if (_busy) return false;
    return await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Cancel security change?'),
            content: const Text(
              'Your security mobile will remain unchanged. Any verification codes already sent will expire.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Continue change'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Cancel change'),
              ),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _back() async {
    if (await _confirmExit() && mounted) context.pop();
  }

  Future<void> _submit() async {
    if (_busy) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_challenge == null) {
        if (_password.text.isEmpty ||
            !RegExp(r'^\d{10}$').hasMatch(_phone.text.trim())) {
          throw const FormatException(
            'Enter your current password and a valid 10-digit mobile number.',
          );
        }
        final challenge = await _repository.startMobileChange(
          password: _password.text,
          phone: _phone.text,
        );
        if (!mounted) return;
        setState(() {
          _challenge = challenge;
          _password.clear();
        });
      } else {
        if (!RegExp(r'^\d{6}$').hasMatch(_currentCode.text) ||
            !RegExp(r'^\d{6}$').hasMatch(_newCode.text)) {
          throw const FormatException(
              'Enter both six-digit verification codes.');
        }
        await _repository.confirmMobileChange(
          challengeId: _challenge!.id,
          currentCode: _currentCode.text,
          newCode: _newCode.text,
        );
        await ref.read(authProvider.notifier).forceLogout();
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = error is FormatException
            ? error.message
            : error.toString().replaceFirst('DioException: ', ''));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final challenge = _challenge;
    return PopScope(
      canPop: !_hasProgress,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) _back();
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Change mobile number'),
          leading: IconButton(
            onPressed: _busy ? null : _back,
            icon: const Icon(Icons.arrow_back_rounded),
            tooltip: 'Back',
          ),
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Icon(
                challenge == null
                    ? Icons.phonelink_lock_rounded
                    : Icons.sms_outlined,
                size: 52,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(height: 16),
              Text(
                challenge == null
                    ? 'Confirm your identity'
                    : 'Verify both numbers',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              Text(
                challenge == null
                    ? 'Enter your password and new mobile number. Your existing number remains active until verification is complete.'
                    : 'Enter the codes sent to ${challenge.currentDestination} and ${challenge.newDestination}. Codes expire after five minutes.',
                textAlign: TextAlign.center,
              ),
              if (_error != null) ...[
                const SizedBox(height: 20),
                Text(_error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 28),
              if (challenge == null) ...[
                TextField(
                  controller: _password,
                  obscureText: _obscurePassword,
                  enabled: !_busy,
                  decoration: InputDecoration(
                    labelText: 'Current password',
                    prefixIcon: const Icon(Icons.lock_outline_rounded),
                    suffixIcon: IconButton(
                      onPressed: () =>
                          setState(() => _obscurePassword = !_obscurePassword),
                      icon: Icon(_obscurePassword
                          ? Icons.visibility_off
                          : Icons.visibility),
                    ),
                  ),
                ),
                const ForgotPasswordPrompt(),
                const SizedBox(height: 16),
                TextField(
                  controller: _phone,
                  enabled: !_busy,
                  keyboardType: TextInputType.phone,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(10)
                  ],
                  decoration: const InputDecoration(
                    labelText: 'New mobile number',
                    hintText: '98XXXXXXXX',
                    prefixIcon: Icon(Icons.phone_android_rounded),
                  ),
                ),
              ] else ...[
                _codeField(_currentCode,
                    'Code sent to ${challenge.currentDestination}'),
                const SizedBox(height: 16),
                _codeField(
                    _newCode, 'Code sent to ${challenge.newDestination}'),
              ],
              const SizedBox(height: 28),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox.square(
                        dimension: 22,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(challenge == null
                        ? 'Continue securely'
                        : 'Confirm mobile change'),
              ),
              const SizedBox(height: 12),
              const Text(
                'Completing this security change signs out every device. Sign in again using your updated account.',
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _codeField(TextEditingController controller, String label) =>
      TextField(
        controller: controller,
        enabled: !_busy,
        keyboardType: TextInputType.number,
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(6),
        ],
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: const Icon(Icons.password_rounded),
        ),
      );
}
