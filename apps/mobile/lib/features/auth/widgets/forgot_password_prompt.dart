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
  Widget build(BuildContext context) => Wrap(
        alignment: alignment,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 2,
        children: [
          Text(
            'Did you forget your password?',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          TextButton(
            onPressed: onReset ?? () => context.push('/forgot-password'),
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: const Text('Reset here'),
          ),
        ],
      );
}
