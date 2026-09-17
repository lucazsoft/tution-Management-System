import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/providers/feature_flags_provider.dart';
import 'package:tms_mobile/features/auth/data/auth_service.dart';
import 'package:tms_mobile/features/parent/data/parent_portal_repository.dart';
import 'package:tms_mobile/features/parent/models/parent_portal.dart';
import 'package:tms_mobile/features/parent/screens/parent_academics_screen.dart';
import 'package:tms_mobile/features/parent/screens/parent_attendance_screen.dart';
import 'package:tms_mobile/features/parent/screens/parent_fees_screen.dart';
import 'package:tms_mobile/features/parent/screens/parent_home_screen.dart';
import 'package:tms_mobile/features/parent/viewmodels/parent_portal_viewmodel.dart';

Map<String, dynamic> _portalJson({
  String selectedId = 'student-1',
  String selectedName = 'API Child One',
  String invoiceId = 'invoice-api',
}) =>
    {
      'bookingWindowHours': 36,
      'children': [
        {
          'id': 'student-1',
          'name': 'API Child One',
          'initials': 'AO',
          'grade': 'Grade 8',
          'branch': 'Baneshwor',
          'rollNumber': 'ABC123',
          'blocked': false,
          'attendanceRate': 80,
          'outstanding': 4250,
        },
        {
          'id': 'student-2',
          'name': 'API Child Two',
          'initials': 'AT',
          'grade': 'Grade 5',
          'branch': 'Lalitpur',
          'rollNumber': 'DEF456',
          'blocked': false,
          'attendanceRate': 100,
          'outstanding': 0,
        },
      ],
      'selected': {
        'id': selectedId,
        'name': selectedName,
        'initials': selectedId == 'student-1' ? 'AO' : 'AT',
        'grade': selectedId == 'student-1' ? 'Grade 8' : 'Grade 5',
        'branch': selectedId == 'student-1' ? 'Baneshwor' : 'Lalitpur',
        'rollNumber': selectedId == 'student-1' ? 'ABC123' : 'DEF456',
        'blocked': false,
        'attendanceRate': selectedId == 'student-1' ? 80 : 100,
        'outstanding': selectedId == 'student-1' ? 4250 : 0,
      },
      'sessions': [
        {
          'id': 'session-api',
          'time': '09:00',
          'endTime': '10:00',
          'subject': 'API Mathematics',
          'teacher': 'API Teacher',
          'room': 'API Room',
          'type': 'Regular',
        },
      ],
      'attendance': [
        {
          'id': 'attendance-1',
          'date': '6 Sep 2026',
          'subject': 'API Mathematics',
          'session': 'Morning API Class',
          'state': 'Present',
        },
        {
          'id': 'attendance-2',
          'date': '5 Sep 2026',
          'subject': 'API Science',
          'session': 'Afternoon API Class',
          'state': 'Absent (Excused)',
        },
      ],
      'invoices': [
        {
          'id': invoiceId,
          'cycle': 'September 2026',
          'dueDate': '20 Sep 2026',
          'state': 'Due soon',
          'reference': 'API-REF',
          'netPayable': 4250,
          'qrAvailable': true,
          'lines': [
            {'label': 'API tuition dues', 'amount': 4250},
          ],
        },
      ],
      'remarks': [
        {
          'id': 'remark-api',
          'subject': 'API Science',
          'author': 'API Teacher',
          'message': 'API progress remark',
          'date': '6 Sep 2026',
          'signal': 'Improving',
        },
      ],
      'leaves': const [],
      'events': const [],
      'notifications': const [],
    };

class _FakeParentPortalRepository extends ParentPortalRepository {
  _FakeParentPortalRepository() : super(dio: Dio());

  final List<String?> selectedIds = [];

  @override
  Future<ParentPortal> fetchPortal({
    String? studentId,
    CancelToken? cancelToken,
  }) async {
    selectedIds.add(studentId);
    await Future<void>.delayed(Duration.zero);
    return ParentPortal.fromJson(
      _portalJson(
        selectedId: studentId ?? 'student-1',
        selectedName:
            studentId == 'student-2' ? 'API Child Two' : 'API Child One',
      ),
    );
  }
}

class _PendingPortalRequest {
  _PendingPortalRequest(this.studentId, this.cancelToken);

  final String? studentId;
  final CancelToken? cancelToken;
  final Completer<ParentPortal> completer = Completer<ParentPortal>();
}

class _ControlledParentPortalRepository extends ParentPortalRepository {
  _ControlledParentPortalRepository() : super(dio: Dio());

  final List<_PendingPortalRequest> requests = [];

  @override
  Future<ParentPortal> fetchPortal({
    String? studentId,
    CancelToken? cancelToken,
  }) {
    final request = _PendingPortalRequest(studentId, cancelToken);
    requests.add(request);
    return request.completer.future;
  }

  void complete(int index, String selectedId) {
    completeWithBody(
      index,
      _portalJson(
        selectedId: selectedId,
        selectedName:
            selectedId == 'student-2' ? 'API Child Two' : 'API Child One',
      ),
    );
  }

  void completeWithBody(int index, Map<String, dynamic> body) {
    requests[index].completer.complete(ParentPortal.fromJson(body));
  }
}

class _TestAuthNotifier extends AuthNotifier {
  _TestAuthNotifier(AuthUser user) : super() {
    state = AuthState(user: user, isAuthenticated: true, isLoading: false);
  }

  void authenticate(AuthUser user) {
    state = AuthState(user: user, isAuthenticated: true, isLoading: false);
  }

  void logOutLocally() {
    state = const AuthState(isLoading: false);
  }
}

AuthUser _parentUser(String id) => AuthUser(
      id: id,
      email: '$id@example.test',
      firstName: 'Parent',
      lastName: id,
      role: 'PARENT',
      requiresTwoFactor: false,
    );

Future<_TestAuthNotifier> _settledAuth(String id) async {
  final auth = _TestAuthNotifier(_parentUser(id));
  await Future<void>.delayed(const Duration(milliseconds: 20));
  auth.authenticate(_parentUser(id));
  return auth;
}

Future<void> _pumpPortalScreen(
  WidgetTester tester,
  Widget screen,
  _FakeParentPortalRepository repository,
) async {
  SharedPreferences.setMockInitialValues({});
  tester.view.physicalSize = const Size(900, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        parentPortalProvider.overrideWith(
          (ref) => ParentPortalViewModel(repository: repository),
        ),
        featureFlagsProvider.overrideWith(
          (ref) => FeatureFlagsNotifier('PARENT'),
        ),
      ],
      child: MaterialApp(home: screen),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  group('ParentPortalRepository', () {
    test('sends authorized student selector and parses portal DTOs', () async {
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              expect(options.path, ParentPortalRepository.portalPath);
              expect(options.method, 'GET');
              expect(options.queryParameters, {'studentId': 'student-2'});
              handler.resolve(
                Response<dynamic>(
                  requestOptions: options,
                  statusCode: 200,
                  data: _portalJson(
                    selectedId: 'student-2',
                    selectedName: 'API Child Two',
                  ),
                ),
              );
            },
          ),
        ],
      );

      final portal = await ParentPortalRepository(dio: dio)
          .fetchPortal(studentId: 'student-2');

      expect(portal.selected?.id, 'student-2');
      expect(portal.children, hasLength(2));
      expect(portal.sessions.single.subject, 'API Mathematics');
      expect(portal.presentCount, 1);
      expect(portal.absentCount, 1);
      expect(portal.outstandingTotal, 4250);
      expect(portal.bookingWindowHours, 36);
    });

    test('out-of-order portal responses cannot overwrite the invoice cache',
        () async {
      final options = <RequestOptions>[];
      final handlers = <RequestInterceptorHandler>[];
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (requestOptions, handler) {
              options.add(requestOptions);
              handlers.add(handler);
            },
          ),
        ],
      );
      final repository = ParentPortalRepository(dio: dio);

      final older = repository.fetchPortal(studentId: 'student-1');
      final newer = repository.fetchPortal(studentId: 'student-2');
      await Future<void>.delayed(const Duration(milliseconds: 20));
      handlers[1].resolve(
        Response<dynamic>(
          requestOptions: options[1],
          statusCode: 200,
          data: _portalJson(
            selectedId: 'student-2',
            selectedName: 'API Child Two',
            invoiceId: 'newer-invoice',
          ),
        ),
      );
      await newer;
      handlers[0].resolve(
        Response<dynamic>(
          requestOptions: options[0],
          statusCode: 200,
          data: _portalJson(invoiceId: 'older-invoice'),
        ),
      );
      await older;

      expect(repository.invoiceDetail('newer-invoice').id, 'newer-invoice');
      expect(
        () => repository.invoiceDetail('older-invoice'),
        throwsA(isA<ApiException>()),
      );
    });

    test('response completing after repository disposal cannot restore cache',
        () async {
      late RequestOptions options;
      late RequestInterceptorHandler handler;
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (requestOptions, requestHandler) {
              options = requestOptions;
              handler = requestHandler;
            },
          ),
        ],
      );
      final repository = ParentPortalRepository(dio: dio);

      final pending = repository.fetchPortal();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      repository.dispose();
      handler.resolve(
        Response<dynamic>(
          requestOptions: options,
          statusCode: 200,
          data: _portalJson(invoiceId: 'disposed-invoice'),
        ),
      );
      await pending;

      expect(
        () => repository.invoiceDetail('disposed-invoice'),
        throwsA(isA<ApiException>()),
      );
    });
  });

  test('parent portal provider keeps child selection for the session',
      () async {
    final repository = _FakeParentPortalRepository();
    final container = ProviderContainer(
      overrides: [
        parentPortalProvider.overrideWith(
          (ref) => ParentPortalViewModel(repository: repository),
        ),
      ],
    );
    addTearDown(container.dispose);
    final subscription = container.listen(parentPortalProvider, (_, __) {});
    addTearDown(subscription.close);

    await Future<void>.delayed(const Duration(milliseconds: 20));
    await container
        .read(parentPortalProvider.notifier)
        .selectChild('student-2');

    expect(repository.selectedIds, [null, 'student-2']);
    expect(container.read(parentPortalProvider).selectedChildId, 'student-2');
    expect(
      container.read(parentPortalProvider).selectedChild?.name,
      'API Child Two',
    );
  });

  test('child switch clears old child-scoped snapshot while request is pending',
      () async {
    final repository = _ControlledParentPortalRepository();
    final viewModel = ParentPortalViewModel(repository: repository);
    addTearDown(viewModel.dispose);

    repository.complete(0, 'student-1');
    await Future<void>.delayed(Duration.zero);

    final switchFuture = viewModel.selectChild('student-2');

    expect(viewModel.state.selectedChildId, 'student-2');
    expect(viewModel.state.portal, isNull);
    expect(viewModel.state.selectedChild, isNull);

    repository.complete(1, 'student-2');
    await switchFuture;
  });

  test('newer child request wins when responses complete out of order',
      () async {
    final repository = _ControlledParentPortalRepository();
    final viewModel = ParentPortalViewModel(repository: repository);
    addTearDown(viewModel.dispose);

    final switchFuture = viewModel.selectChild('student-2');
    expect(repository.requests, hasLength(2));
    expect(repository.requests.first.cancelToken?.isCancelled, isTrue);

    repository.complete(1, 'student-2');
    await switchFuture;
    repository.complete(0, 'student-1');
    await Future<void>.delayed(Duration.zero);

    expect(viewModel.state.selectedChildId, 'student-2');
    expect(viewModel.state.portal?.selected?.id, 'student-2');
  });

  test('refresh supersedes an overlapping switch without leaving loading stuck',
      () async {
    final repository = _ControlledParentPortalRepository();
    final viewModel = ParentPortalViewModel(repository: repository);
    addTearDown(viewModel.dispose);

    final switchFuture = viewModel.selectChild('student-2');
    final refreshFuture = viewModel.refresh();
    expect(repository.requests, hasLength(3));
    expect(repository.requests[1].cancelToken?.isCancelled, isTrue);

    repository.complete(2, 'student-2');
    await refreshFuture;
    repository.complete(1, 'student-1');
    await switchFuture;
    repository.complete(0, 'student-1');
    await Future<void>.delayed(Duration.zero);

    expect(viewModel.state.isLoading, isFalse);
    expect(viewModel.state.isRefreshing, isFalse);
    expect(viewModel.state.selectedChildId, 'student-2');
    expect(viewModel.state.portal?.selected?.id, 'student-2');
  });

  test('refresh replaces stale linked-child attendance with API data',
      () async {
    final repository = _ControlledParentPortalRepository();
    final viewModel = ParentPortalViewModel(repository: repository);
    addTearDown(viewModel.dispose);

    final stale = _portalJson()
      ..['attendance'] = [
        {
          'id': 'old-attendance',
          'childId': 'student-1',
          'date': '14 Sep 2026',
          'subject': 'Tenant A Mathematics',
          'session': 'Class 10 Mathematics Updated',
          'state': 'Absent',
        },
      ];
    repository.completeWithBody(0, stale);
    await Future<void>.delayed(Duration.zero);
    expect(viewModel.state.portal?.attendance.single.id, 'old-attendance');
    expect(viewModel.state.portal?.absentCount, 1);

    final refreshFuture = viewModel.refresh();
    final fresh = _portalJson()
      ..['attendance'] = [
        {
          'id': 'live-attendance',
          'childId': 'student-1',
          'date': '15 Sep 2026',
          'subject': 'Tenant A Mathematics',
          'session': 'Class 10 Mathematics Updated',
          'state': 'Present',
        },
      ];
    repository.completeWithBody(1, fresh);
    await refreshFuture;

    expect(viewModel.state.portal?.attendance.single.id, 'live-attendance');
    expect(viewModel.state.portal?.attendance.single.isPresent, isTrue);
    expect(viewModel.state.portal?.presentCount, 1);
    expect(viewModel.state.portal?.absentCount, 0);
  });

  test('refresh adds newly enrolled linked-child session from API data',
      () async {
    final repository = _ControlledParentPortalRepository();
    final viewModel = ParentPortalViewModel(repository: repository);
    addTearDown(viewModel.dispose);

    final before = _portalJson()..['sessions'] = [];
    repository.completeWithBody(0, before);
    await Future<void>.delayed(Duration.zero);
    expect(viewModel.state.portal?.sessions, isEmpty);

    final refreshFuture = viewModel.refresh();
    final after = _portalJson()
      ..['sessions'] = [
        {
          'id': 'enrollment-class-0',
          'childId': 'student-1',
          'time': '16:30',
          'endTime': '17:30',
          'subject': 'Enrollment Sync Music',
          'teacher': 'Teacher Integration',
          'room': 'Enrollment Sync Music Class',
          'type': 'Music',
        },
      ];
    repository.completeWithBody(1, after);
    await refreshFuture;

    final session = viewModel.state.portal?.sessions.single;
    expect(session?.id, 'enrollment-class-0');
    expect(session?.subject, 'Enrollment Sync Music');
    expect(session?.teacher, 'Teacher Integration');
    expect(session?.time, '16:30');
    expect(session?.endTime, '17:30');
  });

  test('refresh removes dropped linked-child session from API data', () async {
    final repository = _ControlledParentPortalRepository();
    final viewModel = ParentPortalViewModel(repository: repository);
    addTearDown(viewModel.dispose);

    final before = _portalJson()
      ..['sessions'] = [
        {
          'id': 'enrollment-class-0',
          'childId': 'student-1',
          'time': '16:30',
          'endTime': '17:30',
          'subject': 'Enrollment Sync Music',
          'teacher': 'Teacher Integration',
          'room': 'Enrollment Sync Music Class',
          'type': 'Music',
        },
      ];
    repository.completeWithBody(0, before);
    await Future<void>.delayed(Duration.zero);
    expect(viewModel.state.portal?.sessions.single.subject,
        'Enrollment Sync Music');

    final refreshFuture = viewModel.refresh();
    final after = _portalJson()..['sessions'] = [];
    repository.completeWithBody(1, after);
    await refreshFuture;

    expect(viewModel.state.portal?.sessions, isEmpty);
  });

  test('refresh replaces a moved linked-child session with its destination',
      () async {
    final repository = _ControlledParentPortalRepository();
    final viewModel = ParentPortalViewModel(repository: repository);
    addTearDown(viewModel.dispose);

    final before = _portalJson()
      ..['sessions'] = [
        {
          'id': 'source-class-0',
          'childId': 'student-1',
          'time': '16:30',
          'endTime': '17:30',
          'subject': 'Enrollment Sync Music',
          'teacher': 'Teacher Integration',
          'room': 'Enrollment Sync Music Class',
          'type': 'Music',
        },
      ];
    repository.completeWithBody(0, before);
    await Future<void>.delayed(Duration.zero);
    expect(viewModel.state.portal?.sessions.single.id, 'source-class-0');

    final refreshFuture = viewModel.refresh();
    final after = _portalJson()
      ..['sessions'] = [
        {
          'id': 'destination-class-0',
          'childId': 'student-1',
          'time': '18:00',
          'endTime': '19:00',
          'subject': 'Enrollment Sync Music',
          'teacher': 'Teacher Integration',
          'room': 'Enrollment Sync Music Destination Class',
          'type': 'Music',
        },
      ];
    repository.completeWithBody(1, after);
    await refreshFuture;

    final session = viewModel.state.portal?.sessions.single;
    expect(session?.id, 'destination-class-0');
    expect(session?.room, 'Enrollment Sync Music Destination Class');
    expect(session?.time, '18:00');
    expect(session?.endTime, '19:00');
  });

  test('refresh reflects linked-child block, override, and paid invoice',
      () async {
    final repository = _ControlledParentPortalRepository();
    final viewModel = ParentPortalViewModel(repository: repository);
    addTearDown(viewModel.dispose);

    final blocked = _portalJson()
      ..['selected'] = {
        ..._portalJson()['selected'] as Map<String, dynamic>,
        'blocked': true,
        'outstanding': 2400,
      }
      ..['invoices'] = [
        {
          'id': 'fee-sync-invoice',
          'cycle': 'September 2026',
          'dueDate': '24 Sep 2026',
          'state': 'Upcoming',
          'reference': 'fee-sync-invoice',
          'netPayable': 2400,
          'qrAvailable': true,
        },
      ];
    repository.completeWithBody(0, blocked);
    await Future<void>.delayed(Duration.zero);
    expect(viewModel.state.portal?.selected?.blocked, isTrue);
    expect(viewModel.state.portal?.outstandingTotal, 2400);

    final overrideRefresh = viewModel.refresh();
    final overridden = _portalJson()
      ..['selected'] = {
        ..._portalJson()['selected'] as Map<String, dynamic>,
        'blocked': false,
        'outstanding': 2400,
      }
      ..['invoices'] = blocked['invoices'];
    repository.completeWithBody(1, overridden);
    await overrideRefresh;
    expect(viewModel.state.portal?.selected?.blocked, isFalse);
    expect(viewModel.state.portal?.outstandingTotal, 2400);

    final paymentRefresh = viewModel.refresh();
    final paid = _portalJson()
      ..['selected'] = {
        ..._portalJson()['selected'] as Map<String, dynamic>,
        'blocked': false,
        'outstanding': 0,
      }
      ..['invoices'] = [
        {
          'id': 'fee-sync-invoice',
          'cycle': 'September 2026',
          'dueDate': '24 Sep 2026',
          'state': 'Paid',
          'reference': 'FEE-SYNC-PAID-001',
          'netPayable': 2400,
          'qrAvailable': false,
        },
      ];
    repository.completeWithBody(2, paid);
    await paymentRefresh;
    expect(viewModel.state.portal?.outstandingTotal, 0);
    expect(viewModel.state.portal?.invoices.single.isPaid, isTrue);
  });

  test('refresh adds the linked-child published-performance signal', () async {
    final repository = _ControlledParentPortalRepository();
    final viewModel = ParentPortalViewModel(repository: repository);
    addTearDown(viewModel.dispose);

    final before = _portalJson()..['remarks'] = [];
    repository.completeWithBody(0, before);
    await Future<void>.delayed(Duration.zero);
    expect(viewModel.state.portal?.remarks, isEmpty);

    final refreshFuture = viewModel.refresh();
    final after = _portalJson()
      ..['remarks'] = [
        {
          'id': 'signal-Tenant A Mathematics',
          'subject': 'Tenant A Mathematics',
          'author': 'Performance system',
          'message': 'Current average 88% across 1 assessment.',
          'date': 'Calculated from published scores',
          'signal': 'Improving',
        },
      ];
    repository.completeWithBody(1, after);
    await refreshFuture;

    final remark = viewModel.state.portal?.remarks.single;
    expect(remark?.author, 'Performance system');
    expect(remark?.message, contains('88% across 1 assessment'));
    expect(remark?.signal, 'Improving');
  });

  test('logout and next login create an empty user-scoped portal repository',
      () async {
    SharedPreferences.setMockInitialValues({});
    final auth = await _settledAuth('parent-a');
    final repositories = <String, _ControlledParentPortalRepository>{};
    final container = ProviderContainer(
      overrides: [
        authProvider.overrideWith((ref) => auth),
        parentPortalRepositoryProvider.overrideWith((ref) {
          final userId = ref.watch(
            authProvider.select(
              (value) => value.isAuthenticated ? value.user?.id : null,
            ),
          );
          return repositories.putIfAbsent(
            userId ?? 'logged-out',
            _ControlledParentPortalRepository.new,
          );
        }),
      ],
    );
    addTearDown(container.dispose);
    final subscription = container.listen(parentPortalProvider, (_, __) {});
    addTearDown(subscription.close);

    repositories['parent-a']!.complete(0, 'student-1');
    await Future<void>.delayed(Duration.zero);
    expect(container.read(parentPortalProvider).portal, isNotNull);

    auth.logOutLocally();
    await Future<void>.delayed(Duration.zero);
    expect(container.read(parentPortalProvider).portal, isNull);

    auth.authenticate(_parentUser('parent-b'));
    await Future<void>.delayed(Duration.zero);
    expect(container.read(parentPortalProvider).portal, isNull);
    expect(repositories['parent-a'], isNot(same(repositories['parent-b'])));
    expect(
      () => repositories['parent-b']!.invoiceDetail('invoice-api'),
      throwsA(isA<ApiException>()),
    );
  });

  test('provider-container disposal cannot retain portal or invoice cache',
      () async {
    SharedPreferences.setMockInitialValues({});
    var repositoryCreations = 0;
    final repositories = <_ControlledParentPortalRepository>[];
    final authNotifiers = [
      await _settledAuth('parent-a'),
      await _settledAuth('parent-a'),
    ];

    ProviderContainer makeContainer() => ProviderContainer(
          overrides: [
            authProvider.overrideWith(
              (ref) => authNotifiers.removeAt(0),
            ),
            parentPortalRepositoryProvider.overrideWith((ref) {
              repositoryCreations++;
              final repository = _ControlledParentPortalRepository();
              repositories.add(repository);
              return repository;
            }),
          ],
        );

    final first = makeContainer();
    final firstSubscription = first.listen(parentPortalProvider, (_, __) {});
    repositories.single.complete(0, 'student-1');
    await Future<void>.delayed(Duration.zero);
    expect(first.read(parentPortalProvider).portal, isNotNull);
    firstSubscription.close();
    first.dispose();

    final second = makeContainer();
    addTearDown(second.dispose);
    final secondSubscription = second.listen(parentPortalProvider, (_, __) {});
    addTearDown(secondSubscription.close);
    await Future<void>.delayed(Duration.zero);

    expect(repositoryCreations, 2);
    expect(second.read(parentPortalProvider).portal, isNull);
    expect(
      () => repositories.last.invoiceDetail('invoice-api'),
      throwsA(isA<ApiException>()),
    );
  });

  testWidgets('home renders API data and switches by student id',
      (tester) async {
    final repository = _FakeParentPortalRepository();
    await _pumpPortalScreen(tester, const ParentHomeScreen(), repository);

    expect(find.text('API Child One'), findsWidgets);
    expect(find.text('80%'), findsOneWidget);
    expect(find.textContaining('4,250'), findsWidgets);
    expect(find.text('Aarav'), findsNothing);

    await tester.tap(find.text('API Child Two').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(repository.selectedIds.last, 'student-2');
    expect(find.text('100%'), findsOneWidget);
  });

  testWidgets('attendance renders API records without demo dates',
      (tester) async {
    await _pumpPortalScreen(
      tester,
      const ParentAttendanceScreen(),
      _FakeParentPortalRepository(),
    );

    expect(find.text('6 Sep 2026'), findsOneWidget);
    expect(find.textContaining('Morning API Class'), findsOneWidget);
    expect(find.text('Fri, Jul 18'), findsNothing);
  });

  testWidgets('fees renders API invoices without demo statements',
      (tester) async {
    await _pumpPortalScreen(
      tester,
      const ParentFeesScreen(),
      _FakeParentPortalRepository(),
    );

    expect(find.textContaining('September 2026'), findsWidgets);
    expect(find.textContaining('4,250'), findsWidgets);
    expect(find.textContaining('July 2026'), findsNothing);
  });

  testWidgets('academics renders API remarks without demo curriculum',
      (tester) async {
    await _pumpPortalScreen(
      tester,
      const ParentAcademicsScreen(),
      _FakeParentPortalRepository(),
    );

    expect(find.text('API progress remark'), findsOneWidget);
    expect(find.text('API Science'), findsWidgets);
    expect(find.text('Algebraic Expressions'), findsNothing);
  });
}
