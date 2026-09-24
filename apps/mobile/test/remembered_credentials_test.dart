import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/features/auth/data/remembered_credentials.dart';

void main() {
  test('securely saves, restores and clears remembered login credentials',
      () async {
    FlutterSecureStorage.setMockInitialValues({});
    final store = RememberedCredentialsStore();

    expect(await store.read(), isNull);
    await store.save('student@example.com', 'safe-password');

    final restored = await store.read();
    expect(restored?.email, 'student@example.com');
    expect(restored?.password, 'safe-password');

    await store.clear();
    expect(await store.read(), isNull);
  });
}
