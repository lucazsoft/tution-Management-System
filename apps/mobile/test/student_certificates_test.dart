import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/features/student/data/student_certificates_repository.dart';
import 'package:tms_mobile/features/student/viewmodels/student_certificates_viewmodel.dart';

Dio stubCertDio({int? statusCode}) {
  return ApiClient.buildDio(
    baseUrl: 'https://test.invalid',
    extraInterceptors: [
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path == '/api/users/me/student-portal') {
            if (statusCode != null) {
              handler.reject(DioException(
                requestOptions: options,
                type: DioExceptionType.badResponse,
                response: Response<dynamic>(
                  requestOptions: options,
                  statusCode: statusCode,
                  data: {'error': 'denied'},
                ),
              ));
              return;
            }
            handler.resolve(Response<dynamic>(
              requestOptions: options,
              statusCode: 200,
              data: {
                'certificates': [
                  {
                    'id': 'CERT-2026-0192',
                    'title': 'Course Completion Certificate',
                    'course': 'Foundation Guitar',
                    'issuedDate': '24 Jul 2026',
                    'fileName': 'foundation-guitar-certificate.pdf',
                    'pdfUrl': '/certificates/CERT-2026-0192/download',
                  },
                ],
              },
            ));
            return;
          }
          if (options.path == '/api/certificates/CERT-2026-0192/download') {
            handler.resolve(Response<dynamic>(
              requestOptions: options,
              statusCode: 200,
              data: <int>[0x25, 0x50, 0x44, 0x46],
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
}

Dio stubDownloadDio({
  List<int>? bytes,
  Map<String, List<String>>? responseHeaders,
}) {
  return ApiClient.buildDio(
    baseUrl: 'https://test.invalid',
    extraInterceptors: [
      InterceptorsWrapper(
        onRequest: (options, handler) {
          handler.resolve(Response<dynamic>(
            requestOptions: options,
            statusCode: 200,
            data: bytes ?? <int>[0x25, 0x50, 0x44, 0x46],
            headers: Headers.fromMap(responseHeaders ?? const {}),
          ));
        },
      ),
    ],
  );
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

void main() {
  group('Student certificates repository', () {
    test('fetchCertificates parses the portal list', () async {
      final repo = StudentCertificatesRepository(dio: stubCertDio());
      final certs = await repo.fetchCertificates();

      expect(certs, hasLength(1));
      expect(certs.first.id, 'CERT-2026-0192');
      expect(certs.first.title, 'Course Completion Certificate');
      expect(certs.first.fileName, 'foundation-guitar-certificate.pdf');
    });

    test('downloadCertificate saves authenticated bytes to disk', () async {
      final dir = await Directory.systemTemp.createTemp('cert-test');
      addTearDown(() => dir.delete(recursive: true));
      final repo =
          StudentCertificatesRepository(dio: stubCertDio(), saveDir: dir);

      final file = await repo.downloadCertificate(
        const ApiStudentCertificate(
          id: 'CERT-2026-0192',
          title: 'Course Completion Certificate',
          course: 'Foundation Guitar',
          issuedLabel: '24 Jul 2026',
          fileName: 'foundation-guitar-certificate.pdf',
        ),
      );

      expect(await file.exists(), isTrue);
      expect((await file.readAsBytes()).length, greaterThan(0));
    });

    test('missing download throws notFound', () async {
      final dir = await Directory.systemTemp.createTemp('cert-test');
      addTearDown(() => dir.delete(recursive: true));
      final repo =
          StudentCertificatesRepository(dio: stubCertDio(), saveDir: dir);
      try {
        await repo.downloadCertificate(
          const ApiStudentCertificate(
            id: 'NOPE',
            title: 't',
            course: 'c',
            issuedLabel: '',
            fileName: 'x.pdf',
          ),
        );
        fail('expected ApiException');
      } on ApiException catch (e) {
        expect(e.kind, ApiErrorKind.notFound);
      }
    });

    test('traversal filename is sanitized inside the save dir', () async {
      final dir = await Directory.systemTemp.createTemp('cert-test');
      addTearDown(() => dir.delete(recursive: true));
      final repo =
          StudentCertificatesRepository(dio: stubDownloadDio(), saveDir: dir);

      final file = await repo.downloadCertificate(
        const ApiStudentCertificate(
          id: 'CERT-2026-0192',
          title: 't',
          course: 'c',
          issuedLabel: '',
          fileName: '../../etc/passwd',
        ),
      );

      expect(file.path.startsWith(dir.path), isTrue);
      final name = file.path.split(Platform.pathSeparator).last;
      expect(name.contains('/'), isFalse);
      expect(name.contains('\\'), isFalse);
      expect(name.endsWith('.pdf'), isTrue);
      expect(await file.exists(), isTrue);
    });

    test('non-pdf extension is coerced to pdf', () async {
      final dir = await Directory.systemTemp.createTemp('cert-test');
      addTearDown(() => dir.delete(recursive: true));
      final repo =
          StudentCertificatesRepository(dio: stubDownloadDio(), saveDir: dir);

      final file = await repo.downloadCertificate(
        const ApiStudentCertificate(
          id: 'CERT-2026-0192',
          title: 't',
          course: 'c',
          issuedLabel: '',
          fileName: 'evil.exe',
        ),
      );

      expect(file.path.endsWith('.pdf'), isTrue);
      expect(file.path.contains('evil.exe'), isFalse);
    });

    test('oversize download throws and writes nothing', () async {
      final dir = await Directory.systemTemp.createTemp('cert-test');
      addTearDown(() => dir.delete(recursive: true));
      final repo = StudentCertificatesRepository(
        dio: stubDownloadDio(
          bytes: List<int>.filled(kCertificateMaxBytes + 1, 0),
        ),
        saveDir: dir,
      );

      await expectLater(
        repo.downloadCertificate(
          const ApiStudentCertificate(
            id: 'CERT-2026-0192',
            title: 't',
            course: 'c',
            issuedLabel: '',
            fileName: 'big.pdf',
          ),
        ),
        throwsA(isA<ApiException>()),
      );
      expect(dir.listSync(), isEmpty);
    });

    test('wrong MIME type throws', () async {
      final dir = await Directory.systemTemp.createTemp('cert-test');
      addTearDown(() => dir.delete(recursive: true));
      final repo = StudentCertificatesRepository(
        dio: stubDownloadDio(
          responseHeaders: const {
            'content-type': ['text/html'],
          },
        ),
        saveDir: dir,
      );

      await expectLater(
        repo.downloadCertificate(
          const ApiStudentCertificate(
            id: 'CERT-2026-0192',
            title: 't',
            course: 'c',
            issuedLabel: '',
            fileName: 'cert.pdf',
          ),
        ),
        throwsA(isA<ApiException>()),
      );
      expect(dir.listSync(), isEmpty);
    });

    test('sanitize strips separators and keeps a safe charset', () {
      final name = sanitizeCertificateFileName(
        '../a/b\\evil file?.exe',
        fallbackId: 'CERT-1',
      );
      expect(name.contains('/'), isFalse);
      expect(name.contains('\\'), isFalse);
      expect(name.endsWith('.pdf'), isTrue);
      expect(RegExp(r'^[A-Za-z0-9._-]+\.pdf$').hasMatch(name), isTrue);
    });
  });

  group('Student certificates viewmodel', () {
    test('loads list; download records the saved file', () async {
      final dir = await Directory.systemTemp.createTemp('cert-vm');
      addTearDown(() => dir.delete(recursive: true));
      final vm = StudentCertificatesViewModel(
        repository:
            StudentCertificatesRepository(dio: stubCertDio(), saveDir: dir),
      );
      addTearDown(vm.dispose);
      await waitFor(() => !vm.state.isLoading);

      expect(vm.state.certificates, hasLength(1));
      expect(vm.state.isEmpty, isFalse);

      await vm.download(vm.state.certificates.first);
      expect(vm.state.downloadingId, isNull);
      expect(vm.state.savedFile, isNotNull);
      expect(vm.state.savedForId, 'CERT-2026-0192');
    });

    test('denied list surfaces isDenied', () async {
      final vm = StudentCertificatesViewModel(
        repository: StudentCertificatesRepository(
          dio: stubCertDio(statusCode: 403),
        ),
      );
      addTearDown(vm.dispose);
      await waitFor(() => !vm.state.isLoading);

      expect(vm.state.isDenied, isTrue);
      expect(vm.state.hasError, isTrue);
    });
  });
}
