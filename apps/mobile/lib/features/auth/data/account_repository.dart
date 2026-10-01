import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:tms_mobile/core/network/api_client.dart';

class AccountRole {
  const AccountRole({required this.name, this.branchName, this.branchId});

  factory AccountRole.fromJson(Map<String, dynamic> json) => AccountRole(
        name: (json['name'] ?? '').toString(),
        branchName: json['branchName']?.toString(),
        branchId: json['branchId']?.toString(),
      );

  final String name;
  final String? branchName;
  final String? branchId;
}

class PersonalAccount {
  const PersonalAccount({
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.emailVerified,
    required this.phone,
    required this.mobileVerified,
    required this.institution,
    required this.twoFactorEnabled,
    required this.roles,
    required this.canManageSecurityMobile,
    this.photoUrl,
  });

  factory PersonalAccount.fromJson(Map<String, dynamic> json) =>
      PersonalAccount(
        firstName: (json['firstName'] ?? '').toString(),
        lastName: (json['lastName'] ?? '').toString(),
        email: (json['email'] ?? '').toString(),
        emailVerified: json['emailVerified'] == true,
        phone: (json['phone'] ?? '').toString(),
        mobileVerified: json['mobileVerified'] == true,
        institution: json['tenant'] is Map
            ? ((json['tenant'] as Map)['name'] ?? '').toString()
            : '',
        twoFactorEnabled: json['twoFactorEnabled'] == true,
        roles: (json['roles'] as List? ?? const [])
            .whereType<Map>()
            .map(
                (role) => AccountRole.fromJson(Map<String, dynamic>.from(role)))
            .toList(growable: false),
        canManageSecurityMobile: json['capabilities'] is Map &&
            (json['capabilities'] as Map)['manageSecurityMobile'] == true,
        photoUrl: json['photoUrl']?.toString(),
      );

  final String firstName;
  final String lastName;
  final String email;
  final bool emailVerified;
  final String phone;
  final bool mobileVerified;
  final String institution;
  final bool twoFactorEnabled;
  final List<AccountRole> roles;
  final bool canManageSecurityMobile;
  final String? photoUrl;
  String get name => '$firstName $lastName'.trim();
  String get initials => [firstName, lastName]
      .where((part) => part.isNotEmpty)
      .map((part) => part[0].toUpperCase())
      .take(2)
      .join();
}

class MobileChangeChallenge {
  const MobileChangeChallenge({
    required this.id,
    required this.currentDestination,
    required this.newDestination,
  });

  factory MobileChangeChallenge.fromJson(Map<String, dynamic> json) =>
      MobileChangeChallenge(
        id: json['challengeId'].toString(),
        currentDestination: json['currentDestination'].toString(),
        newDestination: json['newDestination'].toString(),
      );

  final String id;
  final String currentDestination;
  final String newDestination;
}

class AccountRepository {
  AccountRepository({Dio? dio}) : _dio = dio ?? ApiClient.instance.dio;
  final Dio _dio;

  Future<PersonalAccount> load() async {
    final response =
        await _dio.get<Map<String, dynamic>>('/api/users/me/account');
    return PersonalAccount.fromJson(response.data ?? const {});
  }

  Future<PersonalAccount> updateName(String firstName, String lastName) async {
    await _dio.patch<Map<String, dynamic>>(
      '/api/users/me/account',
      data: {'firstName': firstName.trim(), 'lastName': lastName.trim()},
    );
    return load();
  }

  Future<String> updatePhoto(Uint8List bytes, String mimeType) async {
    final response = await _dio.put<Map<String, dynamic>>(
      '/api/users/me/account/photo',
      data: {'image': 'data:$mimeType;base64,${base64Encode(bytes)}'},
    );
    return (response.data?['photoUrl'] ?? '').toString();
  }

  Future<MobileChangeChallenge> startMobileChange({
    required String password,
    required String phone,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/account/contact/mobile/start',
      data: {'password': password, 'phone': phone.trim()},
    );
    return MobileChangeChallenge.fromJson(response.data ?? const {});
  }

  Future<void> confirmMobileChange({
    required String challengeId,
    required String currentCode,
    required String newCode,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      '/api/account/contact/mobile/confirm',
      data: {
        'challengeId': challengeId,
        'currentCode': currentCode,
        'newCode': newCode,
      },
    );
  }

  Future<void> changeEmail({
    required String password,
    required String email,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      '/api/account/contact/email',
      data: {'password': password, 'email': email.trim().toLowerCase()},
    );
  }
}
