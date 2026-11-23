import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';

class UnsupportedRoleScreen extends ConsumerWidget {
  const UnsupportedRoleScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);

    return Scaffold(
      backgroundColor: kColorSurface,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const Icon(
                  Icons.block_outlined,
                  size: 96,
                  color: kColorWarning,
                ),
                const SizedBox(height: 24.0),
                Text(
                  'Unsupported Role',
                  style: GoogleFonts.fraunces(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: kColorText,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16.0),
                Text(
                  'This native app is intended for Teacher, Student, and Parent accounts only.\n'
                  'Branch Admin, Tenant Admin, and Janitor roles should use the web portal.',
                  style: GoogleFonts.roboto(
                    fontSize: 16,
                    height: 1.5,
                    color: kColorMutedText,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 32.0),
                if (authState.isAuthenticated) ...[
                  FilledButton.icon(
                    onPressed: () async {
                      await ref.read(authProvider.notifier).logout();
                    },
                    icon: const Icon(Icons.logout),
                    label: const Text('Sign Out'),
                    style: FilledButton.styleFrom(
                      backgroundColor: kColorError,
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(56),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8.0),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16.0),
                ],
                Text(
                  'Please use the web portal for administrative and operational roles.',
                  style: GoogleFonts.roboto(
                    fontSize: 12,
                    color: kColorMutedText,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
