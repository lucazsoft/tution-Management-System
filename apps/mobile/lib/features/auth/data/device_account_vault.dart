import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:tms_mobile/features/auth/data/auth_service.dart';

class DeviceAccount {
  const DeviceAccount({
    required this.userId,
    required this.email,
    required this.name,
    required this.role,
    required this.password,
    required this.mpinSalt,
    required this.mpinHash,
    this.failedAttempts = 0,
    this.lockedUntilEpochMs,
  });

  factory DeviceAccount.fromJson(Map<String, dynamic> json) => DeviceAccount(
        userId: json['userId'] as String,
        email: json['email'] as String,
        name: json['name'] as String,
        role: json['role'] as String,
        password: json['password'] as String,
        mpinSalt: json['mpinSalt'] as String,
        mpinHash: json['mpinHash'] as String,
        failedAttempts: json['failedAttempts'] as int? ?? 0,
        lockedUntilEpochMs: json['lockedUntilEpochMs'] as int?,
      );

  final String userId;
  final String email;
  final String name;
  final String role;
  final String password;
  final String mpinSalt;
  final String mpinHash;
  final int failedAttempts;
  final int? lockedUntilEpochMs;

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'email': email,
        'name': name,
        'role': role,
        'password': password,
        'mpinSalt': mpinSalt,
        'mpinHash': mpinHash,
        'failedAttempts': failedAttempts,
        'lockedUntilEpochMs': lockedUntilEpochMs,
      };

  DeviceAccount withFailures(int attempts, int? lockedUntil) => DeviceAccount(
        userId: userId,
        email: email,
        name: name,
        role: role,
        password: password,
        mpinSalt: mpinSalt,
        mpinHash: mpinHash,
        failedAttempts: attempts,
        lockedUntilEpochMs: lockedUntil,
      );
}

/// Returns saved accounts with the active account pinned to the first row.
/// The relative order of every other account is preserved.
List<DeviceAccount> orderDeviceAccountsForDisplay(
  Iterable<DeviceAccount> accounts,
  String? currentUserId,
) {
  final saved = accounts.toList(growable: false);
  if (currentUserId == null) return saved;

  final currentIndex =
      saved.indexWhere((account) => account.userId == currentUserId);
  if (currentIndex <= 0) return saved;

  return [
    saved[currentIndex],
    for (var index = 0; index < saved.length; index++)
      if (index != currentIndex) saved[index],
  ];
}

class MpinVerification {
  const MpinVerification._(this.allowed, this.message);
  const MpinVerification.allowed() : this._(true, null);
  const MpinVerification.denied(String message) : this._(false, message);
  final bool allowed;
  final String? message;
}

class DeviceAccountVault {
  DeviceAccountVault({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'tms_device_accounts_v1';
  static const _pendingKey = 'tms_pending_device_account_v1';
  static const _maxAttempts = 5;
  final FlutterSecureStorage _storage;

  Future<List<DeviceAccount>> accounts() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return const [];
    try {
      final decoded = jsonDecode(raw) as List;
      return decoded
          .whereType<Map>()
          .map(
              (item) => DeviceAccount.fromJson(Map<String, dynamic>.from(item)))
          .toList(growable: false);
    } catch (_) {
      return const [];
    }
  }

  Future<void> saveAccount({
    required AuthUser user,
    required String password,
    required String mpin,
  }) async {
    _validateMpin(mpin);
    final salt = _newSalt();
    final record = DeviceAccount(
      userId: user.id,
      email: user.email.toLowerCase(),
      name: user.name,
      role: user.role,
      password: password,
      mpinSalt: salt,
      mpinHash: _hashMpin(mpin, salt),
    );
    final current = (await accounts()).toList();
    current.removeWhere(
        (item) => item.userId == user.id || item.email == record.email);
    current.add(record);
    await _write(current);
  }

  Future<void> savePendingEnrollment({
    required String email,
    required String password,
    required String mpin,
  }) async {
    _validateMpin(mpin);
    await _storage.write(
      key: _pendingKey,
      value: jsonEncode(
          {'email': email.toLowerCase(), 'password': password, 'mpin': mpin}),
    );
  }

  Future<void> completePendingEnrollment(AuthUser user) async {
    final raw = await _storage.read(key: _pendingKey);
    if (raw == null) return;
    try {
      final pending = jsonDecode(raw) as Map<String, dynamic>;
      if ((pending['email'] as String?)?.toLowerCase() ==
          user.email.toLowerCase()) {
        await saveAccount(
          user: user,
          password: pending['password'] as String,
          mpin: pending['mpin'] as String,
        );
      }
    } finally {
      await _storage.delete(key: _pendingKey);
    }
  }

  Future<MpinVerification> verifyMpin(String userId, String mpin) async {
    final current = (await accounts()).toList();
    final index = current.indexWhere((item) => item.userId == userId);
    if (index < 0) {
      return const MpinVerification.denied('Account not found on this device.');
    }
    final account = current[index];
    final now = DateTime.now().millisecondsSinceEpoch;
    if ((account.lockedUntilEpochMs ?? 0) > now) {
      final minutes = ((account.lockedUntilEpochMs! - now) / 60000).ceil();
      return MpinVerification.denied(
          'Too many attempts. Try again in $minutes minute(s).');
    }
    if (_hashMpin(mpin, account.mpinSalt) == account.mpinHash) {
      if (account.failedAttempts != 0 || account.lockedUntilEpochMs != null) {
        current[index] = account.withFailures(0, null);
        await _write(current);
      }
      return const MpinVerification.allowed();
    }
    final attempts = account.failedAttempts + 1;
    final lockedUntil = attempts >= _maxAttempts
        ? DateTime.now().add(const Duration(minutes: 5)).millisecondsSinceEpoch
        : null;
    current[index] =
        account.withFailures(lockedUntil == null ? attempts : 0, lockedUntil);
    await _write(current);
    return MpinVerification.denied(lockedUntil == null
        ? 'Incorrect MPIN. ${_maxAttempts - attempts} attempt(s) remaining.'
        : 'Too many attempts. Account switching is locked for 5 minutes.');
  }

  Future<MpinVerification> changeMpin({
    required String userId,
    required String currentMpin,
    required String newMpin,
  }) async {
    _validateMpin(newMpin);
    final verified = await verifyMpin(userId, currentMpin);
    if (!verified.allowed) return verified;
    final current = (await accounts()).toList();
    final index = current.indexWhere((item) => item.userId == userId);
    if (index < 0) {
      return const MpinVerification.denied('Account not found on this device.');
    }
    final account = current[index];
    final salt = _newSalt();
    current[index] = DeviceAccount(
      userId: account.userId,
      email: account.email,
      name: account.name,
      role: account.role,
      password: account.password,
      mpinSalt: salt,
      mpinHash: _hashMpin(newMpin, salt),
    );
    await _write(current);
    return const MpinVerification.allowed();
  }

  Future<void> remove(String userId) async {
    final current = (await accounts()).toList()
      ..removeWhere((item) => item.userId == userId);
    await _write(current);
  }

  Future<void> _write(List<DeviceAccount> accounts) => _storage.write(
        key: _key,
        value: jsonEncode(accounts.map((item) => item.toJson()).toList()),
      );

  static void _validateMpin(String mpin) {
    if (!RegExp(r'^\d{4}$').hasMatch(mpin)) {
      throw const FormatException('MPIN must contain exactly 4 digits.');
    }
  }

  static String _newSalt() {
    final random = Random.secure();
    return base64UrlEncode(List<int>.generate(24, (_) => random.nextInt(256)));
  }

  static String _hashMpin(String mpin, String salt) {
    List<int> bytes = utf8.encode('$salt:$mpin');
    for (var index = 0; index < 50000; index++) {
      bytes = sha256.convert(bytes).bytes;
    }
    return base64UrlEncode(bytes);
  }
}
