import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../data/account_repository.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key, required this.passwordRoute});
  final String passwordRoute;

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  final _repository = AccountRepository();
  late Future<PersonalAccount> _account;
  bool _photoBusy = false;

  String get _mobileRoute =>
      widget.passwordRoute.replaceFirst('/change-password', '/change-mobile');
  String get _emailRoute =>
      widget.passwordRoute.replaceFirst('/change-password', '/change-email');

  @override
  void initState() {
    super.initState();
    _account = _repository.load();
  }

  void _reload() => setState(() => _account = _repository.load());

  Future<void> _changePhoto() async {
    final image = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 82,
      maxWidth: 1200,
      maxHeight: 1200,
    );
    if (image == null || !mounted) return;
    setState(() => _photoBusy = true);
    try {
      final extension = image.name.toLowerCase().split('.').last;
      final mime = extension == 'png'
          ? 'image/png'
          : extension == 'webp'
              ? 'image/webp'
              : 'image/jpeg';
      await _repository.updatePhoto(await image.readAsBytes(), mime);
      if (mounted) {
        _reload();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile picture updated.')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not update profile picture: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  Future<void> _editName(PersonalAccount account) async {
    final first = TextEditingController(text: account.firstName);
    final last = TextEditingController(text: account.lastName);
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Edit profile name'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: first,
              decoration: const InputDecoration(labelText: 'First name'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: last,
              decoration: const InputDecoration(labelText: 'Last name'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              if (first.text.trim().isEmpty || last.text.trim().isEmpty) return;
              try {
                await _repository.updateName(first.text, last.text);
                if (dialogContext.mounted) Navigator.pop(dialogContext, true);
              } catch (_) {
                if (dialogContext.mounted) {
                  ScaffoldMessenger.of(dialogContext).showSnackBar(
                    const SnackBar(
                        content: Text('Could not update your profile.')),
                  );
                }
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
    first.dispose();
    last.dispose();
    if (saved == true) _reload();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Profile settings')),
        body: FutureBuilder<PersonalAccount>(
          future: _account,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError || !snapshot.hasData) {
              return Center(
                child: FilledButton(
                    onPressed: _reload, child: const Text('Retry')),
              );
            }
            final account = snapshot.data!;
            return ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Center(
                  child: Stack(
                    alignment: Alignment.bottomRight,
                    children: [
                      CircleAvatar(
                        radius: 50,
                        foregroundImage: account.photoUrl?.isNotEmpty == true
                            ? NetworkImage(account.photoUrl!)
                            : null,
                        child: account.photoUrl?.isNotEmpty == true
                            ? null
                            : Text(account.initials.isEmpty
                                ? '?'
                                : account.initials),
                      ),
                      IconButton.filled(
                        tooltip: 'Change profile picture',
                        onPressed: _photoBusy ? null : _changePhoto,
                        icon: _photoBusy
                            ? const SizedBox.square(
                                dimension: 18,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.camera_alt_rounded),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  account.name,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                Text(
                  account.institution,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 24),
                _SectionCard(
                  title: 'Personal details',
                  subtitle:
                      'Your name appears on your account and administrative records.',
                  trailing: TextButton(
                    onPressed: () => _editName(account),
                    child: const Text('Edit name'),
                  ),
                  children: [
                    _DetailRow(label: 'Name', value: account.name),
                    _DetailRow(
                      label: 'Institution',
                      value: account.institution.isEmpty
                          ? 'No institution assigned'
                          : account.institution,
                    ),
                    _DetailRow(
                      label: 'Roles & branches',
                      value: account.roles.isEmpty
                          ? 'No role assigned'
                          : account.roles
                              .map((role) => role.branchId == null
                                  ? '${role.name} · Institution-wide assignment'
                                  : '${role.name} · ${role.branchName ?? 'Assigned branch unavailable'}')
                              .join('\n'),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                _SectionCard(
                  title: 'Sign-in & security',
                  subtitle:
                      'Your contact verification and sign-in protection are managed separately.',
                  children: [
                    _DetailRow(
                      label: 'Login email',
                      value: account.email,
                      status: account.emailVerified
                          ? 'Verified'
                          : 'Verification not recorded',
                      verified: account.emailVerified,
                    ),
                    _DetailRow(
                      label: 'Security mobile',
                      value: account.phone.isEmpty
                          ? 'No mobile number saved'
                          : account.phone,
                      status: account.mobileVerified
                          ? 'Verified'
                          : 'Verification required',
                      verified: account.mobileVerified,
                    ),
                    _DetailRow(
                      label: 'Two-step sign-in',
                      value:
                          account.twoFactorEnabled ? 'Enabled' : 'Not enabled',
                      status: account.twoFactorEnabled
                          ? 'Protected'
                          : 'Optional protection',
                      verified: account.twoFactorEnabled,
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Card(
                  child: Column(
                    children: [
                      ListTile(
                        leading: const Icon(Icons.alternate_email_rounded),
                        title: const Text('Change login email'),
                        subtitle: const Text('Current password required'),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: () => context.push(_emailRoute),
                      ),
                      const Divider(height: 1),
                      ListTile(
                        leading: const Icon(Icons.phone_android_rounded),
                        title: const Text('Change mobile number'),
                        subtitle: const Text(
                            'Password and SMS verification required'),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        enabled: account.canManageSecurityMobile,
                        onTap: () => context.push(_mobileRoute),
                      ),
                      const Divider(height: 1),
                      ListTile(
                        leading: const Icon(Icons.lock_outline_rounded),
                        title: const Text('Change password'),
                        subtitle: const Text('Current password required'),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: () => context.push(widget.passwordRoute),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      );
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.title,
    required this.subtitle,
    required this.children,
    this.trailing,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                      child: Text(title,
                          style: Theme.of(context).textTheme.titleLarge)),
                  if (trailing != null) trailing!,
                ],
              ),
              const SizedBox(height: 4),
              Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 12),
              ...children,
            ],
          ),
        ),
      );
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
    this.status,
    this.verified = false,
  });

  final String label;
  final String value;
  final String? status;
  final bool verified;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
                width: 112,
                child:
                    Text(label, style: Theme.of(context).textTheme.bodySmall)),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(value,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  if (status != null) ...[
                    const SizedBox(height: 5),
                    Text(
                      status!,
                      style: TextStyle(
                        color: verified
                            ? Colors.green.shade700
                            : Colors.orange.shade800,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      );
}
