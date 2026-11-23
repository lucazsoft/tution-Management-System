/// Student event updates and current portal alerts, with separate source IDs.
/// Both sources keep their existing server records/read endpoints. No record is
/// migrated, discarded or silently deduplicated against another event.
library;

import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/network/api_client.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/providers/auth_provider.dart';
import 'package:tms_mobile/core/network/request_cancellation.dart';
import 'package:tms_mobile/core/viewmodel/base_viewmodel.dart';
import '../data/student_id_calendar_notifications_repository.dart';
import '../models/student_portal_dto.dart';

enum NotificationSource { account, portal }

@immutable
class InboxNotice {
  const InboxNotice({required this.raw, required this.isRead, this.source = NotificationSource.portal});
  final PortalNotification raw;
  final bool isRead;
  final NotificationSource source;
  String get identity => '${source.name}:${raw.id}';
}

@immutable
class StudentNotificationsState extends ViewModelState {
  const StudentNotificationsState({this.notices = const [], this.unreadOnly = false,
    this.isDenied = false, this.isOffline = false, super.error, super.isLoading});
  final List<InboxNotice> notices;
  final bool unreadOnly;
  final bool isDenied;
  final bool isOffline;
  int get unreadCount => notices.where((notice) => !notice.isRead).length;
  List<InboxNotice> get visible => unreadOnly ? notices.where((notice) => !notice.isRead).toList() : notices;
  bool get isEmpty => notices.isEmpty;
  StudentNotificationsState copyWith({List<InboxNotice>? notices, bool? unreadOnly,
    bool? isDenied, bool? isOffline, bool? isLoading, String? error, bool clearError = false}) {
    return StudentNotificationsState(notices: notices ?? this.notices,
      unreadOnly: unreadOnly ?? this.unreadOnly, isDenied: isDenied ?? this.isDenied,
      isOffline: isOffline ?? this.isOffline, isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : error ?? this.error);
  }
}

class _LoadedInbox {
  const _LoadedInbox(this.notices, this.warning);
  final List<InboxNotice> notices;
  final String? warning;
}

class StudentNotificationsViewModel extends BaseViewModel<StudentNotificationsState> {
  StudentNotificationsViewModel({StudentIdCalendarNotificationsRepository? repository})
      : _repository = repository ?? StudentIdCalendarNotificationsRepository(dio: ApiClient.instance.dio),
        super(const StudentNotificationsState(isLoading: true)) { load(); }
  final StudentIdCalendarNotificationsRepository _repository;
  final RequestCanceller _canceller = RequestCanceller();
  final Set<String> _localReadIds = <String>{};
  static const _readSyncWarning = 'Some read changes have not synced. Retry mark-all when connected.';

  Future<void> load() async {
    _canceller.cancel('notifications');
    final token = _canceller.tokenFor('notifications');
    state = state.copyWith(isLoading: true, clearError: true, isDenied: false, isOffline: false);
    try {
      final loaded = await _loadInbox(cancelToken: token);
      if (!mounted || token.isCancelled) return;
      final warning = loaded.warning ?? (_localReadIds.isNotEmpty ? _readSyncWarning : null);
      state = state.copyWith(isLoading: false, notices: [
        for (final notice in loaded.notices) InboxNotice(raw: notice.raw, source: notice.source,
          isRead: notice.isRead || _localReadIds.contains(notice.identity)),
      ], error: warning, clearError: warning == null);
    } on ApiException catch (error) {
      if (error.kind == ApiErrorKind.cancelled || !mounted) return;
      state = state.copyWith(isLoading: false, error: error.message,
        isDenied: error.kind == ApiErrorKind.forbidden, isOffline: error.kind == ApiErrorKind.noConnection);
    } catch (_) {
      if (!mounted) return;
      state = state.copyWith(isLoading: false, error: 'Could not load notifications. Please retry.');
    }
  }
  Future<void> refresh() => load();
  void setUnreadOnly(bool value) => state = state.copyWith(unreadOnly: value);

  NotificationSource _sourceFor(String id) {
    for (final notice in state.notices) { if (notice.raw.id == id) return notice.source; }
    return NotificationSource.portal;
  }

  Future<void> markRead(String id, {NotificationSource? source}) async {
    final selected = source ?? _sourceFor(id);
    final identity = '${selected.name}:$id';
    _localReadIds.add(identity);
    state = state.copyWith(notices: [
      for (final notice in state.notices)
        InboxNotice(raw: notice.raw, source: notice.source,
          isRead: notice.isRead || notice.identity == identity),
    ]);
    try {
      if (selected == NotificationSource.account) { await _repository.markNotificationRead(id); }
      else { await _repository.markPortalNotificationsRead([id]); }
      _localReadIds.remove(identity);
      if (mounted && _localReadIds.isEmpty && state.error == _readSyncWarning) state = state.copyWith(clearError: true);
    } on ApiException {
      if (mounted) state = state.copyWith(error: _readSyncWarning);
    }
  }

  Future<void> markAllRead() async {
    _localReadIds.addAll(state.notices.map((notice) => notice.identity));
    state = state.copyWith(notices: [for (final notice in state.notices)
      InboxNotice(raw: notice.raw, source: notice.source, isRead: true)]);
    var failed = false;
    if (_repository.supportsPersistentInbox) {
      try {
        await _repository.markAllNotificationsRead();
        _localReadIds.removeWhere((id) => id.startsWith('account:'));
      } on ApiException { failed = true; }
    }
    final portalIds = state.notices.where((notice) => notice.source == NotificationSource.portal)
      .map((notice) => notice.raw.id).toList();
    if (portalIds.isNotEmpty) {
      try {
        await _repository.markPortalNotificationsRead(portalIds);
        for (final id in portalIds) { _localReadIds.remove('portal:$id'); }
      } on ApiException { failed = true; }
    }
    if (!mounted) return;
    if (failed) { state = state.copyWith(error: _readSyncWarning); }
    else if (_localReadIds.isEmpty && state.error == _readSyncWarning) { state = state.copyWith(clearError: true); }
  }

  Future<_LoadedInbox> _loadInbox({required CancelToken cancelToken}) async {
    final notices = <InboxNotice>[];
    ApiException? firstError;
    var unavailable = false;
    if (_repository.supportsPersistentInbox) {
      try {
        final page = await _repository.fetchPersistentNotifications(pageSize: 50, cancelToken: cancelToken);
        notices.addAll(page.items.map((item) {
          final raw = item.toPortalNotification();
          return InboxNotice(raw: raw, isRead: !raw.unread, source: NotificationSource.account);
        }));
      } on ApiException catch (error) {
        if (error.kind == ApiErrorKind.cancelled) rethrow;
        firstError = error; unavailable = true;
      }
    }
    try {
      final portal = await _repository.fetchNotifications(cancelToken: cancelToken);
      notices.addAll(portal.map((raw) => InboxNotice(raw: raw, isRead: !raw.unread, source: NotificationSource.portal)));
    } on ApiException catch (error) {
      if (error.kind == ApiErrorKind.cancelled) rethrow;
      firstError ??= error; unavailable = true;
    }
    if (notices.isEmpty && firstError != null) throw firstError;
    return _LoadedInbox(notices, unavailable ? 'Some notification sources could not be loaded. Pull to refresh.' : null);
  }

  @override
  void dispose() { _canceller.cancelAll(); super.dispose(); }
}

final studentNotificationsViewModelProvider = StateNotifierProvider<StudentNotificationsViewModel, StudentNotificationsState>((ref) {
  ref.watch(authProvider.select((state) => state.user?.id));
  return StudentNotificationsViewModel();
});
