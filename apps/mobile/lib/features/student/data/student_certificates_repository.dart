/// API-backed repository for student certificates.
///
/// Verified server contracts (read-only, services/api/src):
/// - List: `GET /api/users/me/student-portal` (auth) → `certificates[]`
///   (`id` = verification id, `title`, `course`, `issuedDate`, `fileName`,
///   `pdfUrl`)
/// - Download: `GET /api/certificates/:certificateId/download` (auth,
///   session cookie) → `application/pdf` bytes with
///   `Content-Disposition: attachment`
///
/// Missing on the server (typed [ApiException] + TODO, never demo data):
/// - TODO(api): no dedicated student certificate-list GET — the list is
///   sourced from the portal payload via [fetchCertificates].
library;

import 'dart:io';

import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/network/api_exception.dart';

/// Certificate entry from the portal payload.
class ApiStudentCertificate {
  const ApiStudentCertificate({
    required this.id,
    required this.title,
    required this.course,
    required this.issuedLabel,
    required this.fileName,
  });

  final String id;
  final String title;
  final String course;
  final String issuedLabel;
  final String fileName;

  factory ApiStudentCertificate.fromJson(Map<String, dynamic> json) =>
      ApiStudentCertificate(
        id: (json['id'] ?? '').toString(),
        title: (json['title'] ?? '').toString(),
        course: (json['course'] ?? '').toString(),
        issuedLabel: (json['issuedDate'] ?? '').toString(),
        fileName: (json['fileName'] ?? '').toString(),
      );
}

/// Max accepted certificate download size (10 MiB).
const kCertificateMaxBytes = 10 * 1024 * 1024;

/// Accepted MIME type for certificate downloads.
const kCertificateAllowedMime = 'application/pdf';

/// Sanitizes a server-provided certificate filename for local storage.
///
/// Strips path separators (traversal), keeps a safe charset, and enforces
/// a `.pdf` extension. Never returns a value containing `/` or `\`.
String sanitizeCertificateFileName(String raw, {String fallbackId = ''}) {
  var base = raw.split('/').last.split('\\').last.trim();
  base = base.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
  base = base.replaceAll(RegExp(r'_+'), '_');
  base = base.replaceAll(RegExp(r'^\.+'), '');
  if (base.isEmpty || base == '.pdf') {
    final safeId = fallbackId.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_').trim();
    base = '${safeId.isEmpty ? 'certificate' : safeId}.pdf';
  }
  if (!base.toLowerCase().endsWith('.pdf')) {
    final dot = base.lastIndexOf('.');
    final stem = dot > 0 ? base.substring(0, dot) : base;
    base = '$stem.pdf';
  }
  if (base.length > 100) {
    base = '${base.substring(0, 96)}.pdf';
  }
  return base;
}

/// Repository for the student certificate list + authenticated PDF download.
class StudentCertificatesRepository {
  StudentCertificatesRepository({Dio? dio, Directory? saveDir})
      : _dio = dio ?? ApiClient.instance.dio,
        _saveDir = saveDir;

  final Dio _dio;

  /// Test override for the download directory (avoids path_provider in
  /// unit tests).
  final Directory? _saveDir;

  /// Certificate list sourced from the student portal payload.
  ///
  /// TODO(api): replace with `GET /api/users/me/certificates` (or similar
  /// student-scoped list) when the server offers one.
  Future<List<ApiStudentCertificate>> fetchCertificates({
    CancelToken? cancelToken,
  }) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/users/me/student-portal',
        cancelToken: cancelToken,
      );
      final raw = (res.data?['certificates'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => ApiStudentCertificate.fromJson(
                Map<String, dynamic>.from(e),
              ))
          .toList();
      return raw;
    } on DioException catch (e) {
      throw ApiException.from(e);
    }
  }

  /// Downloads the certificate PDF with the authenticated session (the
  /// Better Auth cookie travels on [_dio]) and saves it to the temp
  /// directory. Returns the saved file so the UI can open/share the path.
  Future<File> downloadCertificate(
    ApiStudentCertificate certificate, {
    CancelToken? cancelToken,
    void Function(int received, int total)? onProgress,
  }) async {
    try {
      final res = await _dio.get<List<int>>(
        '/api/certificates/${Uri.encodeComponent(certificate.id)}/download',
        cancelToken: cancelToken,
        options: Options(responseType: ResponseType.bytes),
        onReceiveProgress: onProgress,
      );
      final bytes = res.data ?? const <int>[];
      if (bytes.isEmpty) {
        throw const ApiException(
          kind: ApiErrorKind.server,
          message: 'The certificate file came back empty. Try again.',
        );
      }
      final contentType =
          res.headers.value('content-type')?.toLowerCase() ?? '';
      if (contentType.isNotEmpty &&
          !contentType.contains(kCertificateAllowedMime)) {
        throw ApiException(
          kind: ApiErrorKind.server,
          message:
              'The certificate file came back as $contentType instead of a PDF.',
        );
      }
      if (bytes.length > kCertificateMaxBytes) {
        throw const ApiException(
          kind: ApiErrorKind.validation,
          message: 'The certificate file is too large to save.',
        );
      }
      final dir = _saveDir ?? await getTemporaryDirectory();
      final safeName = sanitizeCertificateFileName(
        certificate.fileName,
        fallbackId: certificate.id,
      );
      final file = File('${dir.path}/$safeName');
      try {
        await file.writeAsBytes(bytes, flush: true);
      } catch (_) {
        try {
          if (await file.exists()) await file.delete();
        } catch (_) {}
        rethrow;
      }
      return file;
    } on DioException catch (e) {
      throw ApiException.from(e);
    }
  }
}
