import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class RememberedCredentials {
  const RememberedCredentials(this.email);

  final String email;
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
    if (email == null || email.isEmpty) return null;
    // Remove credentials written by older builds. Remember-me intentionally
    // remembers identity only; a password must always be entered again.
    if (values.containsKey(_passwordKey)) {
      await _storage.delete(key: _passwordKey);
    }
    return RememberedCredentials(email);
  }

  Future<void> save(String email) async {
    await _storage.write(key: _emailKey, value: email);
    await _storage.delete(key: _passwordKey);
  }

  Future<void> clear() async {
    await _storage.delete(key: _emailKey);
    await _storage.delete(key: _passwordKey);
  }
}
