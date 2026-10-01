import 'package:dio/dio.dart';
import 'package:tms_mobile/core/network/api_client.dart';

class SchoolNotice {
  const SchoolNotice({
    required this.id,
    required this.title,
    required this.message,
    required this.audienceRoles,
    required this.createdAt,
    required this.authorName,
  });

  factory SchoolNotice.fromJson(Map<String, dynamic> json) {
    final author = json['author'];
    final authorMap = author is Map<String, dynamic> ? author : null;
    return SchoolNotice(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'School notice',
      message: json['message']?.toString() ?? '',
      audienceRoles: (json['audienceRoles'] is List)
          ? (json['audienceRoles'] as List).map((item) => '$item').toList()
          : const [],
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      authorName: authorMap == null
          ? 'School administration'
          : '${authorMap['firstName'] ?? ''} ${authorMap['lastName'] ?? ''}'
              .trim(),
    );
  }

  final String id;
  final String title;
  final String message;
  final List<String> audienceRoles;
  final DateTime createdAt;
  final String authorName;
}

class NoticeBoardRepository {
  NoticeBoardRepository({Dio? dio}) : _dio = dio ?? ApiClient.instance.dio;

  final Dio _dio;

  Future<List<SchoolNotice>> fetchNotices() async {
    final response = await _dio.get<dynamic>('/api/communication/broadcasts');
    final body = response.data;
    final rows = body is Map<String, dynamic> ? body['broadcasts'] : null;
    if (rows is! List) throw const FormatException('Invalid notice response.');
    return [
      for (final row in rows)
        if (row is Map<String, dynamic>) SchoolNotice.fromJson(row),
    ];
  }

  Future<void> publish({
    required String title,
    required String message,
    required List<String> audienceRoles,
  }) async {
    await _dio.post<dynamic>('/api/communication/broadcast', data: {
      'title': title.trim(),
      'message': message.trim(),
      'audienceRoles': audienceRoles,
    });
  }

  Future<void> delete(String id) async {
    await _dio.delete<dynamic>(
      '/api/communication/broadcast/${Uri.encodeComponent(id)}',
    );
  }
}
