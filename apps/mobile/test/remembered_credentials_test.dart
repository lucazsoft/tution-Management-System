import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/features/auth/data/remembered_credentials.dart';

void main() {
  test('securely remembers only the login identity and clears old passwords',
      () async {
    FlutterSecureStorage.setMockInitialValues({});
    final store = RememberedCredentialsStore();

    expect(await store.read(), isNull);
    await store.save('student@example.com');

    final restored = await store.read();
    expect(restored?.email, 'student@example.com');
    expect(
      (await const FlutterSecureStorage().readAll())
          .containsKey('remembered_login_password'),
      isFalse,
    );

    await store.clear();
    expect(await store.read(), isNull);
  });
}
