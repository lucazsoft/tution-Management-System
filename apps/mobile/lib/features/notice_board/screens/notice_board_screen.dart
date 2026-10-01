import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tms_mobile/features/notice_board/data/notice_board_repository.dart';
import 'package:tms_mobile/features/parent/widgets/parent_navigation.dart';
import 'package:tms_mobile/features/student/widgets/student_scaffold.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_navigation.dart';

enum NoticeBoardPortal { parent, teacher, student, tenantAdmin }

class NoticeBoardScreen extends StatefulWidget {
  const NoticeBoardScreen({super.key, required this.portal});

  final NoticeBoardPortal portal;

  @override
  State<NoticeBoardScreen> createState() => _NoticeBoardScreenState();
}

class _NoticeBoardScreenState extends State<NoticeBoardScreen> {
  final _repository = NoticeBoardRepository();
  List<SchoolNotice>? _notices;
  String? _error;

  bool get _canManage => widget.portal == NoticeBoardPortal.tenantAdmin;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final notices = await _repository.fetchNotices();
      if (mounted) setState(() => _notices = notices);
    } on DioException catch (error) {
      if (mounted) {
        setState(() => _error = error.message ?? 'Could not load notices.');
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not load notices.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final content = RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          Text('School notice board',
              style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          const Text(
            'Official school updates, holidays, examination routines and general announcements.',
          ),
          const SizedBox(height: 16),
          ..._buildContent(context),
        ],
      ),
    );
    final fab = _canManage
        ? FloatingActionButton.extended(
            onPressed: _compose,
            icon: const Icon(Icons.campaign_outlined),
            label: const Text('Publish notice'),
          )
        : null;

    return switch (widget.portal) {
      NoticeBoardPortal.teacher => TeacherPortalScaffold(
          title: 'Notice board', body: content, floatingActionButton: fab),
      NoticeBoardPortal.parent => Scaffold(
          drawer: ParentNavigation.drawer(context),
          appBar: AppBar(title: const Text('Notice board')),
          body: SafeArea(child: content),
          bottomNavigationBar: const ParentNavigationBar(selectedIndex: 0),
          floatingActionButton: fab,
        ),
      NoticeBoardPortal.student => StudentScaffold(
          title: 'Notice board', body: content, floatingActionButton: fab),
      NoticeBoardPortal.tenantAdmin => Scaffold(
          appBar: AppBar(title: const Text('Manage notice board')),
          body: SafeArea(child: content),
          floatingActionButton: fab,
        ),
    };
  }

  List<Widget> _buildContent(BuildContext context) {
    if (_notices == null && _error == null) {
      return const [Center(child: CircularProgressIndicator())];
    }
    if (_error != null) {
      return [
        Card(
          child: ListTile(
            leading: const Icon(Icons.cloud_off_outlined),
            title: const Text('Notices are unavailable'),
            subtitle: Text(_error!),
            trailing: IconButton(
              tooltip: 'Retry',
              onPressed: _load,
              icon: const Icon(Icons.refresh),
            ),
          ),
        ),
      ];
    }
    if (_notices!.isEmpty) {
      return const [
        Card(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(children: [
              Icon(Icons.campaign_outlined, size: 44),
              SizedBox(height: 12),
              Text('No notices have been published yet.'),
            ]),
          ),
        ),
      ];
    }
    return [
      for (final notice in _notices!) ...[
        Card(
          clipBehavior: Clip.antiAlias,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const CircleAvatar(child: Icon(Icons.campaign_outlined)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(notice.title,
                            style: Theme.of(context).textTheme.titleMedium),
                        Text(
                          '${DateFormat('d MMM yyyy, h:mm a').format(notice.createdAt.toLocal())} · ${notice.authorName}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  if (_canManage)
                    IconButton(
                      tooltip: 'Delete notice',
                      onPressed: () => _delete(notice),
                      icon: const Icon(Icons.delete_outline),
                    ),
                ]),
                const SizedBox(height: 12),
                Text(notice.message),
                if (_canManage) ...[
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 6,
                    children: (notice.audienceRoles.isEmpty
                            ? const ['Everyone']
                            : notice.audienceRoles)
                        .map((role) => Chip(label: Text(role)))
                        .toList(),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
      ],
    ];
  }

  Future<void> _compose() async {
    final result = await showDialog<_NoticeDraft>(
      context: context,
      builder: (context) => const _NoticeComposer(),
    );
    if (result == null) return;
    try {
      await _repository.publish(
        title: result.title,
        message: result.message,
        audienceRoles: result.audiences,
      );
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Notice published successfully.')),
        );
      }
    } on DioException catch (error) {
      if (mounted) _showFailure(error.message ?? 'Could not publish notice.');
    }
  }

  Future<void> _delete(SchoolNotice notice) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete notice?'),
        content: Text('“${notice.title}” will be removed for every portal.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _repository.delete(notice.id);
      await _load();
    } on DioException catch (error) {
      if (mounted) _showFailure(error.message ?? 'Could not delete notice.');
    }
  }

  void _showFailure(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }
}

class _NoticeDraft {
  const _NoticeDraft(this.title, this.message, this.audiences);
  final String title;
  final String message;
  final List<String> audiences;
}

class _NoticeComposer extends StatefulWidget {
  const _NoticeComposer();

  @override
  State<_NoticeComposer> createState() => _NoticeComposerState();
}

class _NoticeComposerState extends State<_NoticeComposer> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _message = TextEditingController();
  final _selected = <String>{'Parent', 'Teacher', 'Student'};

  @override
  void dispose() {
    _title.dispose();
    _message.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Publish school notice'),
        content: SizedBox(
          width: 520,
          child: Form(
            key: _formKey,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                TextFormField(
                  controller: _title,
                  maxLength: 160,
                  decoration: const InputDecoration(
                    labelText: 'Notice title',
                    hintText: 'Example: Dashain holiday schedule',
                  ),
                  validator: (value) => value?.trim().isEmpty == true
                      ? 'Enter a notice title.'
                      : null,
                ),
                TextFormField(
                  controller: _message,
                  minLines: 4,
                  maxLines: 8,
                  maxLength: 4000,
                  decoration: const InputDecoration(
                    labelText: 'Notice details',
                    alignLabelWithHint: true,
                  ),
                  validator: (value) => value?.trim().isEmpty == true
                      ? 'Enter the notice details.'
                      : null,
                ),
                const Align(
                    alignment: Alignment.centerLeft, child: Text('Visible to')),
                Wrap(
                  spacing: 8,
                  children: ['Parent', 'Teacher', 'Student']
                      .map((role) => FilterChip(
                            label: Text(role),
                            selected: _selected.contains(role),
                            onSelected: (selected) => setState(() => selected
                                ? _selected.add(role)
                                : _selected.remove(role)),
                          ))
                      .toList(),
                ),
              ]),
            ),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          FilledButton.icon(
            onPressed: () {
              if (!_formKey.currentState!.validate()) return;
              if (_selected.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                      content: Text('Select at least one audience.')),
                );
                return;
              }
              Navigator.pop(
                context,
                _NoticeDraft(_title.text.trim(), _message.text.trim(),
                    _selected.toList()),
              );
            },
            icon: const Icon(Icons.publish_outlined),
            label: const Text('Publish'),
          ),
        ],
      );
}
