/// API-backed geo-attendance screen.
///
/// Radius gating here is UX-only (button enablement + distance readout).
/// Records are created by `POST /api/attendance/in|out`, where the server
/// re-validates GPS accuracy, the branch geofence and pending daily updates
/// and is authoritative - client coordinates are never trusted for records.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/features/teacher/data/teacher_portal_repository.dart';
import 'package:tms_mobile/features/teacher/models/teacher_models.dart';
import 'package:tms_mobile/features/teacher/viewmodels/geo_attendance_viewmodel.dart';
import 'package:tms_mobile/features/teacher/widgets/geo_radius_card.dart';
import 'package:tms_mobile/features/teacher/widgets/geo_status_indicator.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_record_states.dart';

class GeoAttendanceScreen extends ConsumerStatefulWidget {
  const GeoAttendanceScreen({
    super.key,
    required this.session,
    this.branchId,
    this.branchRadiusMeters,
    this.branchLatitude,
    this.branchLongitude,
  });

  final TeacherClassSession session;

  /// Branch geofence from the workspace payload. When null, marking is
  /// disabled with a configuration error (no demo coordinates invented).
  final String? branchId;
  final double? branchRadiusMeters;
  final double? branchLatitude;
  final double? branchLongitude;

  @override
  ConsumerState<GeoAttendanceScreen> createState() =>
      _GeoAttendanceScreenState();
}

class _GeoAttendanceScreenState extends ConsumerState<GeoAttendanceScreen> {
  late final StateNotifierProvider<GeoAttendanceViewModel, GeoAttendanceState>
      _vmProvider;
  StreamSubscription<Position>? _positionSubscription;
  bool _vmReady = false;

  @override
  void initState() {
    super.initState();
    final branchId = widget.branchId;
    if (branchId != null) {
      _vmProvider =
          StateNotifierProvider<GeoAttendanceViewModel, GeoAttendanceState>(
              (ref) {
        return GeoAttendanceViewModel(
          repository: TeacherPortalRepository(),
          branchId: branchId,
          branchLatitude: widget.branchLatitude,
          branchLongitude: widget.branchLongitude,
          branchRadiusMeters: widget.branchRadiusMeters ?? 100,
        );
      });
      _vmReady = true;
      _initialiseLocation();
    }
  }

  @override
  void dispose() {
    _positionSubscription?.cancel();
    super.dispose();
  }

  Future<void> _initialiseLocation() async {
    final vm = ref.read(_vmProvider.notifier);
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      vm.setLocationUnavailable();
      return;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      vm.setLocationUnavailable(
        permissionDenied: permission == LocationPermission.deniedForever,
      );
      return;
    }
    try {
      final current = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.best,
      );
      vm.updatePosition(
        latitude: current.latitude,
        longitude: current.longitude,
        gpsAccuracy: current.accuracy,
      );
    } catch (_) {
      vm.setLocationUnavailable();
      return;
    }
    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.best,
        distanceFilter: 10,
      ),
    ).listen(
      (position) => ref.read(_vmProvider.notifier).updatePosition(
            latitude: position.latitude,
            longitude: position.longitude,
            gpsAccuracy: position.accuracy,
          ),
      onError: (_) => ref.read(_vmProvider.notifier).setLocationUnavailable(),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_vmReady) {
      return Scaffold(
        appBar: AppBar(title: const Text('Geo Attendance')),
        body: const TeacherDeniedView(
          message:
              'No branch is linked to this class, so attendance cannot be marked. Open it from Today with workspace data.',
        ),
      );
    }
    final state = ref.watch(_vmProvider);
    final vm = ref.read(_vmProvider.notifier);
    final radiusNote = vm.insideRadiusOrUnknown;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Geo Attendance',
          style:
              GoogleFonts.fraunces(fontWeight: FontWeight.w700, fontSize: 22),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(widget.session.subject,
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text('${widget.session.branch} - ${widget.session.room}'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            GeoStatusIndicator(
              status: _fenceStatus(state, radiusNote),
              lastCheckedAt: state.hasFix ? DateTime.now() : null,
            ),
            const SizedBox(height: 12),
            GeoRadiusCard(
              distanceMeters: state.distanceMeters,
              radiusMeters: vm.branchRadiusMeters,
              insideRadius: radiusNote,
              gpsAccuracy: state.gpsAccuracy,
            ),
            if (state.locationUnavailable)
              const TeacherEmptyView(
                icon: Icons.location_off_outlined,
                title: 'Location unavailable',
                message:
                    'Enable location services and grant permission to mark attendance.',
              ),
            if (state.permissionDenied)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: OutlinedButton.icon(
                  onPressed: Geolocator.openAppSettings,
                  icon: const Icon(Icons.settings_outlined),
                  label: const Text('Open app settings'),
                ),
              ),
            if (state.error != null) ...[
              const SizedBox(height: 12),
              TeacherErrorView(
                message: state.error!,
                onRetry: () => _initialiseLocation(),
              ),
            ],
            if (state.isOffline && state.error != null)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: TeacherOfflineBar(),
              ),
            if (state.lastResult != null) ...[
              const SizedBox(height: 12),
              Card(
                color: Colors.green.withValues(alpha: 0.12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      const Icon(Icons.check_circle, color: Colors.green),
                      const SizedBox(width: 8),
                      Expanded(child: Text(state.lastResult!)),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: vm.canMark && !state.isMarking
                        ? () => vm.markIn()
                        : null,
                    icon: state.isMarking
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.login_rounded),
                    label: const Text('Mark IN'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: vm.canMark && !state.isMarking
                        ? () => vm.markOut()
                        : null,
                    icon: const Icon(Icons.logout_rounded),
                    label: const Text('Mark OUT'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              radiusNote == null
                  ? 'Branch center is not shared with the app - your position is sent and the server verifies the geofence.'
                  : radiusNote
                      ? 'Inside the branch radius - ready to mark.'
                      : 'Outside the branch radius - move closer to mark.',
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  GeoFenceStatus _fenceStatus(GeoAttendanceState state, bool? radiusNote) {
    if (state.locationUnavailable || !state.hasFix) {
      return GeoFenceStatus.unavailable;
    }
    if (radiusNote == null) return GeoFenceStatus.checking;
    return radiusNote ? GeoFenceStatus.inside : GeoFenceStatus.outside;
  }
}
