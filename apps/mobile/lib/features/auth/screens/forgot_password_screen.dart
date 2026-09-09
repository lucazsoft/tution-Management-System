import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/core/utils/formatters.dart';
import 'package:tms_mobile/core/utils/validators.dart';
import 'package:tms_mobile/features/auth/data/auth_service.dart';
import 'package:tms_mobile/features/auth/screens/reset_password_screen.dart';
import 'package:tms_mobile/features/auth/widgets/auth_card.dart';
import 'package:tms_mobile/features/auth/widgets/otp_input_field.dart';

enum _ForgotPasswordStep { email, otp }

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  Timer? _timer;

  _ForgotPasswordStep _step = _ForgotPasswordStep.email;
  bool _isLoading = false;
  String _otpCode = '';
  int _secondsRemaining = 300;

  @override
  void dispose() {
    _timer?.cancel();
    _emailController.dispose();
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
    setState(() {});
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _sendOtp() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() => _isLoading = true);
    try {
      await AuthService.sendPasswordOtp(_emailController.text);
      _startTimer();
      setState(() => _step = _ForgotPasswordStep.otp);
      _showMessage('OTP sent successfully.');
    } on AuthFailure catch (error) {
      _showMessage(error.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _verifyOtp() async {
    if (_otpCode.length != 6) {
      return;
    }

    setState(() => _isLoading = true);
    try {
      final resetToken = await AuthService.verifyPasswordOtp(
        email: _emailController.text,
        otp: _otpCode,
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => ResetPasswordScreen(
            email: _emailController.text.trim(),
            resetToken: resetToken,
          ),
        ),
      );
    } on AuthFailure catch (error) {
      _showMessage(error.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _resendOtp() async {
    setState(() => _isLoading = true);
    try {
      await AuthService.sendPasswordOtp(_emailController.text);
      _startTimer();
      _showMessage('A new OTP has been sent.');
    } on AuthFailure catch (error) {
      _showMessage(error.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthCard(
      onBack: () {
        if (_step == _ForgotPasswordStep.otp) {
          setState(() => _step = _ForgotPasswordStep.email);
          return;
        }
        Navigator.of(context).pop();
      },
      backLabel: 'Back to Sign In',
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 250),
        child: _step == _ForgotPasswordStep.email
            ? _buildEmailStep(context)
            : _buildOtpStep(context),
      ),
    );
  }

  Widget _buildEmailStep(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        key: const ValueKey('email-step'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Forgot Password?',
            textAlign: TextAlign.center,
            style: GoogleFonts.fraunces(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              color: kColorText,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Enter your login email. We’ll send a reset code by SMS to your verified security mobile.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: kColorText.withValues(alpha: 0.72),
                ),
          ),
          const SizedBox(height: 28),
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'Email',
              hintText: 'teacher@tms.edu.np',
            ),
            validator: AppValidators.validateEmail,
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: _isLoading ? null : _sendOtp,
            child: _isLoading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      color: Colors.white,
                    ),
                  )
                : const Text('Send OTP'),
          ),
        ],
      ),
    );
  }

  Widget _buildOtpStep(BuildContext context) {
    final canResend = _secondsRemaining == 0 && !_isLoading;
    return Column(
      key: const ValueKey('otp-step'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Verify OTP',
          textAlign: TextAlign.center,
          style: GoogleFonts.fraunces(
            fontSize: 26,
            fontWeight: FontWeight.w700,
            color: kColorText,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'If eligible, a code was sent to your verified security mobile.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 24),
        OtpInputField(
          autoFocus: true,
          onChanged: (value) => setState(() => _otpCode = value),
          onComplete: (value) => setState(() => _otpCode = value),
        ),
        const SizedBox(height: 20),
        Center(
          child: Text(
            formatCountdown(_secondsRemaining),
            style: Theme.of(context).textTheme.titleLarge,
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: TextButton(
            onPressed: canResend ? _resendOtp : null,
            child: const Text('Resend OTP'),
          ),
        ),
        const SizedBox(height: 12),
        ElevatedButton(
          onPressed: _otpCode.length == 6 && !_isLoading ? _verifyOtp : null,
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
      ],
    );
  }
}
