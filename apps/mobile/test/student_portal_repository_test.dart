import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/features/student/data/student_portal_repository.dart';
import 'package:tms_mobile/features/student/models/student_portal_models.dart';

/// Canned portal payload mirroring the backend
/// `GET /api/users/me/student-portal` shapes (see `services/api/src/routes/users.ts`).
Map<String, dynamic> portalJson() => {
      'generatedAt': '2026-09-06T00:00:00.000Z',
      'studentProfile': {
        'name': 'Aarav Sharma',
        'initials': 'AS',
        'institution': 'Test Academy',
        'grade': 'Grade 8',
        'branch': 'Baneshwor',
        'rollNumber': 'ABC123',
        'enrollmentId': 'student-1',
        'academicYear': '2026/27',
        'blocked': false,
        'outstanding': 4500,
        'attendanceRate': 75,
      },
      'todaySessions': [
        {
          'id': 'c1-0',
          'time': '07:00',
          'endTime': '08:00',
          'subject': 'Mathematics',
          'teacher': 'Ms. Riya Gurung',
          'room': 'Room 2A',
          'type': 'Regular',
        },
        {
          'id': 'c2-0',
          'time': '09:15',
          'endTime': '10:15',
          'subject': 'Guitar Fundamentals',
          'teacher': 'Mr. Aayush Rai',
          'room': 'Music Studio',
          'type': 'Music',
        },
      ],
      'weeklySessions': [
        {
          'id': 'c1-0',
          'day': 'Monday',
          'time': '07:00',
          'endTime': '08:00',
          'subject': 'Mathematics',
          'teacher': 'Ms. Riya Gurung',
          'room': 'Room 2A',
          'className': 'Grade 8 - Morning',
          'type': 'Regular',
        },
        {
          'id': 'c3-0',
          'day': 'Wed',
          'time': '15:30',
          'endTime': '16:30',
          'subject': 'Science Revision',
          'teacher': 'Ms. Nima Sherpa',
          'room': 'Lab 1',
          'className': 'Grade 8 - Evening',
          'type': 'Short-Term',
        },
      ],
      'homework': [
        {
          'id': 'hw-1',
          'subject': 'Mathematics',
          'title': 'Complete algebra worksheet 4',
          'teacher': 'Ms. Riya Gurung',
          'dueLabel': '7 Sep 2026',
          'urgency': 'soon',
          'completed': false,
        },
      ],
      'results': [
        {
          'id': 'r1',
          'subject': 'Mathematics',
          'assessment': 'Algebra Unit Test',
          'score': 44,
          'maximum': 50,
          'publishedLabel': 'Shared 5 Sep 2026',
        },
      ],
      'insights': [
        {'subject': 'Mathematics', 'average': 86, 'previousAverage': 78},
      ],
      'invoices': [
        {
          'id': 'inv-1',
          'cycle': 'August 2026',
          'dueDate': '1 Aug 2026',
          'state': 'Overdue',
          'qrAvailable': true,
          'paymentReference': 'TMS-AUG-0812',
          'netPayable': 4500,
          'lines': [
            {'label': 'Tuition dues', 'amount': 4700},
            {'label': 'Discount', 'amount': -300},
            {'label': 'Fine', 'amount': 100},
          ],
        },
      ],
      'events': [
        {
          'id': 'e1',
          'date': '10 Sep 2026',
          'day': '10',
          'month': 'SEP',
          'title': 'Unit test week',
          'kind': 'Exam',
          'details': 'Starts Monday',
        },
      ],
      'certificates': [
        {
          'id': 'cert-1',
          'title': 'Math Olympiad',
          'course': 'Grade 8',
          'issuedDate': '1 Aug 2026',
          'fileName': 'cert-1.pdf',
        },
      ],
      'notifications': [
        {
          'id': 'n1',
          'title': 'Fee overdue',
          'message': 'NPR 4,500 is due.',
          'time': '5 Sep 2026',
          'destination': '/student/fees',
          'unread': true,
        },
        {
          'id': 'n2',
          'title': 'Homework assigned',
          'message': 'English homework due.',
          'time': '4 Sep 2026',
          'destination': '/student/homework',
          'unread': false,
        },
      ],
    };

void main() {
  group('StudentPortalRepository.fetchPortal', () {
    test('parses profile, sessions, course types and aggregates', () async {
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              expect(options.path, StudentPortalRepository.portalPath);
              expect(options.method, 'GET');
              handler.resolve(Response<dynamic>(
                requestOptions: options,
                statusCode: 200,
                data: portalJson(),
              ));
            },
          ),
        ],
      );
      final repository = StudentPortalRepository(dio: dio);

      final portal = await repository.fetchPortal();

      expect(portal.profile.name, 'Aarav Sharma');
      expect(portal.profile.grade, 'Grade 8');
      expect(portal.profile.outstanding, 4500);
      expect(portal.profile.attendanceRate, 75);

      expect(portal.todaySessions, hasLength(2));
      expect(portal.todaySessions[0].type, StudentCourseType.regular);
      expect(portal.todaySessions[1].type, StudentCourseType.music);
      expect(portal.todaySessions[1].typeLabel, 'Music');

      // Weekly grouping ordered Monday -> Wednesday, short-term mapped.
      final days = portal.weeklyByDay;
      expect(days.map((day) => day.key), ['mon', 'wed']);
      expect(days.first.label, 'Monday');
      expect(days[1].sessions.single.type, StudentCourseType.shortTerm);

      expect(portal.pendingHomework, hasLength(1));
      expect(portal.results.first.percentage, 88);
      expect(portal.insights.single.trend, 'Improving');
      expect(portal.overdueAmount, 4500);
      expect(portal.unreadCount, 1);
      expect(portal.events.single.title, 'Unit test week');
      expect(portal.certificates.single.fileName, 'cert-1.pdf');
    });

    test('maps 403 to a typed forbidden ApiException', () async {
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              handler.reject(
                DioException(
                  requestOptions: options,
                  type: DioExceptionType.badResponse,
                  response: Response<dynamic>(
                    requestOptions: options,
                    statusCode: 403,
                    data: {'error': 'You cannot view this portal.'},
                  ),
                ),
              );
            },
          ),
        ],
      );
      final repository = StudentPortalRepository(dio: dio);

      expect(
        repository.fetchPortal(),
        throwsA(isA<ApiException>().having(
          (error) => error.kind,
          'kind',
          ApiErrorKind.forbidden,
        )),
      );
    });

    test('throws typed ApiException on unexpected response shape', () async {
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              handler.resolve(Response<dynamic>(
                requestOptions: options,
                statusCode: 200,
                data: ['not', 'a', 'map'],
              ));
            },
          ),
        ],
      );
      final repository = StudentPortalRepository(dio: dio);

      expect(
        repository.fetchPortal(),
        throwsA(isA<ApiException>()),
      );
    });
  });

  group('StudentPortalRepository.fetchStudentTimetable', () {
    test('parses raw class schedules and normalises slots', () async {
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              expect(
                options.path,
                StudentPortalRepository.timetablePath('student-1'),
              );
              handler.resolve(Response<dynamic>(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'timetable': [
                    {
                      'classId': 'class-a',
                      'className': 'Grade 8 - Morning',
                      'courseId': 'course-a',
                      'schedule': [
                        {'day': 'Mon', 'start': '09:00', 'end': '10:00'},
                        {'day': 'Wed', 'start': '09:00', 'end': '10:00'},
                      ],
                    },
                  ],
                },
              ));
            },
          ),
        ],
      );
      final repository = StudentPortalRepository(dio: dio);

      final classes = await repository.fetchStudentTimetable('student-1');
      expect(classes, hasLength(1));
      final sessions = classes.single.toPortalSessions();
      expect(sessions, hasLength(2));
      expect(sessions.first.subject, 'Grade 8 - Morning');
      expect(sessions.first.dayGroupKey, 'mon');
    });
  });

  group('course-type parsing', () {
    test('maps backend labels including hyphenated variants', () async {
      final body = portalJson();
      final sessions = body['todaySessions'] as List;
      body['todaySessions'] = [
        ...sessions,
        {
          'id': 'x1',
          'time': '11:00',
          'endTime': '12:00',
          'subject': 'Crash Course',
          'teacher': 'T',
          'room': 'R',
          'type': 'Long-Term',
        },
        {
          'id': 'x2',
          'time': '12:00',
          'endTime': '13:00',
          'subject': '1:1 Session',
          'teacher': 'T',
          'room': 'R',
          'type': 'Personalized',
        },
        {
          'id': 'x3',
          'time': '13:00',
          'endTime': '14:00',
          'subject': 'Mystery',
          'teacher': 'T',
          'room': 'R',
          'type': 'Something-New',
        },
      ];
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              handler.resolve(Response<dynamic>(
                requestOptions: options,
                statusCode: 200,
                data: body,
              ));
            },
          ),
        ],
      );

      final portal = await StudentPortalRepository(dio: dio).fetchPortal();
      final types =
          portal.todaySessions.map((session) => session.type).toList();
      expect(types, contains(StudentCourseType.longTerm));
      expect(types, contains(StudentCourseType.personalized));
      // Unknown labels degrade to regular instead of throwing.
      expect(types.last, StudentCourseType.regular);
    });
  });
}
