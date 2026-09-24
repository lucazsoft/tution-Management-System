import 'dart:io';

import 'package:path_provider/path_provider.dart';

class CertificateDownloadResult {
  const CertificateDownloadResult(this.path);

  final String path;
}

Future<CertificateDownloadResult> saveCertificateDownload(
  List<int> bytes,
  String fileName, {
  String? directoryPath,
}) async {
  final directory = directoryPath == null
      ? await getTemporaryDirectory()
      : Directory(directoryPath);
  final file = File('${directory.path}${Platform.pathSeparator}$fileName');
  try {
    await file.writeAsBytes(bytes, flush: true);
  } catch (_) {
    try {
      if (await file.exists()) await file.delete();
    } catch (_) {}
    rethrow;
  }
  return CertificateDownloadResult(file.path);
}
