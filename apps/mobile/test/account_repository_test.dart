import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/features/auth/data/account_repository.dart';

void main() {
  test('name update succeeds from PATCH response without a second GET',
      () async {
    var getRequests = 0;
    late Map<String, dynamic> requestBody;
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))
      ..interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            if (options.method == 'GET') {
              getRequests++;
              return handler.reject(
                DioException(
                  requestOptions: options,
                  message: 'Profile reload should not be part of name update',
                ),
              );
            }
            requestBody = Map<String, dynamic>.from(options.data as Map);
            handler.resolve(
              Response<Map<String, dynamic>>(
                requestOptions: options,
                statusCode: 200,
                data: const {
                  'firstName': 'Updated',
                  'lastName': 'Parent',
                  'name': 'Updated Parent',
                },
              ),
            );
          },
        ),
      );

    final saved = await AccountRepository(dio: dio).updateName(
      '  Updated ',
      ' Parent  ',
    );

    expect(requestBody, {'firstName': 'Updated', 'lastName': 'Parent'});
    expect(saved.firstName, 'Updated');
    expect(saved.lastName, 'Parent');
    expect(getRequests, 0);
  });
}
