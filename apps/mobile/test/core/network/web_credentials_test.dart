@TestOn('browser')
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/network/api_client.dart';

void main() {
  test('web API client sends and receives Better Auth cookies', () {
    final dio = ApiClient.buildDio(baseUrl: 'https://api.example.test');
    final adapter = dio.httpClientAdapter as dynamic;

    expect(
      adapter.withCredentials,
      isTrue,
      reason: 'Cross-origin Better Auth sessions require credentialed XHR.',
    );
  });
}
