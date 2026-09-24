import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/features/auth/data/auth_service.dart';
import 'package:tms_mobile/features/auth/data/device_account_vault.dart';

void main() {
  test('pins the currently logged-in account above other saved accounts', () {
    const first = DeviceAccount(
      userId: 'first',
      email: 'first@example.com',
      name: 'First User',
      role: 'PARENT',
      password: 'password',
      mpinSalt: 'salt',
      mpinHash: 'hash',
    );
    const current = DeviceAccount(
      userId: 'current',
      email: 'current@example.com',
      name: 'Current User',
      role: 'STUDENT',
      password: 'password',
      mpinSalt: 'salt',
      mpinHash: 'hash',
    );
    const last = DeviceAccount(
      userId: 'last',
      email: 'last@example.com',
      name: 'Last User',
      role: 'TEACHER',
      password: 'password',
      mpinSalt: 'salt',
      mpinHash: 'hash',
    );

    final ordered =
        orderDeviceAccountsForDisplay([first, current, last], current.userId);

    expect(ordered.map((account) => account.userId), [
      'current',
      'first',
      'last',
    ]);
  });

  test('stores multiple accounts and requires each account MPIN', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final vault = DeviceAccountVault();
    const parent = AuthUser(
      id: 'parent-1',
      email: 'parent@example.com',
      firstName: 'Parent',
      lastName: 'User',
      role: 'PARENT',
    );
    const student = AuthUser(
      id: 'student-1',
      email: 'student@example.com',
      firstName: 'Student',
      lastName: 'User',
      role: 'STUDENT',
    );

    await vault.saveAccount(
        user: parent, password: 'parent-password', mpin: '1234');
    await vault.saveAccount(
        user: student, password: 'student-password', mpin: '6543');

    expect(await vault.accounts(), hasLength(2));
    expect((await vault.verifyMpin(parent.id, '1111')).allowed, isFalse);
    expect((await vault.verifyMpin(parent.id, '1234')).allowed, isTrue);
    expect((await vault.verifyMpin(student.id, '1234')).allowed, isFalse);
    expect((await vault.verifyMpin(student.id, '6543')).allowed, isTrue);

    final changed = await vault.changeMpin(
      userId: parent.id,
      currentMpin: '1234',
      newMpin: '1122',
    );
    expect(changed.allowed, isTrue);
    expect((await vault.verifyMpin(parent.id, '1234')).allowed, isFalse);
    expect((await vault.verifyMpin(parent.id, '1122')).allowed, isTrue);
  });

  test('rejects weak MPIN values', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final vault = DeviceAccountVault();
    const user = AuthUser(
      id: 'user-1',
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'PARENT',
    );

    expect(
      vault.saveAccount(user: user, password: 'password', mpin: '123'),
      throwsFormatException,
    );
  });
}
