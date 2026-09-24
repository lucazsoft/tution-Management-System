import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';

import '../data/auth_service.dart';
import '../data/device_account_vault.dart';

class MpinSettingsScreen extends ConsumerStatefulWidget {
  const MpinSettingsScreen({super.key, this.switchAccountRoute});

  final String? switchAccountRoute;

  @override
  ConsumerState<MpinSettingsScreen> createState() => _MpinSettingsScreenState();
}

class _MpinSettingsScreenState extends ConsumerState<MpinSettingsScreen> {
  final _vault = DeviceAccountVault();
  final _password = TextEditingController();
  final _currentMpin = TextEditingController();
  final _newMpin = TextEditingController();
  final _confirmMpin = TextEditingController();
  bool _busy = false;
  bool _obscurePassword = true;
  bool _obscurePin = true;
  String? _error;
  String? _message;
  late Future<bool> _isConfigured;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  void _refresh() {
    final userId = ref.read(authProvider).user?.id;
    _isConfigured = _vault
        .accounts()
        .then((items) => items.any((item) => item.userId == userId));
  }

  @override
  void dispose() {
    _password.dispose();
    _currentMpin.dispose();
    _newMpin.dispose();
    _confirmMpin.dispose();
    super.dispose();
  }

  bool _validateNewMpin() {
    if (!RegExp(r'^\d{4}$').hasMatch(_newMpin.text)) {
      setState(() => _error = 'MPIN must contain exactly 4 digits.');
      return false;
    }
    if (_newMpin.text != _confirmMpin.text) {
      setState(() => _error = 'The new MPIN values do not match.');
      return false;
    }
    return true;
  }

  Future<void> _save(bool configured) async {
    if (!_validateNewMpin()) return;
    final user = ref.read(authProvider).user;
    if (user == null) return;
    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });
    try {
      if (configured) {
        final result = await _vault.changeMpin(
          userId: user.id,
          currentMpin: _currentMpin.text,
          newMpin: _newMpin.text,
        );
        if (!result.allowed) {
          throw AuthFailure(result.message ?? 'Incorrect MPIN.');
        }
      } else {
        final result = await AuthService.signIn(
            email: user.email, password: _password.text);
        if (result.requiresTwoFactor) {
          throw const AuthFailure(
              'Complete normal two-step sign-in before setting an MPIN.');
        }
        if (result.user?.id != user.id) {
          throw const AuthFailure(
              'The password does not belong to the current account.');
        }
        await _vault.saveAccount(
            user: user, password: _password.text, mpin: _newMpin.text);
      }
      _password.clear();
      _currentMpin.clear();
      _newMpin.clear();
      _confirmMpin.clear();
      setState(() {
        _refresh();
        _message = configured
            ? 'MPIN changed successfully.'
            : 'MPIN set. You can now add another account.';
      });
      if (!configured && widget.switchAccountRoute != null && mounted) {
        context.go(widget.switchAccountRoute!);
      }
    } on AuthFailure catch (error) {
      setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _pinField(TextEditingController controller, String label) => TextField(
        controller: controller,
        obscureText: _obscurePin,
        enabled: !_busy,
        keyboardType: TextInputType.number,
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(4)
        ],
        decoration: InputDecoration(
          labelText: label,
          suffixIcon: IconButton(
            onPressed:
                _busy ? null : () => setState(() => _obscurePin = !_obscurePin),
            icon: Icon(_obscurePin
                ? Icons.visibility_outlined
                : Icons.visibility_off_outlined),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Account MPIN')),
        body: FutureBuilder<bool>(
          future: _isConfigured,
          builder: (context, snapshot) {
            if (!snapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final configured = snapshot.data!;
            return ListView(padding: const EdgeInsets.all(20), children: [
              Text(configured ? 'Change MPIN' : 'Set MPIN',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(configured
                  ? 'Enter the current MPIN before choosing a replacement.'
                  : 'Protect this account before adding or switching to other accounts on this device.'),
              const SizedBox(height: 20),
              if (configured)
                _pinField(_currentMpin, 'Current MPIN')
              else
                TextField(
                    controller: _password,
                    obscureText: _obscurePassword,
                    enabled: !_busy,
                    decoration: InputDecoration(
                      labelText: 'Current account password',
                      suffixIcon: IconButton(
                        onPressed: _busy
                            ? null
                            : () => setState(
                                () => _obscurePassword = !_obscurePassword),
                        icon: Icon(_obscurePassword
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined),
                      ),
                    )),
              const SizedBox(height: 12),
              _pinField(_newMpin, 'New 4-digit MPIN'),
              const SizedBox(height: 12),
              _pinField(_confirmMpin, 'Confirm new MPIN'),
              if (_error != null)
                Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_error!,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error))),
              if (_message != null)
                Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_message!,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.primary))),
              const SizedBox(height: 20),
              FilledButton(
                  onPressed: _busy ? null : () => _save(configured),
                  child: Text(_busy
                      ? 'Saving…'
                      : configured
                          ? 'Change MPIN'
                          : 'Set MPIN')),
            ]);
          },
        ),
      );
}
