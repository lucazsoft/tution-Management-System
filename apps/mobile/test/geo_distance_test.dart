// The Flutter Haversine must agree with the server's, which decides every
// attendance stamp. Reference values match
// services/api/src/routes/geo-attendance.test.ts.
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/features/teacher/viewmodels/geo_attendance_viewmodel.dart';

void main() {
  const branchLat = 27.7172; // Kathmandu
  const branchLng = 85.324;

  group('distanceMeters matches the server geofence maths', () {
    test('same point is zero', () {
      expect(distanceMeters(branchLat, branchLng, branchLat, branchLng), 0);
    });

    test('0.001 degree of latitude is about 111.19 m', () {
      expect(
        distanceMeters(branchLat, branchLng, branchLat + 0.001, branchLng),
        closeTo(111.19, 0.05),
      );
    });

    test('Kathmandu to Pokhara is about 142.4 km', () {
      expect(
        distanceMeters(branchLat, branchLng, 28.2096, 83.9856),
        closeTo(142394, 500),
      );
    });

    test('is symmetric and handles the antimeridian', () {
      expect(distanceMeters(1, 2, 3, 4), closeTo(distanceMeters(3, 4, 1, 2), 1e-9));
      expect(distanceMeters(0, 179.999, 0, -179.999), closeTo(222.39, 0.5));
    });
  });
}
