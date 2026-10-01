import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';

import '../data/auth_service.dart';
import '../data/device_account_vault.dart';
import '../widgets/forgot_password_prompt.dart';

class DeviceAccountsScreen extends ConsumerStatefulWidget {
  const DeviceAccountsScreen({super.key, this.loginMode = false});

  final bool loginMode;

  @override
  ConsumerState<DeviceAccountsScreen> createState() =>
      _DeviceAccountsScreenState();
}

class _DeviceAccountsScreenState extends ConsumerState<DeviceAccountsScreen> {
  final _vault = DeviceAccountVault();
  late Future<List<DeviceAccount>> _accounts;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() => _accounts = _vault.accounts();

  Future<void> _addOrProtectCurrent({bool addAnother = false}) async {
    TextInput.finishAutofillContext(shouldSave: false);
    final current = ref.read(authProvider).user;
    final email =
        TextEditingController(text: addAnother ? '' : current?.email ?? '');
    final password = TextEditingController();
    final mpin = TextEditingController();
    final confirm = TextEditingController();
    String? error;
    var busy = false;
    var obscurePassword = true;
    var obscurePin = true;
    final saved = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(addAnother ? 'Add account' : 'Enable account switching'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(addAnother
                    ? 'Sign in to the additional account and create its private MPIN.'
                    : 'Confirm this account password and create a private MPIN for switching.'),
                const SizedBox(height: 16),
                TextField(
                    controller: email,
                    enabled: addAnother && !busy,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const <String>[],
                    autocorrect: false,
                    enableSuggestions: false,
                    enableIMEPersonalizedLearning: false,
                    decoration: const InputDecoration(labelText: 'Email')),
                const SizedBox(height: 12),
                TextField(
                    controller: password,
                    enabled: !busy,
                    obscureText: obscurePassword,
                    autofillHints: const <String>[],
                    autocorrect: false,
                    enableSuggestions: false,
                    enableIMEPersonalizedLearning: false,
                    decoration: InputDecoration(
                        labelText: 'Password',
                        suffixIcon: IconButton(
                            onPressed: () => setDialogState(
                                () => obscurePassword = !obscurePassword),
                            icon: Icon(obscurePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined)))),
                ForgotPasswordPrompt(
                  onReset: () {
                    Navigator.pop(dialogContext);
                    if (mounted) this.context.push('/forgot-password');
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                    controller: mpin,
                    enabled: !busy,
                    obscureText: obscurePin,
                    autofillHints: const <String>[],
                    autocorrect: false,
                    enableSuggestions: false,
                    enableIMEPersonalizedLearning: false,
                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(4)
                    ],
                    decoration: InputDecoration(
                        labelText: 'Create 4-digit MPIN',
                        suffixIcon: IconButton(
                            onPressed: () =>
                                setDialogState(() => obscurePin = !obscurePin),
                            icon: Icon(obscurePin
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined)))),
                const SizedBox(height: 12),
                TextField(
                    controller: confirm,
                    enabled: !busy,
                    obscureText: obscurePin,
                    autofillHints: const <String>[],
                    autocorrect: false,
                    enableSuggestions: false,
                    enableIMEPersonalizedLearning: false,
                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(4)
                    ],
                    decoration: InputDecoration(
                        labelText: 'Confirm MPIN',
                        suffixIcon: IconButton(
                            onPressed: () =>
                                setDialogState(() => obscurePin = !obscurePin),
                            icon: Icon(obscurePin
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined)))),
                if (error != null)
                  Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(error!,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error))),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed:
                    busy ? null : () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: busy
                  ? null
                  : () async {
                      if (!RegExp(r'^\d{4}$').hasMatch(mpin.text) ||
                          mpin.text != confirm.text) {
                        setDialogState(
                            () => error = 'Enter matching 4-digit MPINs.');
                        return;
                      }
                      setDialogState(() {
                        busy = true;
                        error = null;
                      });
                      try {
                        final user = await ref
                            .read(authProvider.notifier)
                            .activateDeviceAccount(email.text, password.text);
                        if (user == null) {
                          await _vault.savePendingEnrollment(
                            email: email.text,
                            password: password.text,
                            mpin: mpin.text,
                          );
                          if (dialogContext.mounted) {
                            Navigator.pop(dialogContext, false);
                          }
                          return;
                        }
                        await _vault.saveAccount(
                            user: user,
                            password: password.text,
                            mpin: mpin.text);
                        if (dialogContext.mounted) {
                          Navigator.pop(dialogContext, true);
                        }
                      } on AuthFailure catch (failure) {
                        setDialogState(() {
                          busy = false;
                          error = failure.message;
                        });
                      } on FormatException catch (failure) {
                        setDialogState(() {
                          busy = false;
                          error = failure.message;
                        });
                      }
                    },
              child: Text(busy ? 'Saving…' : 'Save account'),
            ),
          ],
        ),
      ),
    );
    password.clear();
    mpin.clear();
    confirm.clear();
    TextInput.finishAutofillContext(shouldSave: false);
    email.dispose();
    password.dispose();
    mpin.dispose();
    confirm.dispose();
    if (saved == true && mounted) setState(_reload);
    final auth = ref.read(authProvider);
    if (mounted && auth.isTwoFactorPending) context.go('/2fa');
  }

  Future<void> _switch(DeviceAccount account) async {
    TextInput.finishAutofillContext(shouldSave: false);
    final credential = TextEditingController();
    String? error;
    var busy = false;
    var obscurePin = true;
    var useMpin = true;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text('Switch to ${account.name}'),
          scrollable: true,
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(account.email),
            const SizedBox(height: 16),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(
                  value: true,
                  icon: Icon(Icons.pin_outlined),
                  label: Text('MPIN'),
                ),
                ButtonSegment(
                  value: false,
                  icon: Icon(Icons.password_rounded),
                  label: Text('Password'),
                ),
              ],
              selected: {useMpin},
              onSelectionChanged: busy
                  ? null
                  : (selection) {
                      FocusScope.of(context).unfocus();
                      setDialogState(() {
                        useMpin = selection.first;
                        credential.clear();
                        error = null;
                      });
                    },
            ),
            const SizedBox(height: 16),
            TextField(
                key: ValueKey(useMpin ? 'switch-mpin' : 'switch-password'),
                controller: credential,
                autofocus: true,
                obscureText: obscurePin,
                keyboardType:
                    useMpin ? TextInputType.number : TextInputType.text,
                maxLength: useMpin ? 4 : null,
                autofillHints: const <String>[],
                autocorrect: false,
                enableSuggestions: false,
                enableIMEPersonalizedLearning: false,
                decoration: InputDecoration(
                    labelText: useMpin ? '4-digit MPIN' : 'Password',
                    helperText: useMpin
                        ? 'Use the private MPIN for this saved account.'
                        : 'Use this account’s current password.',
                    suffixIcon: IconButton(
                        onPressed: () =>
                            setDialogState(() => obscurePin = !obscurePin),
                        icon: Icon(obscurePin
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined))),
                onSubmitted: (_) {}),
            ForgotPasswordPrompt(
              onReset: () {
                Navigator.pop(dialogContext);
                if (mounted) this.context.push('/forgot-password');
              },
            ),
            if (error != null)
              Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(error!,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error))),
          ]),
          actions: [
            TextButton(
                onPressed: busy ? null : () => Navigator.pop(dialogContext),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: busy
                  ? null
                  : () async {
                      setDialogState(() {
                        busy = true;
                        error = null;
                      });
                      try {
                        final value = credential.text;
                        if (useMpin && RegExp(r'^\d{4}$').hasMatch(value)) {
                          final verified =
                              await _vault.verifyMpin(account.userId, value);
                          if (!verified.allowed) {
                            setDialogState(() {
                              busy = false;
                              error = verified.message;
                            });
                            return;
                          }
                        } else if (useMpin) {
                          setDialogState(() {
                            busy = false;
                            error = 'Enter the 4-digit MPIN.';
                          });
                          return;
                        } else if (value.isEmpty) {
                          setDialogState(() {
                            busy = false;
                            error = 'Enter the account password or MPIN.';
                          });
                          return;
                        }
                        final user = await ref
                            .read(authProvider.notifier)
                            .activateDeviceAccount(account.email,
                                useMpin ? account.password : value);
                        if (!dialogContext.mounted) return;
                        Navigator.pop(dialogContext);
                        if (user != null && mounted) {
                          context.go(ref.read(authProvider).roleRedirectPath);
                        }
                      } on AuthFailure catch (failure) {
                        setDialogState(() {
                          busy = false;
                          error =
                              '${failure.message} Sign in again to refresh this saved account.';
                        });
                      }
                    },
              child: Text(busy ? 'Switching…' : 'Switch account'),
            ),
          ],
        ),
      ),
    );
    TextInput.finishAutofillContext(shouldSave: false);
    // showDialog completes as soon as the route is popped, while its reverse
    // animation may still build the TextField for a few frames. Disposing the
    // controller immediately makes those frames read a disposed controller.
    // Wait until the dialog transition is fully gone before releasing it.
    await Future<void>.delayed(const Duration(milliseconds: 500));
    credential.dispose();
    if (mounted && ref.read(authProvider).isTwoFactorPending) {
      context.go('/2fa');
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentId = ref.watch(authProvider).user?.id;
    return Scaffold(
      appBar: AppBar(
          title: Text(widget.loginMode
              ? 'Log into a saved account'
              : 'Accounts on this device')),
      body: FutureBuilder<List<DeviceAccount>>(
        future: _accounts,
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final accounts = orderDeviceAccountsForDisplay(
            snapshot.data!,
            currentId,
          );
          final currentSaved = accounts.any((item) => item.userId == currentId);
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (!widget.loginMode && !currentSaved)
                Card(
                    child: ListTile(
                        leading: const Icon(Icons.pin_outlined),
                        title: const Text('Set MPIN for current account'),
                        subtitle: const Text(
                            'Required before this account can be selected safely.'),
                        onTap: _addOrProtectCurrent)),
              for (final account in accounts)
                Card(
                    child: ListTile(
                  leading: CircleAvatar(
                      child: Text(account.name.isEmpty
                          ? '?'
                          : account.name[0].toUpperCase())),
                  title: Text(account.name),
                  subtitle: Text(
                      '${account.email}\n${account.role.replaceAll('_', ' ')}'),
                  isThreeLine: true,
                  trailing: !widget.loginMode && account.userId == currentId
                      ? const Chip(label: Text('Current'))
                      : const Icon(Icons.chevron_right_rounded),
                  onTap: !widget.loginMode && account.userId == currentId
                      ? null
                      : () => _switch(account),
                )),
              const SizedBox(height: 12),
              if (!widget.loginMode)
                FilledButton.icon(
                    onPressed: currentSaved
                        ? () => context.push(
                            '${GoRouterState.of(context).matchedLocation}/add')
                        : null,
                    icon: const Icon(Icons.person_add_alt_1_rounded),
                    label: Text(currentSaved
                        ? 'Add account'
                        : 'Set current account MPIN first')),
              if (accounts.length > 1)
                const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: Text(
                        'Choose any saved account above to switch using its MPIN.',
                        textAlign: TextAlign.center)),
            ],
          );
        },
      ),
    );
  }
}
