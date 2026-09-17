import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/features/student/data/student_fees_models.dart';
import 'package:tms_mobile/features/student/data/student_fees_repository.dart';
import 'package:tms_mobile/features/student/viewmodels/student_fees_viewmodel.dart';

Map<String, dynamic> portalPayload() => {
      'studentProfile': {
        'blocked': true,
        'outstanding': 4500,
        'enrollmentId': 'stu-1',
      },
      'invoices': [
        {
          'id': 'inv-aug',
          'cycle': 'August 2026',
          'dueDate': '1 Aug 2026',
          'state': 'Overdue',
          'qrAvailable': true,
          'paymentReference': 'inv-aug',
          'netPayable': 4500,
          'lines': [
            {'label': 'Tuition dues', 'amount': 4700},
            {'label': 'Discount', 'amount': -200},
          ],
        },
        {
          'id': 'inv-jul',
          'cycle': 'July 2026',
          'dueDate': '1 Jul 2026',
          'state': 'Paid',
          'qrAvailable': false,
          'paymentReference': 'txn-1',
          'netPayable': 3800,
          'lines': [
            {'label': 'Tuition dues', 'amount': 3800},
          ],
        },
      ],
    };

Dio stubFeesDio({
  Map<String, dynamic>? portal,
  Map<String, dynamic>? status,
  int? statusCode,
  Map<String, dynamic>? statusBody,
}) {
  final dio = ApiClient.buildDio(
    baseUrl: 'https://test.invalid',
    extraInterceptors: [
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path == '/api/users/me/student-portal') {
            handler.resolve(Response<dynamic>(
              requestOptions: options,
              statusCode: 200,
              data: portal ?? portalPayload(),
            ));
            return;
          }
          if (options.path == '/api/finances/students/stu-1/invoices') {
            handler.resolve(Response<dynamic>(
              requestOptions: options,
              statusCode: 200,
              data: {
                'invoices': [
                  {
                    'id': 'inv-aug',
                    'status': 'PAID',
                    'overdue': false,
                    'dueDate': '2026-08-01T00:00:00.000Z',
                    'billingCycleStart': '2026-08-01T00:00:00.000Z',
                    'amount': 4700,
                    'discount': 200,
                    'fine': 0,
                    'netPayable': 4500,
                    'invoiceType': 'TUITION',
                  },
                ],
              },
            ));
            return;
          }
          if (options.path == '/api/finances/nepalpay-qr/inv-aug') {
            handler.resolve(Response<dynamic>(
              requestOptions: options,
              statusCode: 200,
              data: {
                'invoiceId': 'inv-aug',
                'amount': 4500,
                'currency': 'NPR',
                'merchantName': 'TMS Tuition Management System',
                'qrString': '00020101021226580012np.nepalpay',
              },
            ));
            return;
          }
          if (options.path == '/api/finances/connectips/initiate/inv-aug') {
            handler.resolve(Response<dynamic>(
              requestOptions: options,
              statusCode: 201,
              data: {
                'payment': {
                  'txnId': 'TXN123',
                  'invoiceId': 'inv-aug',
                  'amountPaisa': '450000',
                  'status': 'PENDING',
                },
                'gatewayUrl': 'https://gateway.test/pay',
                'fields': {'TXNID': 'TXN123', 'TXNAMT': '450000'},
              },
            ));
            return;
          }
          if (options.path == '/api/finances/connectips/status/TXN123') {
            if (statusCode != null) {
              handler.reject(DioException(
                requestOptions: options,
                type: DioExceptionType.badResponse,
                response: Response<dynamic>(
                  requestOptions: options,
                  statusCode: statusCode,
                  data: statusBody ?? {'error': 'boom'},
                ),
              ));
              return;
            }
            handler.resolve(Response<dynamic>(
              requestOptions: options,
              statusCode: 200,
              data: status ??
                  {
                    'txnId': 'TXN123',
                    'invoiceId': 'inv-aug',
                    'status': 'SUCCESS',
                  },
            ));
            return;
          }
          handler.reject(DioException(
            requestOptions: options,
            type: DioExceptionType.badResponse,
            response: Response<dynamic>(
              requestOptions: options,
              statusCode: 404,
              data: {'error': 'not stubbed: ${options.path}'},
            ),
          ));
        },
      ),
    ],
  );
  return dio;
}

Future<void> waitFor(
  bool Function() done, {
  Duration timeout = const Duration(seconds: 5),
}) async {
  final end = DateTime.now().add(timeout);
  while (!done()) {
    if (DateTime.now().isAfter(end)) {
      throw StateError('Timed out waiting for condition.');
    }
    await Future<void>.delayed(const Duration(milliseconds: 10));
  }
}

class _SequencedFeesRepository extends StudentFeesRepository {
  _SequencedFeesRepository(this.snapshots) : super(dio: Dio());

  final List<({List<ApiStudentInvoice> invoices, FeeBlockedStatus blocked})>
      snapshots;
  var calls = 0;

  @override
  Future<({List<ApiStudentInvoice> invoices, FeeBlockedStatus blocked})>
      fetchPortal({CancelToken? cancelToken}) async {
    final index = calls < snapshots.length ? calls : snapshots.length - 1;
    calls++;
    return snapshots[index];
  }
}

({List<ApiStudentInvoice> invoices, FeeBlockedStatus blocked}) feeSnapshot({
  required bool blocked,
  required double outstanding,
  required ApiFeeState state,
}) =>
    (
      invoices: [
        ApiStudentInvoice(
          id: 'fee-sync-invoice',
          cycle: 'September 2026',
          dueDate: DateTime(2026, 9, 24),
          dueDateLabel: '24 Sep 2026',
          state: state,
          netPayable: 2400,
          paymentReference: state == ApiFeeState.paid
              ? 'FEE-SYNC-PAID-001'
              : 'fee-sync-invoice',
          lines: const [ApiInvoiceLine(label: 'Tuition', amount: 2400)],
        ),
      ],
      blocked: FeeBlockedStatus(blocked: blocked, outstanding: outstanding),
    );

void main() {
  group('Student fees repository', () {
    test('fetchPortal parses invoices + blocked status', () async {
      final repo = StudentFeesRepository(dio: stubFeesDio());
      final result = await repo.fetchPortal();

      expect(result.invoices, hasLength(2));
      expect(result.invoices.first.id, 'inv-aug');
      expect(result.invoices.first.state, ApiFeeState.overdue);
      expect(result.invoices.first.netPayable, 4500);
      expect(result.blocked.blocked, isTrue);
      expect(result.blocked.outstanding, 4500);
    });

    test('invoiceDetail resolves from cache; missing throws notFound',
        () async {
      final repo = StudentFeesRepository(dio: stubFeesDio());
      await repo.fetchPortal();

      expect(repo.invoiceDetail('inv-jul').state, ApiFeeState.paid);
      expect(
        () => repo.invoiceDetail('nope'),
        throwsA(isA<ApiException>().having(
          (e) => e.kind,
          'kind',
          ApiErrorKind.notFound,
        )),
      );
    });

    test('fetchNepalPayQr returns payload', () async {
      final repo = StudentFeesRepository(dio: stubFeesDio());
      final qr = await repo.fetchNepalPayQr('inv-aug');

      expect(qr.qrString, contains('nepalpay'));
      expect(qr.amount, 4500);
    });

    test('403 maps to forbidden (denied)', () async {
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              handler.reject(DioException(
                requestOptions: options,
                type: DioExceptionType.badResponse,
                response: Response<dynamic>(
                  requestOptions: options,
                  statusCode: 403,
                  data: {'error': 'You do not have access to fee records.'},
                ),
              ));
            },
          ),
        ],
      );
      final repo = StudentFeesRepository(dio: dio);
      try {
        await repo.fetchPortal();
        fail('expected ApiException');
      } on ApiException catch (e) {
        expect(e.kind, ApiErrorKind.forbidden);
      }
    });
  });

  group('Student fees viewmodel', () {
    test('redirect alone never marks success; verify confirms via server',
        () async {
      final vm = StudentFeesViewModel(
        repository: StudentFeesRepository(dio: stubFeesDio()),
      );
      addTearDown(vm.dispose);
      await waitFor(() => !vm.state.isLoading);

      await vm.startPayment();
      // Handoff is exposed but the outcome stays pending: the redirect
      // alone is never trusted.
      expect(vm.state.handoff?.txnId, 'TXN123');
      expect(vm.state.paymentOutcome, PaymentOutcome.pending);

      await vm.confirmReturn('TXN123');
      expect(vm.state.paymentOutcome, PaymentOutcome.success);
      expect(vm.state.verifiedTxnId, 'TXN123');
      // Server-verified return refreshes the invoice list.
      expect(
        vm.state.invoices.firstWhere((i) => i.id == 'inv-aug').state,
        ApiFeeState.paid,
      );
    });

    test('non-SUCCESS verification keeps outcome failed, never paid', () async {
      final vm = StudentFeesViewModel(
        repository: StudentFeesRepository(
          dio: stubFeesDio(status: {
            'txnId': 'TXN123',
            'invoiceId': 'inv-aug',
            'status': 'FAILED',
          }),
        ),
      );
      addTearDown(vm.dispose);
      await waitFor(() => !vm.state.isLoading);

      await vm.startPayment();
      await vm.confirmReturn('TXN123');
      expect(vm.state.paymentOutcome, PaymentOutcome.failed);
      expect(
        vm.state.invoices.firstWhere((i) => i.id == 'inv-aug').state,
        ApiFeeState.overdue,
      );
    });

    test('denied portal surfaces isDenied', () async {
      final dio = ApiClient.buildDio(
        baseUrl: 'https://test.invalid',
        extraInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) {
              handler.reject(DioException(
                requestOptions: options,
                type: DioExceptionType.badResponse,
                response: Response<dynamic>(
                  requestOptions: options,
                  statusCode: 403,
                  data: {'error': 'denied'},
                ),
              ));
            },
          ),
        ],
      );
      final vm = StudentFeesViewModel(
        repository: StudentFeesRepository(dio: dio),
      );
      addTearDown(vm.dispose);
      await waitFor(() => !vm.state.isLoading);

      expect(vm.state.isDenied, isTrue);
      expect(vm.state.hasError, isTrue);
    });

    test('refresh reflects block, override, and paid invoice snapshots',
        () async {
      final vm = StudentFeesViewModel(
        repository: _SequencedFeesRepository([
          feeSnapshot(
            blocked: true,
            outstanding: 2400,
            state: ApiFeeState.upcoming,
          ),
          feeSnapshot(
            blocked: false,
            outstanding: 2400,
            state: ApiFeeState.upcoming,
          ),
          feeSnapshot(
            blocked: false,
            outstanding: 0,
            state: ApiFeeState.paid,
          ),
        ]),
      );
      addTearDown(vm.dispose);
      await waitFor(() => !vm.state.isLoading);

      expect(vm.state.blocked, isTrue);
      expect(vm.state.outstanding, 2400);
      expect(vm.state.invoices.single.state, ApiFeeState.upcoming);

      await vm.refresh();
      expect(vm.state.blocked, isFalse);
      expect(vm.state.outstanding, 2400);
      expect(vm.state.invoices.single.state, ApiFeeState.upcoming);

      await vm.refresh();
      expect(vm.state.blocked, isFalse);
      expect(vm.state.outstanding, 0);
      expect(vm.state.invoices.single.state, ApiFeeState.paid);
    });
  });
}
