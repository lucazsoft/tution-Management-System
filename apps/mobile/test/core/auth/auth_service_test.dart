import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/features/auth/data/auth_service.dart';
import 'package:tms_mobile/features/auth/data/mock_auth_service.dart';

/// P0-A mobile auth hardening contract.
///
/// * Production paths are server-backed only: no [MockAuthService] demo
///   fallback, no fixed OTPs, no `mock-` reset tokens.
/// * [AuthService.restoreSession] validates `GET /api/auth/get-session`
///   BEFORE trusting the cache and fails closed (wipe + unauthenticated)
///   on 401/expiry.
/// * Hostile/unsupported roles never resolve to a privileged deep-link.
class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) =>
      handler(options);

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Object? data, int status) => ResponseBody.fromString(
      jsonEncode(data),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType]
      },
    );

Map<String, dynamic> _sessionUser(String role) => {
      'user': {
        'id': 'user-1',
        'email': 'teacher@tms.edu.np',
        'firstName': 'Test',
        'lastName': 'User',
        'role': role,
      },
    };

/// Builds a stub keyed on `METHOD path`, falling back to [fallback].
_StubAdapter _adapter(
  Map<String, Future<ResponseBody> Function(RequestOptions)> routes, {
  Future<ResponseBody> Function(RequestOptions)? fallback,
}) {
  return _StubAdapter((options) async {
    final key = '${options.method} ${options.path}';
    final route = routes[key];
    if (route != null) return route(options);
    if (fallback != null) return fallback(options);
    return _json({'error': 'not stubbed: $key'}, 404);
  });
}

void _useDio(Dio dio) {
  ApiClient.instance.setDioForTesting(dio);
  addTearDown(ApiClient.instance.resetForTesting);
}

Dio _dioWith(_StubAdapter adapter) =>
    ApiClient.buildDio(baseUrl: 'https://test.invalid', adapter: adapter);

void main() {
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  group('real-path sign-in', () {
    test('posts credentials then resolves the server session', () async {
      final seen = <String>[];
      _useDio(_dioWith(_adapter({
        'POST /api/auth/sign-in/email': (options) async {
          seen.add('POST /api/auth/sign-in/email');
          expect(options.data['email'], 'teacher@tms.edu.np');
          return _json(const {}, 200);
        },
        'GET /api/auth/get-session': (options) async {
          seen.add('GET /api/auth/get-session');
          return _json(_sessionUser('TEACHER'), 200);
        },
      })));

      final user = await AuthService.signIn(
        email: 'Teacher@TMS.edu.np',
        password: 'Teacher@123',
      );

      expect(user.role, 'TEACHER');
      expect(
        seen,
        ['POST /api/auth/sign-in/email', 'GET /api/auth/get-session'],
      );
      // Session is persisted for offline boot.
      expect(await ApiClient.getUser(), contains('TEACHER'));
    });

    test('demo-address sign-in still hits the server (no mock bypass)',
        () async {
      var signInPosts = 0;
      _useDio(_dioWith(_adapter({
        'POST /api/auth/sign-in/email': (_) async {
          signInPosts++;
          return _json(const {}, 200);
        },
        'GET /api/auth/get-session': (_) async =>
            _json(_sessionUser('STUDENT'), 200),
      })));

      final user = await AuthService.signIn(
        email: 'student@tms.edu.np',
        password: 'Student@123',
      );

      expect(signInPosts, 1);
      expect(user.role, 'STUDENT');
    });

    test('server rejection surfaces AuthFailure', () async {
      _useDio(_dioWith(_adapter({
        'POST /api/auth/sign-in/email': (_) async =>
            _json({'error': 'Invalid email or password.'}, 401),
      })));

      expect(
        AuthService.signIn(email: 'a@b.c', password: 'wrong'),
        throwsA(isA<AuthFailure>()),
      );
    });
  });

  group('real-path password reset', () {
    test('send/verify/reset all hit the server; token is server-issued',
        () async {
      final seen = <String>[];
      _useDio(_dioWith(_adapter({
        'POST /api/auth/forgot-password': (_) async {
          seen.add('forgot-password');
          return _json(const {}, 200);
        },
        'POST /api/auth/verify-reset-otp': (_) async {
          seen.add('verify-reset-otp');
          return _json({'resetToken': 'server-token-abc'}, 200);
        },
        'POST /api/auth/reset-password': (options) async {
          seen.add('reset-password');
          expect(options.data['resetToken'], 'server-token-abc');
          return _json(const {}, 200);
        },
      })));

      await AuthService.sendPasswordOtp('student@tms.edu.np');
      final token = await AuthService.verifyPasswordOtp(
        email: 'student@tms.edu.np',
        otp: '654321',
      );
      expect(token, 'server-token-abc');
      expect(token.startsWith('mock-'), isFalse);
      await AuthService.resetPassword(
        resetToken: token,
        newPassword: 'NewPass@123',
      );
      expect(
        seen,
        ['forgot-password', 'verify-reset-otp', 'reset-password'],
      );
    });

    test('fixed OTP 123456 is rejected when the server rejects it', () async {
      _useDio(_dioWith(_adapter({
        'POST /api/auth/verify-reset-otp': (_) async =>
            _json({'error': 'Invalid or expired OTP.'}, 400),
      })));

      expect(
        AuthService.verifyPasswordOtp(email: 'a@b.c', otp: '123456'),
        throwsA(isA<AuthFailure>()),
      );
    });

    test('mock helper no longer accepts the fixed OTP', () async {
      expect(MockAuthService.verifyPasswordOtp('123456'),
          throwsA(isA<AuthFailure>()));
      expect(MockAuthService.verifyTwoFactorCode('123456'),
          throwsA(isA<AuthFailure>()));
      // The named dev OTPs still verify (mock-only seam, never production).
      await MockAuthService.verifyPasswordOtp(
          MockAuthService.forgotPasswordOtp);
      await MockAuthService.verifyTwoFactorCode(MockAuthService.twoFactorOtp);
    });
  });

  group('real-path 2FA', () {
    test('send and verify hit the two-factor endpoints', () async {
      final seen = <String>[];
      _useDio(_dioWith(_adapter({
        'POST /api/auth/two-factor/send-otp': (_) async {
          seen.add('send-otp');
          return _json(const {}, 200);
        },
        'POST /api/auth/two-factor/verify-otp': (_) async {
          seen.add('verify-otp');
          return _json(const {}, 200);
        },
      })));

      await AuthService.sendTwoFactorCode('teacher@tms.edu.np');
      await AuthService.verifyTwoFactorCode(
        email: 'teacher@tms.edu.np',
        code: '246810',
      );
      expect(seen, ['send-otp', 'verify-otp']);
    });

    test('wrong 2FA code surfaces AuthFailure', () async {
      _useDio(_dioWith(_adapter({
        'POST /api/auth/two-factor/verify-otp': (_) async =>
            _json({'error': 'Invalid verification code.'}, 400),
      })));

      expect(
        AuthService.verifyTwoFactorCode(email: 'a@b.c', code: '000000'),
        throwsA(isA<AuthFailure>()),
      );
    });
  });

  group('logout', () {
    test('sign-out posts to the server and always clears local auth', () async {
      _useDio(_dioWith(_adapter({
        'POST /api/auth/sign-out': (_) async => _json(const {}, 200),
      })));
      await ApiClient.saveUser(jsonEncode(const {'id': 'cached'}));

      await AuthService.signOut();

      expect(await ApiClient.getUser(), isNull);
    });

    test('sign-out clears local auth even when the network fails', () async {
      _useDio(_dioWith(_adapter(
        {},
        fallback: (_) async => _json({'error': 'down'}, 500),
      )));
      await ApiClient.saveUser('{"id":"cached"}');

      await AuthService.signOut();

      expect(await ApiClient.getUser(), isNull);
    });
  });

  group('session restore fails closed', () {
    test('valid server session wins over the cache and refreshes it', () async {
      await ApiClient.saveUser('{"id":"stale","role":"PARENT"}');
      _useDio(_dioWith(_adapter({
        'GET /api/auth/get-session': (_) async =>
            _json(_sessionUser('TEACHER'), 200),
      })));

      final user = await AuthService.restoreSession();

      expect(user, isNotNull);
      expect(user!.id, 'user-1');
      expect(await ApiClient.getUser(), contains('user-1'));
    });

    test('401 wipes the stale cache and returns unauthenticated', () async {
      await ApiClient.saveUser('{"id":"stale","role":"TEACHER"}');
      _useDio(_dioWith(_adapter({
        'GET /api/auth/get-session': (_) async =>
            _json({'error': 'session expired'}, 401),
      })));

      expect(await AuthService.restoreSession(), isNull);
      expect(await ApiClient.getUser(), isNull);
    });

    test('session payload without a user wipes the cache', () async {
      await ApiClient.saveUser('{"id":"stale","role":"TEACHER"}');
      _useDio(_dioWith(_adapter({
        'GET /api/auth/get-session': (_) async =>
            _json(const {'user': null}, 200),
      })));

      expect(await AuthService.restoreSession(), isNull);
      expect(await ApiClient.getUser(), isNull);
    });

    test('network error never resurrects the stale cache', () async {
      await ApiClient.saveUser('{"id":"stale","role":"TEACHER"}');
      _useDio(_dioWith(_adapter(
        {},
        fallback: (_) async => _json({'error': 'down'}, 500),
      )));

      expect(await AuthService.restoreSession(), isNull);
    });
  });

  group('hostile role deep-links', () {
    AuthState stateFor(String role) => AuthState(
          user: AuthUser(
            id: 'user-1',
            email: 'user@example.com',
            firstName: 'Test',
            lastName: 'User',
            role: role,
          ),
          isAuthenticated: true,
          isLoading: false,
        );

    test('hands unsupported server roles to the web portal only', () {
      for (final webOnlyRole in [
        'SUPER_ADMIN',
        'STAFF',
        'ADMIN',
        'TEACHER,ADMIN'
      ]) {
        final user = AuthUser.fromJson({
          'user': {
            'id': 'x',
            'email': 'x@y.z',
            'firstName': 'X',
            'lastName': 'Y',
            'role': webOnlyRole,
          },
        });
        expect(
          user.role,
          'WEB_PORTAL_ONLY',
          reason: 'role: $webOnlyRole',
        );
      }
      expect(
        () => AuthUser.fromJson({
          'user': {
            'id': 'x',
            'email': 'x@y.z',
            'role': '',
          },
        }),
        throwsA(isA<AuthFailure>()),
      );
    });

    test('unknown roles never reach a privileged mobile home', () {
      for (final hostile in ['UNKNOWN', 'SUPER_ADMIN', 'ADMIN', '']) {
        expect(stateFor(hostile).roleRedirectPath, '/unsupported-role',
            reason: 'role: $hostile');
      }
      expect(stateFor('TEACHER').roleRedirectPath, '/teacher/home');
    });

    test('2FA-pending sessions route to /2fa regardless of role', () {
      const pending = AuthState(isTwoFactorPending: true, isLoading: false);
      expect(pending.roleRedirectPath, '/login');

      const withUser = AuthState(
        user: AuthUser(
          id: 'u',
          email: 'u@x.y',
          firstName: 'T',
          lastName: 'U',
          role: 'TENANT_ADMIN',
        ),
        isAuthenticated: false,
        isLoading: false,
        isTwoFactorPending: true,
      );
      expect(withUser.roleRedirectPath, '/2fa');
    });
  });
}
