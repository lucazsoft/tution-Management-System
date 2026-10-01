import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class ForgotPasswordPrompt extends StatelessWidget {
  const ForgotPasswordPrompt({
    super.key,
    this.alignment = WrapAlignment.end,
    this.onReset,
  });

  final WrapAlignment alignment;
  final VoidCallback? onReset;

  @override
  Widget build(BuildContext context) => Align(
        alignment: switch (alignment) {
          WrapAlignment.start => Alignment.centerLeft,
          WrapAlignment.end => Alignment.centerRight,
          _ => Alignment.center,
        },
        child: TextButton(
          onPressed: onReset ?? () => context.push('/forgot-password'),
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: const Text('Forgot password?'),
        ),
      );
}
