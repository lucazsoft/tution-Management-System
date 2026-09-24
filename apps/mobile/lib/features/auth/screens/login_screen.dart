import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/features/auth/data/auth_service.dart';
import 'package:tms_mobile/features/auth/data/remembered_credentials.dart';
import 'package:tms_mobile/features/auth/data/device_account_vault.dart';
import 'package:tms_mobile/features/auth/widgets/auth_card.dart';
import 'package:tms_mobile/features/auth/widgets/forgot_password_prompt.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.addAccountMode = false});

  final bool addAccountMode;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _credentialsStore = RememberedCredentialsStore();
  late final Future<List<DeviceAccount>> _savedAccounts;
  bool _obscurePassword = true;
  bool _rememberMe = false;
  bool _loadingRememberedCredentials = true;

  @override
  void initState() {
    super.initState();
    _savedAccounts = DeviceAccountVault().accounts();
    _restoreRememberedCredentials();
  }

  Future<void> _restoreRememberedCredentials() async {
    if (widget.addAccountMode) {
      _emailController.clear();
      _passwordController.clear();
      TextInput.finishAutofillContext(shouldSave: false);
      if (mounted) {
        setState(() => _loadingRememberedCredentials = false);
      }
      return;
    }
    try {
      final saved = await _credentialsStore.read();
      if (!mounted) return;
      if (saved != null) {
        _emailController.text = saved.email;
      }
      // A password is never restored, even when remember-me is enabled.
      _passwordController.clear();
      setState(() {
        _rememberMe = saved != null;
        _loadingRememberedCredentials = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingRememberedCredentials = false);
    }
  }

  @override
  void dispose() {
    _emailController.clear();
    _passwordController.clear();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submitLogin() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    ref.read(authProvider.notifier).clearError();

    final email = _emailController.text.trim();
    final credential = _passwordController.text;
    final vault = DeviceAccountVault();

    try {
      if (!widget.addAccountMode && RegExp(r'^\d{4}$').hasMatch(credential)) {
        final accounts = await vault.accounts();
        final saved = accounts
            .where((account) => account.email == email.toLowerCase())
            .firstOrNull;
        if (saved == null) {
          throw const AuthFailure(
            'No saved account matches this email. Sign in with your password first.',
          );
        }
        final verified = await vault.verifyMpin(saved.userId, credential);
        if (!verified.allowed) {
          throw AuthFailure(verified.message ?? 'Incorrect MPIN.');
        }
        await ref
            .read(authProvider.notifier)
            .activateDeviceAccount(saved.email, saved.password);
        if (!mounted) return;
        final auth = ref.read(authProvider);
        context.go(auth.isTwoFactorPending ? '/2fa' : auth.roleRedirectPath);
        return;
      }

      if (widget.addAccountMode) {
        final prepared = await ref
            .read(authProvider.notifier)
            .prepareDeviceAccount(email, credential);
        final existing = await vault.accounts();
        if (prepared.requiresTwoFactor) {
          if (!existing.any((item) => item.email == email.toLowerCase())) {
            final mpin = await _requestMpin();
            if (mpin == null) return;
            await vault.savePendingEnrollment(
              email: email,
              password: credential,
              mpin: mpin,
            );
          }
          ref.read(authProvider.notifier).beginDeviceAccountTwoFactor(email);
        } else {
          final user = prepared.user!;
          if (!existing.any((item) => item.userId == user.id)) {
            final mpin = await _requestMpin();
            if (mpin == null) return;
            await vault.saveAccount(
              user: user,
              password: credential,
              mpin: mpin,
            );
          }
          ref.read(authProvider.notifier).completeDeviceAccountSignIn(user);
        }
      } else {
        final prepared = await ref
            .read(authProvider.notifier)
            .prepareDeviceAccount(email, credential);
        final existing = await vault.accounts();
        if (prepared.requiresTwoFactor) {
          if (!existing.any((item) => item.email == email.toLowerCase())) {
            final mpin = await _requestMpin();
            if (mpin == null) return;
            await vault.savePendingEnrollment(
              email: email,
              password: credential,
              mpin: mpin,
            );
          }
          ref.read(authProvider.notifier).beginDeviceAccountTwoFactor(email);
        } else {
          final user = prepared.user!;
          if (!existing.any((item) => item.userId == user.id)) {
            final mpin = await _requestMpin();
            if (mpin == null) return;
            await vault.saveAccount(
              user: user,
              password: credential,
              mpin: mpin,
            );
          }
          ref.read(authProvider.notifier).completeDeviceAccountSignIn(user);
        }
      }
      if (!mounted) return;
      final auth = ref.read(authProvider);
      if (auth.isTwoFactorPending) {
        await _persistRememberedCredentials(email);
        if (!mounted) return;
        context.go('/2fa');
      } else if (auth.isAuthenticated) {
        await _persistRememberedCredentials(email);
        if (!mounted) return;
        context.go(auth.roleRedirectPath);
      } else {
        throw const AuthFailure(
          'Sign in did not complete. Please check your details and try again.',
        );
      }
    } on AuthFailure catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } catch (e) {
      if (!mounted) return;
      const message = 'An error occurred during sign in. Please try again.';
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(message)),
      );
    }
  }

  Future<String?> _requestMpin() async {
    final mpin = TextEditingController();
    final confirm = TextEditingController();
    String? error;
    var obscurePin = true;
    final result = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => PopScope(
          canPop: false,
          child: AlertDialog(
            title: const Text('Set account MPIN'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                    'Create a private 4-digit MPIN for switching to this account.'),
                const SizedBox(height: 16),
                TextField(
                    controller: mpin,
                    autofocus: true,
                    obscureText: obscurePin,
                    keyboardType: TextInputType.number,
                    maxLength: 4,
                    decoration: InputDecoration(
                        labelText: 'MPIN',
                        suffixIcon: IconButton(
                            onPressed: () =>
                                setDialogState(() => obscurePin = !obscurePin),
                            icon: Icon(obscurePin
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined)))),
                TextField(
                    controller: confirm,
                    obscureText: obscurePin,
                    keyboardType: TextInputType.number,
                    maxLength: 4,
                    decoration: InputDecoration(
                        labelText: 'Confirm MPIN',
                        suffixIcon: IconButton(
                            onPressed: () =>
                                setDialogState(() => obscurePin = !obscurePin),
                            icon: Icon(obscurePin
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined)))),
                if (error != null)
                  Text(error!,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error)),
              ],
            ),
            actions: [
              FilledButton(
                onPressed: () {
                  if (!RegExp(r'^\d{4}$').hasMatch(mpin.text) ||
                      mpin.text != confirm.text) {
                    setDialogState(
                        () => error = 'Enter matching 4-digit MPINs.');
                    return;
                  }
                  Navigator.pop(dialogContext, mpin.text);
                },
                child: const Text('Set MPIN'),
              ),
            ],
          ),
        ),
      ),
    );
    mpin.dispose();
    confirm.dispose();
    return result;
  }

  Future<void> _persistRememberedCredentials(String email) async {
    if (_rememberMe) {
      await _credentialsStore.save(email);
    } else {
      await _credentialsStore.clear();
    }
  }

  void _clearErrorOnEdit(String _) {
    ref.read(authProvider.notifier).clearError();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final isLoading = auth.isLoading;
    final errorMessage = auth.errorMessage;

    return AuthCard(
      onBack: widget.addAccountMode ? () => context.pop() : null,
      backLabel: widget.addAccountMode ? 'Cancel' : null,
      backIcon: widget.addAccountMode ? Icons.close_rounded : Icons.arrow_back,
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header actions sit inside the card so they respect the safe
            // area without being pinned against the physical screen edge.
            Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: kColorPrimary.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.school_rounded,
                    size: 36,
                    color: kColorPrimary,
                  ),
                ),
                if (!widget.addAccountMode)
                  Positioned(
                    right: 0,
                    top: 6,
                    child: FutureBuilder<List<DeviceAccount>>(
                      future: _savedAccounts,
                      builder: (context, snapshot) {
                        if (snapshot.data?.isNotEmpty != true) {
                          return const SizedBox.shrink();
                        }
                        return IconButton.filledTonal(
                          key: const ValueKey('saved-accounts-button'),
                          tooltip: 'Saved accounts',
                          onPressed: isLoading
                              ? null
                              : () => context.push('/saved-accounts'),
                          icon: const Icon(Icons.manage_accounts_outlined),
                        );
                      },
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              'Welcome Back',
              textAlign: TextAlign.center,
              style: GoogleFonts.fraunces(
                fontSize: 28,
                fontWeight: FontWeight.w700,
                color: kColorText,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Sign in to your Tuition Management account',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: kColorText.withValues(alpha: 0.65),
                  ),
            ),
            const SizedBox(height: 24),

            // Error Message Banner
            if (errorMessage != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: kColorError.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: kColorError.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline_rounded,
                        color: kColorError, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Semantics(
                        liveRegion: true,
                        child: Text(
                          errorMessage,
                          style: const TextStyle(
                            color: kColorError,
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Email / Phone Field
            TextFormField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              autofillHints: widget.addAccountMode
                  ? const <String>[]
                  : const [AutofillHints.username, AutofillHints.email],
              autocorrect: false,
              enableSuggestions: !widget.addAccountMode,
              enableIMEPersonalizedLearning: !widget.addAccountMode,
              textInputAction: TextInputAction.next,
              enabled: !isLoading,
              onChanged: _clearErrorOnEdit,
              decoration: InputDecoration(
                labelText: 'Email Address',
                hintText: 'e.g. teacher@tms.edu.np',
                prefixIcon: const Icon(Icons.email_outlined),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                filled: true,
                fillColor: kColorSurface,
              ),
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return 'Please enter your email';
                }
                if (!value.contains('@') || !value.contains('.')) {
                  return 'Please enter a valid email address';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),

            // Password Field
            TextFormField(
              controller: _passwordController,
              obscureText: _obscurePassword,
              autofillHints: widget.addAccountMode
                  ? const <String>[]
                  : const [AutofillHints.password],
              autocorrect: false,
              enableSuggestions: false,
              enableIMEPersonalizedLearning: !widget.addAccountMode,
              textInputAction: TextInputAction.done,
              enabled: !isLoading,
              onChanged: _clearErrorOnEdit,
              onFieldSubmitted: (_) => _submitLogin(),
              decoration: InputDecoration(
                labelText: widget.addAccountMode
                    ? 'Password'
                    : 'Password or 4-digit MPIN',
                prefixIcon: const Icon(Icons.lock_outline_rounded),
                suffixIcon: IconButton(
                  icon: Icon(
                    _obscurePassword
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                    color: kColorText.withValues(alpha: 0.6),
                  ),
                  onPressed: isLoading
                      ? null
                      : () {
                          setState(() {
                            _obscurePassword = !_obscurePassword;
                          });
                        },
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                filled: true,
                fillColor: kColorSurface,
              ),
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Please enter your password or MPIN';
                }
                return null;
              },
            ),
            const SizedBox(height: 8),

            Row(
              children: [
                Checkbox(
                  value: _rememberMe,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                  onChanged: isLoading || _loadingRememberedCredentials
                      ? null
                      : (value) async {
                          setState(() => _rememberMe = value ?? false);
                          if (!_rememberMe) {
                            await _credentialsStore.clear();
                          }
                        },
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: InkWell(
                    onTap: isLoading || _loadingRememberedCredentials
                        ? null
                        : () async {
                            setState(() => _rememberMe = !_rememberMe);
                            if (!_rememberMe) {
                              await _credentialsStore.clear();
                            }
                          },
                    child: const Padding(
                      padding: EdgeInsets.symmetric(vertical: 10),
                      child: Text(
                        'Remember me',
                        style: TextStyle(fontSize: 13),
                      ),
                    ),
                  ),
                ),
                const Flexible(
                  flex: 2,
                  child: ForgotPasswordPrompt(),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // Sign In Button
            SizedBox(
              height: 48,
              child: Semantics(
                label: isLoading ? 'Signing in' : 'Sign in',
                button: true,
                child: ElevatedButton(
                  onPressed: isLoading ? null : _submitLogin,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: kColorPrimary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                    elevation: 2,
                  ),
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 160),
                    child: isLoading
                        ? const Row(
                            key: ValueKey('signing-in'),
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.2,
                                  color: Colors.white,
                                ),
                              ),
                              SizedBox(width: 10),
                              Text(
                                'Signing in...',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          )
                        : const Text(
                            'Sign In',
                            key: ValueKey('sign-in'),
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ),
              ),
            ),
            if (isLoading) ...[
              const SizedBox(height: 12),
              Semantics(
                liveRegion: true,
                child: const Text(
                  'Contacting the TMS server...',
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
