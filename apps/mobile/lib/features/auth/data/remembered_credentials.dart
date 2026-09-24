import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class RememberedCredentials {
  const RememberedCredentials(this.email, this.password);

  final String email;
  final String password;
}

class RememberedCredentialsStore {
  RememberedCredentialsStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _emailKey = 'remembered_login_email';
  static const _passwordKey = 'remembered_login_password';
  final FlutterSecureStorage _storage;

  Future<RememberedCredentials?> read() async {
    final values = await _storage.readAll();
    final email = values[_emailKey];
    final password = values[_passwordKey];
    if (email == null || email.isEmpty || password == null) return null;
    return RememberedCredentials(email, password);
  }

  Future<void> save(String email, String password) async {
    await _storage.write(key: _emailKey, value: email);
    await _storage.write(key: _passwordKey, value: password);
  }

  Future<void> clear() async {
    await _storage.delete(key: _emailKey);
    await _storage.delete(key: _passwordKey);
  }
}
