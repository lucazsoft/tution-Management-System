/// Student notifications inbox ViewModel (MVVM, MOB-104).
///
/// Primary source is the server-persisted inbox `GET /api/notifications`
/// (newest first, `readAt` read state) when the repository is wired with an
/// HTTP client; the derived notices from `GET /api/users/me/student-portal`
/// remain the offline fallback. Read state is persisted server-side via
/// `POST /api/notifications/:id/read` and `/read-all`, with the local
/// in-memory set kept as the optimistic layer when the network fails.
library;

import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/core/network/request_cancellation.dart';
import 'package:tms_mobile/core/viewmodel/base_viewmodel.dart';

import '../data/student_id_calendar_notifications_repository.dart';
import '../models/student_portal_dto.dart';

/// One inbox row with effective read state applied.
@immutable
class InboxNotice {
  const InboxNotice({required this.raw, required this.isRead});

  final PortalNotification raw;
  final bool isRead;
}

@immutable
class StudentNotificationsState extends ViewModelState {
  const StudentNotificationsState({
    this.notices = const [],
    this.unreadOnly = false,
    this.isDenied = false,
    this.isOffline = false,
    super.error,
    super.isLoading,
  });

  final List<InboxNotice> notices;
  final bool unreadOnly;
  final bool isDenied;
  final bool isOffline;

  int get unreadCount => notices.where((notice) => !notice.isRead).length;

  List<InboxNotice> get visible =>
      unreadOnly ? notices.where((notice) => !notice.isRead).toList() : notices;

  bool get isEmpty => notices.isEmpty;

  StudentNotificationsState copyWith({
    List<InboxNotice>? notices,
    bool? unreadOnly,
    bool? isDenied,
    bool? isOffline,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return StudentNotificationsState(
      notices: notices ?? this.notices,
      unreadOnly: unreadOnly ?? this.unreadOnly,
      isDenied: isDenied ?? this.isDenied,
      isOffline: isOffline ?? this.isOffline,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class StudentNotificationsViewModel
    extends BaseViewModel<StudentNotificationsState> {
  StudentNotificationsViewModel({
    StudentIdCalendarNotificationsRepository? repository,
  })  : _repository = repository ?? StudentIdCalendarNotificationsRepository(),
        super(const StudentNotificationsState(isLoading: true)) {
    load();
  }

  final StudentIdCalendarNotificationsRepository _repository;
  final RequestCanceller _canceller = RequestCanceller();

  /// Ids the user has marked read locally this session.
  final Set<String> _localReadIds = <String>{};

  List<InboxNotice> _applyReadState(List<PortalNotification> raw) => [
        for (final notice in raw)
          InboxNotice(
            raw: notice,
            isRead: !notice.unread || _localReadIds.contains(notice.id),
          ),
      ];

  Future<void> load() async {
    _canceller.cancel('notifications');
    final token = _canceller.tokenFor('notifications');
    state = state.copyWith(
      isLoading: true,
      clearError: true,
      isDenied: false,
      isOffline: false,
    );
    try {
      final raw = await _loadInbox(cancelToken: token);
      state = state.copyWith(
        isLoading: false,
        notices: _applyReadState(raw),
        clearError: true,
      );
    } on ApiException catch (e) {
      if (e.kind == ApiErrorKind.cancelled) return;
      state = state.copyWith(
        isLoading: false,
        error: e.message,
        isDenied: e.kind == ApiErrorKind.forbidden,
        isOffline: e.kind == ApiErrorKind.noConnection,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Failed to load notifications: $e',
      );
    }
  }

  Future<void> refresh() => load();

  void setUnreadOnly(bool value) {
    state = state.copyWith(unreadOnly: value);
  }

  /// Marks one notice read: optimistic locally, then persisted server-side.
  /// A network failure keeps the local state (offline cache fallback) and
  /// never surfaces an error.
  Future<void> markRead(String id) async {
    if (_localReadIds.add(id)) {
      state = state.copyWith(
        notices: [
          for (final notice in state.notices)
            if (notice.raw.id == id)
              InboxNotice(raw: notice.raw, isRead: true)
            else
              notice,
        ],
      );
    }
    try {
      await _repository.markNotificationRead(id);
    } on ApiException {
      // Local optimistic state stands in for the server (offline fallback).
    }
  }

  /// Marks every loaded notice read: optimistic locally, then persisted
  /// server-side with the same offline fallback as [markRead].
  Future<void> markAllRead() async {
    _localReadIds.addAll(state.notices.map((notice) => notice.raw.id));
    state = state.copyWith(
      notices: [
        for (final notice in state.notices)
          InboxNotice(raw: notice.raw, isRead: true),
      ],
    );
    try {
      await _repository.markAllNotificationsRead();
    } on ApiException {
      // Local optimistic state stands in for the server (offline fallback).
    }
  }

  /// Server-persisted inbox first, portal-derived notices as the fallback
  /// (offline cache path and repositories wired without an HTTP client).
  Future<List<PortalNotification>> _loadInbox({
    required CancelToken cancelToken,
  }) async {
    if (_repository.supportsPersistentInbox) {
      try {
        final page = await _repository.fetchPersistentNotifications(
          cancelToken: cancelToken,
        );
        return [
          for (final item in page.items) item.toPortalNotification(),
        ];
      } on ApiException {
        // Fall through to the portal-derived inbox below.
      }
    }
    return _repository.fetchNotifications(cancelToken: cancelToken);
  }

  @override
  void dispose() {
    _canceller.cancelAll();
    super.dispose();
  }
}

final studentNotificationsViewModelProvider = StateNotifierProvider<
    StudentNotificationsViewModel, StudentNotificationsState>((ref) {
  return StudentNotificationsViewModel();
});
