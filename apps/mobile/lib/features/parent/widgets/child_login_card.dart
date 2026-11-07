import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:tms_mobile/core/theme/app_theme.dart';
import 'package:tms_mobile/features/auth/data/auth_service.dart';
import 'package:tms_mobile/features/parent/models/parent_portal.dart';

/// Shows the selected child's login ID and, when the child uses this parent's
/// number, lets the parent reset the child's password with a code sent to the
/// parent's own phone (docs/planphone.md, phase 6).
class ChildLoginCard extends StatelessWidget {
  const ChildLoginCard({super.key, required this.child});

  final ParentChild child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(TmsSpace.md),
        child: Row(
          children: [
            const Icon(Icons.badge_outlined, color: kColorPrimary),
            const SizedBox(width: TmsSpace.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${child.name}\'s login ID',
                      style: theme.textTheme.labelMedium
                          ?.copyWith(color: kColorMutedText)),
                  SelectableText(child.loginId,
                      style: theme.textTheme.titleSmall),
                  if (child.usesParentPhone)
                    Text('Uses your phone for login codes.',
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: kColorMutedText)),
                ],
              ),
            ),
            if (child.usesParentPhone)
              TextButton(
                onPressed: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  builder: (_) => _ChildPasswordResetSheet(child: child),
                ),
                child: const Text('Reset password'),
              ),
          ],
        ),
      ),
    );
  }
}

enum _ResetStep { send, code, password, done }

class _ChildPasswordResetSheet extends StatefulWidget {
  const _ChildPasswordResetSheet({required this.child});

  final ParentChild child;

  @override
  State<_ChildPasswordResetSheet> createState() =>
      _ChildPasswordResetSheetState();
}

class _ChildPasswordResetSheetState extends State<_ChildPasswordResetSheet> {
  final _code = TextEditingController();
  final _password = TextEditingController();
  _ResetStep _step = _ResetStep.send;
  String _resetToken = '';
  String? _error;
  bool _busy = false;

  static final _strongPassword = RegExp(
      r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$');

  @override
  void dispose() {
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on AuthFailure catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendCode() => _run(() async {
        await AuthService.sendPasswordOtp(widget.child.loginId);
        setState(() => _step = _ResetStep.code);
      });

  Future<void> _verifyCode() => _run(() async {
        _resetToken = await AuthService.verifyPasswordOtp(
            email: widget.child.loginId, otp: _code.text);
        setState(() => _step = _ResetStep.password);
      });

  Future<void> _savePassword() => _run(() async {
        if (!_strongPassword.hasMatch(_password.text)) {
          throw const AuthFailure(
              'Use at least 8 characters with uppercase, lowercase, a number, and a symbol.');
        }
        await AuthService.resetPassword(
            resetToken: _resetToken, newPassword: _password.text);
        setState(() => _step = _ResetStep.done);
      });

  @override
  Widget build(BuildContext context) {
    final name = widget.child.name;
    final theme = Theme.of(context);
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(
          TmsSpace.lg, TmsSpace.lg, TmsSpace.lg, TmsSpace.lg + bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Reset $name\'s password', style: theme.textTheme.titleLarge),
          const SizedBox(height: TmsSpace.sm),
          if (_step == _ResetStep.send) ...[
            Text(
                'We will send a 6-digit code to your verified phone. The code is for $name\'s login only.'),
            const SizedBox(height: TmsSpace.md),
            FilledButton(
                onPressed: _busy ? null : _sendCode,
                child: Text(_busy ? 'Sending…' : 'Send code to my phone')),
          ],
          if (_step == _ResetStep.code) ...[
            const Text(
                'If your phone is verified, a code was sent to it. Enter it below.'),
            const SizedBox(height: TmsSpace.sm),
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              maxLength: 6,
              autofillHints: const [AutofillHints.oneTimeCode],
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: '6-digit code'),
            ),
            FilledButton(
                onPressed: _busy ? null : _verifyCode,
                child: const Text('Verify code')),
          ],
          if (_step == _ResetStep.password) ...[
            TextField(
              controller: _password,
              obscureText: true,
              autofillHints: const [AutofillHints.newPassword],
              decoration: InputDecoration(labelText: 'New password for $name'),
            ),
            const SizedBox(height: TmsSpace.sm),
            FilledButton(
                onPressed: _busy ? null : _savePassword,
                child: const Text('Save password')),
          ],
          if (_step == _ResetStep.done) ...[
            Text(
                '$name\'s password was changed and their other devices were signed out.'),
            const SizedBox(height: TmsSpace.md),
            FilledButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Done')),
          ],
          if (_error != null) ...[
            const SizedBox(height: TmsSpace.sm),
            Text(_error!, style: const TextStyle(color: kColorError)),
          ],
        ],
      ),
    );
  }
}
