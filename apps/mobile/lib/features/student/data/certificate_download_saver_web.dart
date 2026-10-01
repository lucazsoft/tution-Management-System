// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use

import 'dart:html' as html;
import 'dart:typed_data';

class CertificateDownloadResult {
  const CertificateDownloadResult(this.path);

  final String path;
}

Future<CertificateDownloadResult> saveCertificateDownload(
  List<int> bytes,
  String fileName, {
  String? directoryPath,
}) async {
  final blob =
      html.Blob(<Object>[Uint8List.fromList(bytes)], 'application/pdf');
  final url = html.Url.createObjectUrlFromBlob(blob);
  try {
    final anchor = html.AnchorElement(href: url)
      ..download = fileName
      ..style.display = 'none';
    html.document.body?.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    html.Url.revokeObjectUrl(url);
  }
  return CertificateDownloadResult('Downloads/$fileName');
}
