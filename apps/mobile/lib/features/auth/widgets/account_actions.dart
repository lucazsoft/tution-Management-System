import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/features/auth/data/device_account_vault.dart';

class AccountActions extends ConsumerWidget {
  const AccountActions(
      {super.key, required this.accountRoute, required this.passwordRoute});
  final String accountRoute;
  final String passwordRoute;

  String get _accountsRoute =>
      accountRoute.replaceFirst('/account', '/accounts');
  String get _addAccountRoute => '$_accountsRoute/add';
  String get _mpinRoute => accountRoute.replaceFirst('/account', '/mpin');

  @override
  Widget build(BuildContext context, WidgetRef ref) => Column(
        children: [
          ListTile(
              leading: const Icon(Icons.person_outline_rounded),
              title: const Text('Profile and settings'),
              onTap: () => context.push(accountRoute)),
          ListTile(
              leading: const Icon(Icons.key_rounded),
              title: const Text('Change password'),
              onTap: () => context.push(passwordRoute)),
          ListTile(
              leading: const Icon(Icons.pin_outlined),
              title: const Text('Set or change MPIN'),
              onTap: () => context.push(_mpinRoute)),
          ListTile(
            leading: const Icon(Icons.switch_account_rounded),
            title: const Text('Switch account'),
            subtitle: const Text('Sign in with another account on this device'),
            onTap: () async {
              final currentId = ref.read(authProvider).user?.id;
              final accounts = await DeviceAccountVault().accounts();
              if (!context.mounted) return;
              final hasMpin =
                  accounts.any((account) => account.userId == currentId);
              if (hasMpin) {
                context.push(
                    accounts.length > 1 ? _accountsRoute : _addAccountRoute);
                return;
              }
              final proceed = await showDialog<bool>(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('Set MPIN before switching'),
                  content: const Text(
                    'Protect your current account with a 4-digit MPIN before signing in to another account.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogContext, false),
                      child: const Text('Cancel'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(dialogContext, true),
                      child: const Text('Set MPIN'),
                    ),
                  ],
                ),
              );
              if (proceed == true && context.mounted) {
                final destination = accounts.length > 1 ? 'accounts' : 'add';
                context.push('$_mpinRoute?switchAccount=$destination');
              }
            },
          ),
          ListTile(
            leading: Icon(Icons.logout_rounded,
                color: Theme.of(context).colorScheme.error),
            title: Text('Log out',
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
            onTap: () => ref.read(authProvider.notifier).logout(),
          ),
        ],
      );
}

Future<void> showAccountActionsSheet(BuildContext context,
    {required String accountRoute, required String passwordRoute}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (_) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: AccountActions(
            accountRoute: accountRoute, passwordRoute: passwordRoute),
      ),
    ),
  );
}
