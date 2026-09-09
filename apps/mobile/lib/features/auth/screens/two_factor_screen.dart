import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/core/utils/formatters.dart';
import 'package:tms_mobile/features/auth/data/auth_service.dart';
import 'package:tms_mobile/features/auth/widgets/auth_card.dart';
import 'package:tms_mobile/features/auth/widgets/otp_input_field.dart';

class TwoFactorScreen extends ConsumerStatefulWidget {
  const TwoFactorScreen({super.key, required this.email});

  final String email;

  @override
  ConsumerState<TwoFactorScreen> createState() => _TwoFactorScreenState();
}

class _TwoFactorScreenState extends ConsumerState<TwoFactorScreen> {
  Timer? _timer;
  bool _trustDevice = true;
  bool _isLoading = false;
  String _code = '';
  int _secondsRemaining = 300;
  int _failedAttempts = 0;

  int get _attemptsRemaining => (5 - _failedAttempts).clamp(0, 5);

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _startTimer() {
    _timer?.cancel();
    _secondsRemaining = 300;
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      if (_secondsRemaining == 0) {
        timer.cancel();
      } else {
        setState(() => _secondsRemaining--);
      }
    });
  }

  Future<void> _verify() async {
    if (_code.length != 6) {
      return;
    }

    setState(() => _isLoading = true);
    try {
      await ref.read(authProvider.notifier).verify2FA(_code);
    } on AuthFailure catch (error) {
      if (!mounted) return;
      setState(() => _failedAttempts++);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _resendCode() async {
    setState(() => _isLoading = true);
    try {
      await AuthService.sendTwoFactorCode(widget.email);
      _startTimer();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('A new verification code has been sent.')),
      );
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final attemptsColor = _failedAttempts >= 2
        ? kColorWarning
        : kColorText.withValues(alpha: 0.72);

    return AuthCard(
      onBack: () => Navigator.of(context).pop(),
      backLabel: 'Back',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Two-Factor Authentication',
            textAlign: TextAlign.center,
            style: GoogleFonts.fraunces(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              color: kColorText,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Code sent to your phone',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const SizedBox(height: 4),
          Text(
            'Your verified security mobile',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: kColorText.withValues(alpha: 0.68),
                ),
          ),
          const SizedBox(height: 24),
          OtpInputField(
            autoFocus: true,
            onChanged: (value) => setState(() => _code = value),
            onComplete: (value) => setState(() => _code = value),
          ),
          const SizedBox(height: 18),
          Center(
            child: Text(
              formatCountdown(_secondsRemaining),
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          const SizedBox(height: 6),
          Center(
            child: TextButton(
              onPressed:
                  _secondsRemaining == 0 && !_isLoading ? _resendCode : null,
              child: const Text('Resend Code'),
            ),
          ),
          CheckboxListTile(
            value: _trustDevice,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: const Text('Trust this device for 30 days'),
            onChanged: (value) => setState(() => _trustDevice = value ?? false),
          ),
          const SizedBox(height: 8),
          ElevatedButton(
            onPressed: _code.length == 6 && !_isLoading ? _verify : null,
            child: _isLoading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      color: Colors.white,
                    ),
                  )
                : const Text('Verify'),
          ),
          const SizedBox(height: 12),
          Text(
            '$_attemptsRemaining attempts remaining',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: attemptsColor,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ],
      ),
    );
  }
}
