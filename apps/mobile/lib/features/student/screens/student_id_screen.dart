/// API-backed digital student ID screen (MOB-104).
///
/// Live scoped data from [StudentIdViewModel] (portal `studentProfile`);
/// status/expiry rules in [buildIdCard]. States: loading, error with retry,
/// denied (403), offline, and suspended-ID banner. The flip-card presentation
/// is kept; every field on it is server data — no mock profile, no invented
/// dates or contacts.
library;

import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/student_id_calendar_notifications_repository.dart';
import '../student_design.dart';
import '../viewmodels/student_id_viewmodel.dart';
import '../widgets/student_record_states.dart';
import '../widgets/student_scaffold.dart';

const kColorPrimary = StudentColors.primary;
const kColorAccent = StudentColors.accent;
const kColorSuccess = StudentColors.success;
const kColorSurface = StudentColors.surface;
const kColorText = StudentColors.text;

class StudentIdScreen extends ConsumerStatefulWidget {
  const StudentIdScreen({super.key});

  @override
  ConsumerState<StudentIdScreen> createState() => _StudentIdScreenState();
}

class _StudentIdScreenState extends ConsumerState<StudentIdScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _animation;
  bool _showFront = true;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _animation = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOutCubic),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _flipCard() {
    if (_showFront) {
      _controller.forward();
    } else {
      _controller.reverse();
    }
    setState(() {
      _showFront = !_showFront;
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(studentIdViewModelProvider);
    final viewModel = ref.read(studentIdViewModelProvider.notifier);

    return StudentScaffold(
      title: 'Digital student ID',
      selectedIndex: 4,
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (state.isLoading && !state.hasData) {
              return const StudentLoadingView(
                message: 'Loading your digital ID…',
              );
            }
            if (state.hasData) {
              return _buildCard(context, state.card!);
            }
            if (state.isDenied) {
              return StudentErrorView(
                icon: Icons.lock_outline_rounded,
                title: 'Access denied',
                message:
                    state.error ?? 'Your account cannot view this student ID.',
                retryLabel: 'Retry',
                onRetry: viewModel.load,
              );
            }
            if (state.isOffline) {
              return StudentErrorView(
                icon: Icons.wifi_off_rounded,
                title: 'You are offline',
                message: state.error ??
                    'Connect to the internet to load your digital ID.',
                retryLabel: 'Retry',
                onRetry: viewModel.load,
              );
            }
            return StudentErrorView(
              icon: Icons.badge_outlined,
              title: 'Could not load ID',
              message: state.error ?? 'Something went wrong.',
              retryLabel: 'Retry',
              onRetry: viewModel.load,
            );
          },
        ),
      ),
    );
  }

  Widget _buildCard(BuildContext context, StudentIdCard card) {
    final profile = card.profile;
    return RefreshIndicator(
      onRefresh: () => ref.read(studentIdViewModelProvider.notifier).refresh(),
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SizedBox(height: 12),
            if (card.isSuspended)
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: StudentColors.error.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(TmsRadius.r14),
                  border: Border.all(
                    color: StudentColors.error.withValues(alpha: 0.4),
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.block_rounded,
                      size: 20,
                      color: StudentColors.error,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        card.statusReason,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: StudentColors.error,
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                    ),
                  ],
                ),
              )
            else
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: kColorSuccess.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(TmsRadius.r20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.verified_rounded,
                      size: 18,
                      color: kColorSuccess,
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        card.statusReason,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: kColorSuccess,
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            GestureDetector(
              onTap: _flipCard,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: kColorPrimary.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(TmsRadius.r20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.flip_rounded,
                      size: 18,
                      color: kColorPrimary,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _showFront
                          ? 'Tap Card to Flip to Back Side'
                          : 'Tap Card to Flip to Front Side',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: kColorPrimary,
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            AnimatedBuilder(
              animation: _animation,
              builder: (context, child) {
                final transformAngle = _animation.value * pi;
                final isBackVisible = transformAngle >= pi / 2;

                return Transform(
                  transform: Matrix4.identity()
                    ..setEntry(3, 2, 0.001)
                    ..rotateY(transformAngle),
                  alignment: Alignment.center,
                  child: isBackVisible
                      ? Transform(
                          transform: Matrix4.identity()..rotateY(pi),
                          alignment: Alignment.center,
                          child: _buildBackCard(context, card),
                        )
                      : _buildFrontCard(context, card),
                );
              },
            ),
            const SizedBox(height: 28),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(50),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(TmsRadius.r14),
                      ),
                    ),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            'ID pass for ${profile.enrollmentId} is not available offline yet.',
                          ),
                        ),
                      );
                    },
                    icon: const Icon(Icons.wallet_rounded),
                    label: const Text('Add to Wallet'),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size.fromHeight(50),
                      backgroundColor: kColorAccent,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(TmsRadius.r14),
                      ),
                    ),
                    onPressed: _flipCard,
                    icon: const Icon(Icons.sync_rounded),
                    label: const Text('Flip ID Card'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFrontCard(BuildContext context, StudentIdCard card) {
    final profile = card.profile;
    return GestureDetector(
      onTap: _flipCard,
      child: Card(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(TmsRadius.r24),
          side: const BorderSide(color: Color(0xFFD7DFEA), width: 2),
        ),
        elevation: 6,
        shadowColor: kColorPrimary.withValues(alpha: 0.2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: const BoxDecoration(
                color: kColorPrimary,
                borderRadius:
                    BorderRadius.vertical(top: Radius.circular(TmsRadius.r22)),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.school_rounded,
                    color: Colors.white,
                    size: 28,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          profile.institution.isEmpty
                              ? 'TMS Academy'
                              : profile.institution,
                          style:
                              Theme.of(context).textTheme.titleMedium?.copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800,
                                  ),
                        ),
                        Text(
                          profile.branch,
                          style:
                              Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: Colors.white.withValues(alpha: 0.8),
                                  ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 50,
                    backgroundColor: kColorPrimary.withValues(alpha: 0.1),
                    child: Text(
                      profile.initials,
                      style:
                          Theme.of(context).textTheme.headlineMedium?.copyWith(
                                color: kColorPrimary,
                                fontWeight: FontWeight.w800,
                              ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    profile.name,
                    style: Theme.of(context)
                        .textTheme
                        .headlineMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${profile.grade} • Roll No: ${profile.rollNumber}',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          color: kColorPrimary,
                          fontWeight: FontWeight.w600,
                        ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 20),
                  _IdDetailRow(
                    label: 'Student ID',
                    value: profile.enrollmentId,
                  ),
                  const Divider(height: 16),
                  _IdDetailRow(
                    label: 'Academic Year',
                    value: profile.academicYear,
                  ),
                  const Divider(height: 16),
                  _IdDetailRow(
                    label: 'Valid',
                    value: card.validityLabel,
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          border: Border.all(color: Colors.black26),
                          borderRadius: BorderRadius.circular(TmsRadius.r10),
                        ),
                        child: const Icon(
                          Icons.qr_code_2_rounded,
                          size: 48,
                          color: kColorPrimary,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              card.isSuspended
                                  ? 'ENTRY SUSPENDED'
                                  : 'VERIFIED ENTRY PASS',
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: card.isSuspended
                                        ? StudentColors.error
                                        : kColorSuccess,
                                  ),
                            ),
                            Text(
                              profile.enrollmentId,
                              style: const TextStyle(
                                letterSpacing: 3,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBackCard(BuildContext context, StudentIdCard card) {
    final profile = card.profile;
    return GestureDetector(
      onTap: _flipCard,
      child: Card(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(TmsRadius.r24),
          side: const BorderSide(color: Color(0xFFD7DFEA), width: 2),
        ),
        elevation: 6,
        shadowColor: kColorPrimary.withValues(alpha: 0.2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: const BoxDecoration(
                color: kColorAccent,
                borderRadius:
                    BorderRadius.vertical(top: Radius.circular(TmsRadius.r22)),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.verified_user_rounded,
                    color: Colors.white,
                    size: 28,
                  ),
                  const SizedBox(width: 12),
                  Text(
                    'Enrollment & Status',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  _IdDetailRow(
                    label: 'Status',
                    value: card.isSuspended ? 'Suspended' : 'Active',
                  ),
                  const Divider(height: 18),
                  _IdDetailRow(
                    label: 'Authorized Branch',
                    value: profile.branch,
                  ),
                  const Divider(height: 18),
                  _IdDetailRow(
                    label: 'Dues pending',
                    value: profile.outstanding > 0
                        ? 'NPR ${profile.outstanding.toStringAsFixed(0)}'
                        : 'None',
                  ),
                  const Divider(height: 18),
                  _IdDetailRow(
                    label: 'Attendance',
                    value: profile.attendanceRate == null
                        ? 'Not recorded'
                        : '${profile.attendanceRate!.toStringAsFixed(0)}%',
                  ),
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: kColorSurface,
                      borderRadius: BorderRadius.circular(TmsRadius.r12),
                    ),
                    child: Text(
                      'Terms: This digital card is non-transferable and must be presented upon entering the campus or library. ${card.statusReason}',
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(fontSize: 11),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _IdDetailRow extends StatelessWidget {
  const _IdDetailRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: kColorText.withValues(alpha: 0.65),
              ),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: kColorText,
                ),
            textAlign: TextAlign.end,
          ),
        ),
      ],
    );
  }
}
