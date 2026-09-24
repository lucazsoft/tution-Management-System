import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../student_design.dart';
import '../viewmodels/student_certificates_viewmodel.dart';
import '../widgets/student_scaffold.dart';

class StudentCertificatesScreen extends ConsumerWidget {
  const StudentCertificatesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(studentCertificatesViewModelProvider);
    final viewModel = ref.read(studentCertificatesViewModelProvider.notifier);

    if (state.isLoading && state.certificates.isEmpty) {
      return const StudentScaffold(
        title: 'Certificates',
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (state.isDenied && state.certificates.isEmpty) {
      return StudentScaffold(
        title: 'Certificates',
        body: _CertMessage(
          icon: Icons.lock_outline_rounded,
          title: 'Access Denied',
          message: state.error ?? 'You do not have access to certificates.',
          actionLabel: 'Retry',
          onAction: viewModel.refresh,
        ),
      );
    }

    if (state.isOffline && state.certificates.isEmpty) {
      return StudentScaffold(
        title: 'Certificates',
        body: _CertMessage(
          icon: Icons.wifi_off_rounded,
          title: 'You are offline',
          message: state.error ?? 'Check your connection and try again.',
          actionLabel: 'Retry',
          onAction: viewModel.refresh,
        ),
      );
    }

    if (state.error != null && state.certificates.isEmpty) {
      return StudentScaffold(
        title: 'Certificates',
        body: _CertMessage(
          icon: Icons.error_outline_rounded,
          title: 'Could not load certificates',
          message: state.error!,
          actionLabel: 'Retry',
          onAction: viewModel.refresh,
        ),
      );
    }

    if (state.isEmpty) {
      return StudentScaffold(
        title: 'Certificates',
        body: _CertMessage(
          icon: Icons.workspace_premium_outlined,
          title: 'No certificates yet',
          message: 'Issued certificates will appear here for download.',
          actionLabel: 'Refresh',
          onAction: viewModel.refresh,
        ),
      );
    }

    if (state.savedFile != null && state.savedForId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Saved to ${state.savedFile!.path}'),
            action: SnackBarAction(
              label: 'Dismiss',
              onPressed: viewModel.clearSaved,
            ),
          ),
        );
        viewModel.clearSaved();
      });
    }

    return StudentScaffold(
      title: 'Certificates',
      body: RefreshIndicator(
        onRefresh: viewModel.refresh,
        child: ListView(
          padding: const EdgeInsets.all(TmsSpace.md),
          children: [
            if (state.error != null) ...[
              Container(
                padding: const EdgeInsets.all(TmsSpace.sm),
                decoration: BoxDecoration(
                  color: StudentColors.error.withValues(alpha: .08),
                  borderRadius: BorderRadius.circular(TmsRadius.control),
                ),
                child: Row(
                  children: [
                    Expanded(child: Text(state.error!)),
                    IconButton(
                      icon: const Icon(Icons.refresh_rounded),
                      onPressed: viewModel.refresh,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: TmsSpace.md),
            ],
            Container(
              padding: const EdgeInsets.all(TmsSpace.md),
              decoration: BoxDecoration(
                color: StudentColors.success.withValues(alpha: .08),
                borderRadius: BorderRadius.circular(TmsRadius.card),
              ),
              child: const Row(
                children: [
                  Icon(Icons.verified_rounded, color: StudentColors.success),
                  SizedBox(width: TmsSpace.sm),
                  Expanded(
                    child: Text(
                      'Issued certificates stay in your history and can be downloaded anytime.',
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: TmsSpace.lg),
            for (final certificate in state.certificates) ...[
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(TmsSpace.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              color:
                                  StudentColors.primary.withValues(alpha: .08),
                              borderRadius: BorderRadius.circular(
                                TmsRadius.control,
                              ),
                            ),
                            child: const Icon(
                              Icons.workspace_premium_outlined,
                              color: StudentColors.primary,
                            ),
                          ),
                          const SizedBox(width: TmsSpace.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  certificate.title,
                                  style:
                                      Theme.of(context).textTheme.titleMedium,
                                ),
                                const SizedBox(height: TmsSpace.xxs),
                                Text(
                                  '${certificate.course}\nIssued ${certificate.issuedLabel}',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: TmsSpace.md),
                      const Divider(height: 1),
                      const SizedBox(height: TmsSpace.sm),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              certificate.id,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ),
                          if (state.downloadingId == certificate.id)
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    value: state.downloadProgress > 0
                                        ? state.downloadProgress
                                        : null,
                                    strokeWidth: 2,
                                  ),
                                ),
                                const SizedBox(width: TmsSpace.sm),
                                const Text('Downloading…'),
                              ],
                            )
                          else
                            TextButton.icon(
                              onPressed: () => viewModel.download(certificate),
                              icon: const Icon(Icons.download_rounded),
                              label: const Text('Download PDF'),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: TmsSpace.sm),
            ],
          ],
        ),
      ),
    );
  }
}

class _CertMessage extends StatelessWidget {
  const _CertMessage({
    required this.icon,
    required this.title,
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 64, color: StudentColors.mutedText),
            const SizedBox(height: 16),
            Text(title, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 24),
            FilledButton(onPressed: onAction, child: Text(actionLabel)),
          ],
        ),
      ),
    );
  }
}
