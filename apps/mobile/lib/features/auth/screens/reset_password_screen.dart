import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/core/utils/validators.dart';
import 'package:tms_mobile/features/auth/data/auth_service.dart';
import 'package:tms_mobile/features/auth/screens/login_screen.dart';
import 'package:tms_mobile/features/auth/widgets/auth_card.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({
    super.key,
    required this.email,
    required this.resetToken,
  });

  final String email;
  final String resetToken;

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();

  bool _obscurePassword = true;
  bool _obscureConfirm = true;
  bool _isLoading = false;

  bool get _hasMinLength =>
      AppValidators.hasMinLength(_passwordController.text);
  bool get _hasUppercase =>
      AppValidators.hasUppercase(_passwordController.text);
  bool get _hasLowercase =>
      AppValidators.hasLowercase(_passwordController.text);
  bool get _hasNumber => AppValidators.hasNumber(_passwordController.text);
  bool get _hasSpecial => AppValidators.hasSpecial(_passwordController.text);
  bool get _passwordsMatch =>
      _confirmController.text.isNotEmpty &&
      _passwordController.text == _confirmController.text;

  bool get _canReset =>
      _hasMinLength &&
      _hasUppercase &&
      _hasLowercase &&
      _hasNumber &&
      _hasSpecial &&
      _passwordsMatch &&
      !_isLoading;

  int get _strengthScore =>
      AppValidators.passwordStrengthScore(_passwordController.text);

  @override
  void initState() {
    super.initState();
    _passwordController.addListener(_refresh);
    _confirmController.addListener(_refresh);
  }

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  void _refresh() => setState(() {});

  Future<void> _resetPassword() async {
    if (!_canReset) {
      return;
    }

    setState(() => _isLoading = true);
    try {
      await AuthService.resetPassword(
        resetToken: widget.resetToken,
        newPassword: _passwordController.text,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Password reset successfully. Please sign in.')),
      );
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute<void>(builder: (_) => const LoginScreen()),
        (route) => false,
      );
    } on AuthFailure catch (error) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthCard(
      onBack: () => Navigator.of(context).pop(),
      backLabel: 'Back',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Reset Password',
            textAlign: TextAlign.center,
            style: GoogleFonts.fraunces(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              color: kColorText,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Create a new password for ${widget.email}.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: kColorText.withValues(alpha: 0.72),
                ),
          ),
          const SizedBox(height: 24),
          TextField(
            controller: _passwordController,
            obscureText: _obscurePassword,
            decoration: InputDecoration(
              labelText: 'New password',
              suffixIcon: IconButton(
                onPressed: () =>
                    setState(() => _obscurePassword = !_obscurePassword),
                icon: Icon(
                    _obscurePassword ? Icons.visibility_off : Icons.visibility),
              ),
            ),
          ),
          const SizedBox(height: 16),
          _PasswordStrengthBar(score: _strengthScore),
          const SizedBox(height: 20),
          ...[
            _RuleRow(label: 'At least 8 characters', passed: _hasMinLength),
            _RuleRow(label: 'One uppercase letter', passed: _hasUppercase),
            _RuleRow(label: 'One lowercase letter', passed: _hasLowercase),
            _RuleRow(label: 'One number', passed: _hasNumber),
            _RuleRow(
                label: 'One special character (!@#\$%^&*)',
                passed: _hasSpecial),
          ],
          const SizedBox(height: 20),
          TextField(
            controller: _confirmController,
            obscureText: _obscureConfirm,
            decoration: InputDecoration(
              labelText: 'Confirm password',
              suffixIcon: IconButton(
                onPressed: () =>
                    setState(() => _obscureConfirm = !_obscureConfirm),
                icon: Icon(
                    _obscureConfirm ? Icons.visibility_off : Icons.visibility),
              ),
            ),
          ),
          const SizedBox(height: 12),
          _RuleRow(label: 'Passwords match', passed: _passwordsMatch),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: _canReset ? _resetPassword : null,
            child: _isLoading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      color: Colors.white,
                    ),
                  )
                : const Text('Reset Password'),
          ),
        ],
      ),
    );
  }
}

class _RuleRow extends StatelessWidget {
  const _RuleRow({required this.label, required this.passed});

  final String label;
  final bool passed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(
            passed ? Icons.check_circle : Icons.cancel,
            color: passed ? kColorSuccess : kColorError,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(label)),
        ],
      ),
    );
  }
}

class _PasswordStrengthBar extends StatelessWidget {
  const _PasswordStrengthBar({required this.score});

  final int score;

  Color get _fillColor {
    switch (score) {
      case 0:
      case 1:
        return kColorError;
      case 2:
        return kColorWarning;
      case 3:
        return const Color(0xFF1AA4A1);
      default:
        return kColorSuccess;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Password strength',
          style: Theme.of(context)
              .textTheme
              .bodyMedium
              ?.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(TmsRadius.rFull),
              child: LinearProgressIndicator(
                value: score / 4,
                minHeight: 10,
                backgroundColor: const Color(0xFFDDE3EC),
                valueColor: AlwaysStoppedAnimation<Color>(_fillColor),
              ),
            ),
            Positioned.fill(
              child: Row(
                children: List.generate(
                  3,
                  (_) => Expanded(
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: Container(width: 2, color: kColorBg),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
