// MOB-102 tests: student academics repository + viewmodel.
//
// All transports are stubbed via [ApiClient.buildDio] interceptor
// overrides — no network, no platform plugins.
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/network/pagination.dart';
import 'package:tms_mobile/features/student/data/student_academics_repository.dart';
import 'package:tms_mobile/features/student/models/student_academics_api.dart';
import 'package:tms_mobile/features/student/viewmodels/student_academics_viewmodel.dart';

Map<String, dynamic> portalJson({int homeworkCount = 12}) {
  return {
    'studentProfile': {
      'enrollmentId': 'stu-1',
      'attendanceCounts': {'present': 2, 'absent': 1, 'excused': 1},
    },
    'results': [
      {
        'id': 'r1',
        'subject': 'Mathematics',
        'assessment': 'Algebra Unit Test',
        'score': 44,
        'maximum': 50,
        'publishedLabel': 'Shared 01 Sep 2026',
      },
      {
        'id': 'r2',
        'subject': 'Science',
        'assessment': 'Biology Quiz',
        'score': 31,
        'maximum': 50,
      },
    ],
    'homework': [
      for (var i = 0; i < homeworkCount; i++)
        {
          'id': 'hw-$i',
          'subject': 'Mathematics',
          'title': 'Task $i',
          'teacher': 'Ms. Riya Gurung',
          'dueLabel': '02 Sep 2026',
          'urgency': i == 0 ? 'overdue' : 'normal',
          'completed': i == 1,
        },
    ],
    'insights': [
      {
        'subject': 'Mathematics',
        'average': 86,
        'previousAverage': 78,
        'history': [78, 86],
      },
    ],
    'syllabi': [
      {
        'id': 'sy-1',
        'subject': 'Mathematics',
        'className': 'Class 7-A',
        'chapters': [
          {
            'id': 'ch-1',
            'title': 'Linear equations',
            'topics': [
              {'title': 'Solving equations'},
              {'title': 'Graphing lines'},
            ],
          },
        ],
      },
    ],
    'attendance': [
      {
        'id': 'a1',
        'date': '01 Sep 2026',
        'subject': 'Mathematics',
        'session': 'Class 7-A',
        'state': 'Present',
      },
      {
        'id': 'a2',
        'date': '02 Sep 2026',
        'subject': 'Science',
        'session': 'Class 7-A',
        'state': 'Absent (Excused)',
      },
    ],
    'notifications': [
      {
        'id': 'leave-1',
        'title': 'Leave approved',
        'message': '02 Sep 2026: Family event approved.',
        'time': '01 Sep 2026',
      },
      {
        'id': 'invoice-9',
        'title': 'Fee due soon',
        'message': 'NPR 4,500 is due.',
        'time': '01 Sep 2026',
      },
    ],
  };
}

Dio stubPortal({Map<String, dynamic>? body, int statusCode = 200}) {
  return ApiClient.buildDio(
    baseUrl: 'https://test.invalid',
    extraInterceptors: [
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path.endsWith('/api/users/me/student-portal')) {
            handler.resolve(Response<dynamic>(
              requestOptions: options,
              statusCode: statusCode,
              data: body ?? portalJson(),
            ));
            return;
          }
          if (options.path.contains('/api/performance/student/')) {
            handler.resolve(Response<dynamic>(
              requestOptions: options,
              statusCode: 200,
              data: {
                'scores': [
                  {
                    'id': 'r1',
                    'subject': 'Mathematics',
                    'assessment': 'Algebra Unit Test',
                    'score': 44,
                    'maximum': 50,
                  },
                ],
                'insights': [
                  {
                    'subject': 'Mathematics',
                    'history': [78, 86],
                    'average': 82,
                  },
                ],
                'remarks': [
                  {'subject': 'Mathematics', 'message': 'Keep it up.'},
                ],
              },
            ));
            return;
          }
          if (options.path.contains('/api/homework/')) {
            handler.resolve(Response<dynamic>(
              requestOptions: options,
              statusCode: 200,
              data: {
                'homework': [
                  {
                    'id': 'hw-c1',
                    'subject': 'Science',
                    'title': 'Label the diagram',
                    'deadline': '2026-09-10',
                    'class': {
                      'assignedTeacher': {
                        'firstName': 'Nima',
                        'lastName': 'Sherpa',
                      },
                    },
                  },
                ],
              },
            ));
            return;
          }
          handler.next(options);
        },
      ),
    ],
  );
}

class _SequencedAcademicsRepository extends StudentAcademicsRepository {
  _SequencedAcademicsRepository(this.snapshots) : super(dio: Dio());

  final List<StudentPortalSnapshot> snapshots;
  var calls = 0;

  @override
  Future<StudentPortalSnapshot> fetchPortal({CancelToken? cancelToken}) async {
    final index = calls < snapshots.length ? calls : snapshots.length - 1;
    calls++;
    return snapshots[index];
  }
}

Dio stubFailure(int statusCode, [dynamic data]) {
  return ApiClient.buildDio(
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
                statusCode: statusCode,
                data: data ?? {'error': 'Nope.'},
              ),
            ),
          );
        },
      ),
    ],
  );
}

void main() {
  group('StudentAcademicsRepository', () {
    test('parses the portal snapshot for the signed-in student', () async {
      final repo = StudentAcademicsRepository(dio: stubPortal());
      final snapshot = await repo.fetchPortal();

      expect(snapshot.enrollmentId, 'stu-1');
      expect(snapshot.results, hasLength(2));
      expect(snapshot.results.first.percentage, 88);
      expect(snapshot.homework, hasLength(12));
      expect(snapshot.homework.first.isOverdue, isTrue);
      expect(snapshot.insights.single.trend, 'Improving');
      expect(snapshot.syllabi.single.topicCount, 2);
      expect(snapshot.attendance.last.isExcused, isTrue);
      // Only leave notifications become explanations; invoice notes do not.
      expect(snapshot.leaveExplanations, hasLength(1));
      expect(snapshot.leaveExplanations.single.isApproved, isTrue);
      expect(snapshot.attendanceRate, 0.5);
    });

    test('fetches performance detail for the snapshot enrollment id', () async {
      final repo = StudentAcademicsRepository(dio: stubPortal());
      final detail = await repo.fetchPerformance('stu-1');

      expect(detail.scores, hasLength(1));
      expect(detail.insights.single.history, [78, 86]);
      expect(detail.remarks.single.message, 'Keep it up.');
    });

    test('rejects an empty student id instead of calling the API', () async {
      final repo = StudentAcademicsRepository(dio: stubPortal());
      expect(
        () => repo.fetchPerformance(''),
        throwsA(isA<ApiException>()),
      );
    });

    test('pages class homework into PagedResult windows', () async {
      final repo = StudentAcademicsRepository(dio: stubPortal());
      final page = await repo.classHomework(
        'class-1',
        const PagedQuery(page: 1, limit: 20),
      );

      expect(page.items.single.subject, 'Science');
      expect(page.items.single.teacher, 'Nima Sherpa');
      expect(page.hasMore, isFalse);
    });

    test('slices portal lists into pages', () {
      final repo = StudentAcademicsRepository(dio: stubPortal());
      final all = List.generate(
        25,
        (i) => AcademicResult(
          id: 'r$i',
          subject: 'Math',
          assessment: 'Test $i',
          score: 40,
          maximum: 50,
        ),
      );

      final first = repo.slicePage(all, const PagedQuery(page: 1, limit: 10));
      expect(first.items, hasLength(10));
      expect(first.hasMore, isTrue);
      expect(first.total, 25);

      final last = repo.slicePage(all, const PagedQuery(page: 3, limit: 10));
      expect(last.items, hasLength(5));
      expect(last.hasMore, isFalse);
    });

    test('maps 403 to a forbidden ApiException', () async {
      final repo = StudentAcademicsRepository(dio: stubFailure(403));
      try {
        await repo.fetchPortal();
        fail('expected ApiException');
      } on ApiException catch (e) {
        expect(e.kind, ApiErrorKind.forbidden);
      }
    });
  });

  group('StudentAcademicsViewModel', () {
    test('loads data and paginates results/homework', () async {
      final container = ProviderContainer(
        overrides: [
          studentAcademicsViewModelProvider.overrideWith(
            (ref) => StudentAcademicsViewModel(
              repository: StudentAcademicsRepository(dio: stubPortal()),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      final viewModel =
          container.read(studentAcademicsViewModelProvider.notifier);
      await viewModel.load();

      var state = container.read(studentAcademicsViewModelProvider);
      expect(state.hasData, isTrue);
      expect(state.error, isNull);
      expect(state.pagedHomework, hasLength(10));
      expect(state.hasMoreHomework, isTrue);

      viewModel.loadMoreHomework();
      state = container.read(studentAcademicsViewModelProvider);
      expect(state.pagedHomework, hasLength(12));
      expect(state.hasMoreHomework, isFalse);
    });

    test('refresh adds newly created homework from the portal snapshot',
        () async {
      final before = portalJson(homeworkCount: 0);
      final after = portalJson(homeworkCount: 0)
        ..['homework'] = [
          {
            'id': 'homework-created-1',
            'subject': 'Mathematics',
            'title': 'Authorization exercise',
            'teacher': 'Teacher Integration',
            'dueLabel': '18 Sep 2026',
            'urgency': 'soon',
            'completed': false,
            'description': 'Complete the assigned practice.',
          },
        ];
      final viewModel = StudentAcademicsViewModel(
        repository: _SequencedAcademicsRepository([
          StudentPortalSnapshot.fromJson(before),
          StudentPortalSnapshot.fromJson(after),
        ]),
      );

      await viewModel.load();
      expect(viewModel.state.homework, isEmpty);

      await viewModel.refresh();

      final homework = viewModel.state.homework.single;
      expect(homework.id, 'homework-created-1');
      expect(homework.title, 'Authorization exercise');
      expect(homework.teacher, 'Teacher Integration');
      expect(homework.completed, isFalse);
    });

    test('refresh adds a newly published result from the portal snapshot',
        () async {
      final before = portalJson()..['results'] = [];
      final after = portalJson()
        ..['results'] = [
          {
            'id': 'published-result-1',
            'subject': 'Tenant A Mathematics',
            'assessment': 'Portal Integration Assessment',
            'score': 44,
            'maximum': 50,
            'publishedLabel': 'Shared 17 Sep 2026',
          },
        ];
      final viewModel = StudentAcademicsViewModel(
        repository: _SequencedAcademicsRepository([
          StudentPortalSnapshot.fromJson(before),
          StudentPortalSnapshot.fromJson(after),
        ]),
      );

      await viewModel.load();
      expect(viewModel.state.results, isEmpty);

      await viewModel.refresh();

      final result = viewModel.state.results.single;
      expect(result.id, 'published-result-1');
      expect(result.assessment, 'Portal Integration Assessment');
      expect(result.score, 44);
      expect(result.maximum, 50);
    });

    test('flags offline on connection errors', () async {
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              handler.reject(
                DioException(
                  requestOptions: options,
                  type: DioExceptionType.connectionError,
                ),
              );
            },
          ),
        ],
      );
      final container = ProviderContainer(
        overrides: [
          studentAcademicsViewModelProvider.overrideWith(
            (ref) => StudentAcademicsViewModel(
              repository: StudentAcademicsRepository(dio: dio),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      await container.read(studentAcademicsViewModelProvider.notifier).load();
      final state = container.read(studentAcademicsViewModelProvider);
      expect(state.offline, isTrue);
      expect(state.hasData, isFalse);
    });

    test('flags denied on 403', () async {
      final container = ProviderContainer(
        overrides: [
          studentAcademicsViewModelProvider.overrideWith(
            (ref) => StudentAcademicsViewModel(
              repository: StudentAcademicsRepository(dio: stubFailure(403)),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      await container.read(studentAcademicsViewModelProvider.notifier).load();
      final state = container.read(studentAcademicsViewModelProvider);
      expect(state.accessDenied, isTrue);
    });

    test('loads performance detail for the snapshot enrollment', () async {
      final container = ProviderContainer(
        overrides: [
          studentAcademicsViewModelProvider.overrideWith(
            (ref) => StudentAcademicsViewModel(
              repository: StudentAcademicsRepository(dio: stubPortal()),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      final viewModel =
          container.read(studentAcademicsViewModelProvider.notifier);
      await viewModel.load();
      await viewModel.loadDetail();

      final state = container.read(studentAcademicsViewModelProvider);
      expect(state.detail, isNotNull);
      expect(state.detail!.remarks.single.subject, 'Mathematics');
    });
  });
}
