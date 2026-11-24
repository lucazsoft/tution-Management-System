import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';
import 'package:tms_mobile/features/teacher/screens/daily_update_screen.dart';
import 'package:tms_mobile/features/teacher/viewmodels/teacher_portal_viewmodel.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_record_states.dart';

String _dateInput([DateTime? date]) {
  final d = date ?? DateTime.now();
  return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

String _formatDate(DateTime dt) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ];
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return '${weekdays[dt.weekday - 1]}, ${dt.day} ${months[dt.month - 1]}';
}

String _todayDayKey() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days[DateTime.now().weekday - 1];
}

class _FlattenedTopic {
  const _FlattenedTopic({
    required this.id,
    required this.title,
    required this.status,
    required this.syllabusId,
    required this.subject,
    required this.chapterId,
    required this.chapterTitle,
    required this.chapterPosition,
    required this.logs,
  });

  final String id;
  final String title;
  final String status;
  final String syllabusId;
  final String subject;
  final String chapterId;
  final String chapterTitle;
  final int chapterPosition;
  final List<TeacherTopicLog> logs;

  TeacherTopicLog? get todayLog {
    final today = _dateInput();
    for (final log in logs) {
      if (_dateInput(log.logDate) == today) return log;
    }
    return null;
  }
}

/// Comprehensive daily updates screen allowing teachers to track all their
/// classes and subjects in chronological order, with subject filtering ("All" by default),
/// topic selection before progress tracking, scrollable topic queue with number-line layout,
/// local draft persistence (just like publishing results), and a unified bottom publish bar.
class TeacherDailyUpdatesScreen extends ConsumerStatefulWidget {
  const TeacherDailyUpdatesScreen({super.key});

  @override
  ConsumerState<TeacherDailyUpdatesScreen> createState() =>
      _TeacherDailyUpdatesScreenState();
}

class _TeacherDailyUpdatesScreenState
    extends ConsumerState<TeacherDailyUpdatesScreen> {
  String _selectedSubjectFilter = 'All';
  final Map<String, String> _activeTopicPerClass = {};
  final Map<String, String> _selectedChapterPerClass = {};
  final Map<String, String> _draftStatusPerClass = {};
  final Map<String, String> _notesPerTopic = {};
  final Map<String, TextEditingController> _noteControllers = {};
  final Map<String, ({String status, DateTime at})> _savedPerTopic = {};
  final Map<String, ScrollController> _topicScrollControllers = {};

  Timer? _draftSaveTimer;
  bool _isRestoringDraft = false;
  bool _isDraftSaved = true;
  bool _isPublishingAll = false;
  int _publishCurrent = 0;

  String _draftKey() => 'teacher_daily_updates_draft_${_dateInput()}';

  TextEditingController _getNoteController(String topicId) {
    var controller = _noteControllers[topicId];
    if (controller == null) {
      final initialText = _notesPerTopic[topicId] ?? '';
      controller = TextEditingController(text: initialText);
      _noteControllers[topicId] = controller;
    }
    return controller;
  }

  @override
  void initState() {
    super.initState();
    _initSelection();
    _restoreDraft();
  }

  @override
  void dispose() {
    _draftSaveTimer?.cancel();
    unawaited(_saveDraftNow());
    for (final c in _topicScrollControllers.values) {
      c.dispose();
    }
    for (final c in _noteControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _scheduleDraftSave() {
    if (_isRestoringDraft) return;
    if (_isDraftSaved) {
      setState(() => _isDraftSaved = false);
    }
    _draftSaveTimer?.cancel();
    _draftSaveTimer = Timer(const Duration(milliseconds: 300), () {
      _saveDraftNow();
    });
  }

  Future<void> _saveDraftNow() async {
    if (_isRestoringDraft) return;
    try {
      // Sync all controllers
      for (final entry in _noteControllers.entries) {
        _notesPerTopic[entry.key] = entry.value.text;
      }
      final prefs = await SharedPreferences.getInstance();
      final data = jsonEncode({
        'activeTopics': _activeTopicPerClass,
        'draftStatuses': _draftStatusPerClass,
        'notes': _notesPerTopic,
        'savedAt': DateTime.now().toIso8601String(),
      });
      await prefs.setString(_draftKey(), data);
      await prefs.setString('teacher_daily_updates_draft_latest', data);
      if (mounted) {
        setState(() => _isDraftSaved = true);
      }
    } catch (_) {}
  }

  Future<void> _restoreDraft() async {
    _isRestoringDraft = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      var raw = prefs.getString(_draftKey());
      raw ??= prefs.getString('teacher_daily_updates_draft_latest');
      if (raw != null) {
        final decoded = jsonDecode(raw);
        if (decoded is Map<String, dynamic>) {
          final active = decoded['activeTopics'];
          if (active is Map<String, dynamic>) {
            for (final e in active.entries) {
              _activeTopicPerClass[e.key] = e.value.toString();
            }
          }
          final statuses = decoded['draftStatuses'];
          if (statuses is Map<String, dynamic>) {
            for (final e in statuses.entries) {
              _draftStatusPerClass[e.key] = e.value.toString();
            }
          }
          final notes = decoded['notes'];
          if (notes is Map<String, dynamic>) {
            for (final e in notes.entries) {
              final topicId = e.key.toString();
              final note = e.value?.toString() ?? '';
              _notesPerTopic[topicId] = note;
              if (_noteControllers.containsKey(topicId)) {
                _noteControllers[topicId]!.text = note;
              } else {
                _noteControllers[topicId] = TextEditingController(text: note);
              }
            }
          }
        }
      }
    } catch (_) {} finally {
      _isRestoringDraft = false;
      if (mounted) setState(() {});
    }
  }

  void _initSelection() {
    final workspace = ref.read(teacherPortalViewModelProvider).workspace;
    if (workspace == null || workspace.classes.isEmpty) return;

    for (final klass in workspace.classes) {
      final topics = _flattenTopics(klass);
      final rec = _recommendedTopic(topics);
      if (rec != null) {
        _activeTopicPerClass[klass.id] = rec.id;
        final todayLog = rec.todayLog;
        _draftStatusPerClass[klass.id] =
            rec.status == 'LEFT' && todayLog == null
                ? 'IN_PROGRESS'
                : rec.status;
        if (todayLog?.notes != null && todayLog!.notes!.isNotEmpty) {
          _notesPerTopic[rec.id] = todayLog.notes!;
          if (_noteControllers.containsKey(rec.id)) {
            _noteControllers[rec.id]!.text = todayLog.notes!;
          }
        }
        _selectedChapterPerClass[klass.id] = 'ALL';
      }
    }
  }

  List<_FlattenedTopic> _flattenTopics(TeacherClassInfo? klass) {
    if (klass == null) return const [];
    final list = <_FlattenedTopic>[];
    for (final syllabus in klass.syllabi) {
      for (final chapter in syllabus.chapters) {
        for (final topic in chapter.topics) {
          list.add(
            _FlattenedTopic(
              id: topic.id,
              title: topic.title,
              status: topic.status,
              syllabusId: syllabus.id,
              subject: syllabus.subject,
              chapterId: chapter.id,
              chapterTitle: chapter.title,
              chapterPosition: chapter.position,
              logs: topic.logs,
            ),
          );
        }
      }
    }
    return list;
  }

  _FlattenedTopic? _recommendedTopic(List<_FlattenedTopic> topics) {
    if (topics.isEmpty) return null;
    return topics.cast<_FlattenedTopic?>().firstWhere(
          (t) => t?.status == 'IN_PROGRESS',
          orElse: () => topics.cast<_FlattenedTopic?>().firstWhere(
                (t) => t?.status == 'LEFT',
                orElse: () => topics.first,
              ),
        );
  }

  List<_FlattenedTopic> _sortTopicsNumberLine(
      List<_FlattenedTopic> topics, String? activeTopicId) {
    if (topics.isEmpty) return topics;

    final completed = <_FlattenedTopic>[];
    final active = <_FlattenedTopic>[];
    final pending = <_FlattenedTopic>[];

    for (final t in topics) {
      if (t.id == activeTopicId) {
        active.add(t);
      } else if (t.status == 'COMPLETED') {
        completed.add(t);
      } else if (t.status == 'IN_PROGRESS') {
        active.add(t);
      } else {
        pending.add(t);
      }
    }

    int comparePos(_FlattenedTopic a, _FlattenedTopic b) {
      final c = a.chapterPosition.compareTo(b.chapterPosition);
      if (c != 0) return c;
      return a.title.compareTo(b.title);
    }

    completed.sort(comparePos);
    pending.sort(comparePos);

    return [...completed, ...active, ...pending];
  }

  ScrollController _getOrCreateTopicController(
      String classId, double initialOffset) {
    if (!_topicScrollControllers.containsKey(classId)) {
      _topicScrollControllers[classId] = ScrollController(
        initialScrollOffset: initialOffset,
      );
    }
    return _topicScrollControllers[classId]!;
  }

  String _classStartTime(
      TeacherClassInfo klass, List<TeacherTodayClass> todayClasses) {
    final dayKey = _todayDayKey();
    final todayMatch =
        todayClasses.cast<TeacherTodayClass?>().firstWhere(
              (tc) => tc?.classId == klass.id,
              orElse: () => null,
            );
    if (todayMatch != null) {
      final todaySlot = todayMatch.slots
          .cast<TeacherScheduleSlot?>()
          .firstWhere((s) => s?.matchesDay(dayKey) == true, orElse: () => null);
      if (todaySlot != null && todaySlot.start.isNotEmpty) {
        return todaySlot.start;
      }
    }

    final classSlot = klass.slots
        .cast<TeacherScheduleSlot?>()
        .firstWhere((s) => s?.matchesDay(dayKey) == true, orElse: () => null);
    if (classSlot != null && classSlot.start.isNotEmpty) {
      return classSlot.start;
    }

    if (klass.slots.isNotEmpty && klass.slots.first.start.isNotEmpty) {
      return klass.slots.first.start;
    }
    return '99:99';
  }

  String _classScheduleLabel(
      TeacherClassInfo klass, List<TeacherTodayClass> todayClasses) {
    final dayKey = _todayDayKey();
    final todayMatch =
        todayClasses.cast<TeacherTodayClass?>().firstWhere(
              (tc) => tc?.classId == klass.id,
              orElse: () => null,
            );
    if (todayMatch != null) {
      final todaySlot = todayMatch.slots
          .cast<TeacherScheduleSlot?>()
          .firstWhere((s) => s?.matchesDay(dayKey) == true, orElse: () => null);
      if (todaySlot != null && todaySlot.timeLabel.isNotEmpty) {
        return todaySlot.timeLabel;
      }
      if (todayMatch.scheduleLabel != null &&
          todayMatch.scheduleLabel!.isNotEmpty) {
        return todayMatch.scheduleLabel!;
      }
    }

    final classSlot = klass.slots
        .cast<TeacherScheduleSlot?>()
        .firstWhere((s) => s?.matchesDay(dayKey) == true, orElse: () => null);
    if (classSlot != null && classSlot.timeLabel.isNotEmpty) {
      return classSlot.timeLabel;
    }

    return klass.scheduleLabel ?? 'Today';
  }

  void _onTopicSelected(
      TeacherClassInfo klass, _FlattenedTopic topic, [int? index]) {
    final todayLog = topic.todayLog;
    setState(() {
      _activeTopicPerClass[klass.id] = topic.id;
      _draftStatusPerClass[klass.id] =
          topic.status == 'LEFT' && todayLog == null
              ? 'IN_PROGRESS'
              : topic.status;
      if (todayLog?.notes != null && todayLog!.notes!.isNotEmpty) {
        _notesPerTopic[topic.id] = todayLog.notes!;
      }
      _savedPerTopic.remove(topic.id);
    });

    _scheduleDraftSave();

    if (index != null) {
      final controller = _topicScrollControllers[klass.id];
      if (controller != null && controller.hasClients) {
        final targetOffset =
            (index * 206.0).clamp(0.0, controller.position.maxScrollExtent);
        controller.animateTo(
          targetOffset,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOutCubic,
        );
      }
    }
  }

  List<TeacherPendingUpdate> _getAllPendingUpdates(TeacherWorkspace workspace) {
    final result = <TeacherPendingUpdate>[];
    final seenClassIds = <String>{};

    // 1. From workspace.pendingUpdates
    for (final p in workspace.pendingUpdates) {
      String resolvedClassName = p.className.trim();
      String resolvedCourseName = p.courseName.trim();
      final matchingClass = workspace.classes
          .cast<TeacherClassInfo?>()
          .firstWhere((c) => c?.id == p.classId, orElse: () => null);
      if (resolvedClassName.isEmpty && matchingClass != null) {
        resolvedClassName = matchingClass.name;
      }
      if (resolvedCourseName.isEmpty && matchingClass != null) {
        resolvedCourseName = matchingClass.subject;
      }
      if (p.classId.isNotEmpty) {
        seenClassIds.add(p.classId);
      }
      result.add(TeacherPendingUpdate(
        sessionId: p.sessionId,
        classId: p.classId,
        className: resolvedClassName.isNotEmpty ? resolvedClassName : 'Class',
        courseName:
            resolvedCourseName.isNotEmpty ? resolvedCourseName : 'Course',
        date: p.date,
      ));
    }

    // 2. From workspace.todayClasses (where dailyUpdateSubmitted == false)
    for (final tc in workspace.todayClasses) {
      if (!tc.dailyUpdateSubmitted) {
        String resolvedClassName = tc.className.trim();
        String resolvedCourseName = tc.courseName.trim();
        final matchingClass = workspace.classes
            .cast<TeacherClassInfo?>()
            .firstWhere((c) => c?.id == tc.classId, orElse: () => null);
        if (resolvedClassName.isEmpty && matchingClass != null) {
          resolvedClassName = matchingClass.name;
        }
        if (resolvedCourseName.isEmpty && matchingClass != null) {
          resolvedCourseName = matchingClass.subject;
        }
        if (tc.classId.isNotEmpty && !seenClassIds.contains(tc.classId)) {
          seenClassIds.add(tc.classId);
          result.add(TeacherPendingUpdate(
            sessionId: tc.sessionId,
            classId: tc.classId,
            className:
                resolvedClassName.isNotEmpty ? resolvedClassName : 'Class',
            courseName:
                resolvedCourseName.isNotEmpty ? resolvedCourseName : 'Course',
            date: DateTime.now(),
          ));
        }
      }
    }

    // 3. From scheduled classes today where no topic was updated today
    final todayKey = _todayDayKey();
    for (final klass in workspace.classes) {
      final isScheduledToday = klass.isScheduledOn(todayKey) ||
          workspace.todayClasses.any((tc) => tc.classId == klass.id);
      if (isScheduledToday && !seenClassIds.contains(klass.id)) {
        final topics = _flattenTopics(klass);
        final hasLogToday = topics.any((t) => t.todayLog != null);
        if (!hasLogToday) {
          seenClassIds.add(klass.id);
          result.add(TeacherPendingUpdate(
            sessionId: 'class-${klass.id}-${_dateInput()}',
            classId: klass.id,
            className: klass.name.isNotEmpty ? klass.name : 'Class',
            courseName: klass.subject.isNotEmpty ? klass.subject : 'Course',
            date: DateTime.now(),
          ));
        }
      }
    }

    return result;
  }

  void _showPendingUpdatesSheet(
      BuildContext context, TeacherWorkspace workspace) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        final pendingList = _getAllPendingUpdates(workspace);
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.65,
          minChildSize: 0.4,
          maxChildSize: 0.9,
          builder: (_, scrollController) {
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade300,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFEDD5),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(
                          Icons.pending_actions_rounded,
                          color: Color(0xFFEA580C),
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Pending Updates',
                              style: GoogleFonts.fraunces(
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            Text(
                              '${pendingList.length} ${pendingList.length == 1 ? 'class session requires' : 'class sessions require'} daily update notes',
                              style: TextStyle(
                                fontSize: 12.5,
                                color: Colors.grey.shade600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close_rounded),
                        onPressed: () => Navigator.of(sheetContext).pop(),
                      ),
                    ],
                  ),
                  const Divider(height: 24),
                  if (pendingList.isEmpty)
                    const Expanded(
                      child: Center(
                        child: TeacherEmptyView(
                          icon: Icons.check_circle_outline_rounded,
                          title: 'All caught up!',
                          message:
                              'All assigned class sessions have their daily updates recorded.',
                        ),
                      ),
                    )
                  else
                    Expanded(
                      child: ListView.separated(
                        controller: scrollController,
                        itemCount: pendingList.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (ctx, i) {
                          final item = pendingList[i];
                          final dateStr = item.date != null
                              ? _formatDate(item.date!)
                              : 'Today';
                          return Card(
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                              side: BorderSide(color: Colors.grey.shade300),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          item.className,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 15,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          '${item.courseName} · $dateStr',
                                          style: TextStyle(
                                            fontSize: 12.5,
                                            color: Colors.grey.shade700,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  ElevatedButton.icon(
                                    onPressed: () async {
                                      Navigator.of(sheetContext).pop();
                                      if (item.sessionId.startsWith('class-')) {
                                        setState(() {
                                          _selectedSubjectFilter =
                                              item.courseName.isNotEmpty
                                                  ? item.courseName
                                                  : 'All';
                                        });
                                      } else {
                                        await Navigator.of(context).push(
                                          MaterialPageRoute<void>(
                                            builder: (_) => DailyUpdateScreen(
                                              pending: item,
                                              onSubmit: (content) async {
                                                final vm = ref.read(
                                                  teacherPortalViewModelProvider
                                                      .notifier,
                                                );
                                                return vm.submitSessionUpdate(
                                                  sessionId: item.sessionId,
                                                  updateContent: content,
                                                );
                                              },
                                            ),
                                          ),
                                        );
                                      }
                                    },
                                    icon: const Icon(Icons.edit_note_rounded,
                                        size: 16),
                                    label: const Text('Update'),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: const Color(0xFFEA580C),
                                      foregroundColor: Colors.white,
                                      elevation: 0,
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 12, vertical: 8),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  void _showHistorySheet(BuildContext context, TeacherWorkspace workspace) {
    final logsWithTopic = <({
      String className,
      String subject,
      String topicTitle,
      TeacherTopicLog log,
    })>[];

    for (final klass in workspace.classes) {
      for (final syllabus in klass.syllabi) {
        for (final chapter in syllabus.chapters) {
          for (final topic in chapter.topics) {
            for (final log in topic.logs) {
              logsWithTopic.add((
                className: klass.name,
                subject: syllabus.subject,
                topicTitle: topic.title,
                log: log,
              ));
            }
          }
        }
      }
    }

    logsWithTopic.sort((a, b) => b.log.logDate.compareTo(a.log.logDate));

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.65,
          minChildSize: 0.4,
          maxChildSize: 0.9,
          builder: (_, scrollController) {
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade300,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEFF6FF),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(
                          Icons.history_rounded,
                          color: Color(0xFF2563EB),
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Update History',
                              style: GoogleFonts.fraunces(
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            Text(
                              'Past classroom lesson updates & progress logs',
                              style: TextStyle(
                                fontSize: 12.5,
                                color: Colors.grey.shade600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close_rounded),
                        onPressed: () => Navigator.of(sheetContext).pop(),
                      ),
                    ],
                  ),
                  const Divider(height: 24),
                  if (logsWithTopic.isEmpty)
                    const Expanded(
                      child: Center(
                        child: TeacherEmptyView(
                          icon: Icons.history_toggle_off_rounded,
                          title: 'No update history yet',
                          message:
                              'Lesson updates recorded by you will appear here.',
                        ),
                      ),
                    )
                  else
                    Expanded(
                      child: ListView.separated(
                        controller: scrollController,
                        itemCount: logsWithTopic.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (ctx, i) {
                          final item = logsWithTopic[i];
                          final isCompleted = item.log.status == 'COMPLETED';
                          final isInProgress = item.log.status == 'IN_PROGRESS';
                          final statusLabel = isCompleted
                              ? 'Completed'
                              : (isInProgress ? 'In Progress' : 'Not Started');
                          final badgeColor = isCompleted
                              ? const Color(0xFF10B981)
                              : (isInProgress
                                  ? const Color(0xFFF59E0B)
                                  : const Color(0xFF6B7280));

                          return Card(
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                              side: BorderSide(color: Colors.grey.shade200),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Text(
                                        _formatDate(item.log.logDate),
                                        style: TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                          color: Colors.grey.shade600,
                                        ),
                                      ),
                                      const Spacer(),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 8, vertical: 3),
                                        decoration: BoxDecoration(
                                          color: badgeColor.withValues(
                                              alpha: 0.12),
                                          borderRadius:
                                              BorderRadius.circular(8),
                                        ),
                                        child: Text(
                                          statusLabel,
                                          style: TextStyle(
                                            color: badgeColor,
                                            fontSize: 11,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    item.topicTitle,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 15,
                                    ),
                                  ),
                                  Text(
                                    '${item.className} · ${item.subject}',
                                    style: TextStyle(
                                      fontSize: 12.5,
                                      color: Colors.grey.shade600,
                                    ),
                                  ),
                                  if (item.log.notes != null &&
                                      item.log.notes!.trim().isNotEmpty) ...[
                                    const SizedBox(height: 8),
                                    Container(
                                      width: double.infinity,
                                      padding: const EdgeInsets.all(10),
                                      decoration: BoxDecoration(
                                        color: Colors.grey.shade50,
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(
                                            color: Colors.grey.shade200),
                                      ),
                                      child: Text(
                                        item.log.notes!,
                                        style: TextStyle(
                                          fontSize: 13,
                                          color: Colors.grey.shade800,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _publishAllReady(
      List<
              ({
                TeacherClassInfo klass,
                _FlattenedTopic topic,
                String status,
                String? notes
              })>
          readyItems) async {
    if (readyItems.isEmpty || _isPublishingAll) return;

    setState(() {
      _isPublishingAll = true;
      _publishCurrent = 0;
    });

    final vm = ref.read(teacherPortalViewModelProvider.notifier);
    int successCount = 0;

    for (int i = 0; i < readyItems.length; i++) {
      final item = readyItems[i];
      if (!mounted) break;
      setState(() => _publishCurrent = i + 1);

      final success = await vm.updateTopicProgress(
        syllabusId: item.topic.syllabusId,
        topicId: item.topic.id,
        status: item.status,
        notes: item.notes?.trim(),
      );

      if (success) {
        successCount++;
        _savedPerTopic[item.topic.id] = (
          status: item.status,
          at: DateTime.now(),
        );
      }
    }

    await _saveDraftNow();

    if (!mounted) return;
    setState(() => _isPublishingAll = false);

    if (successCount > 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Published $successCount daily ${successCount == 1 ? 'update' : 'updates'} successfully.',
          ),
          backgroundColor: const Color(0xFF16A34A),
        ),
      );
    } else {
      final errorMsg = ref.read(teacherPortalViewModelProvider).error ??
          'Could not publish updates. Please try again.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(errorMsg),
          backgroundColor: const Color(0xFFDC2626),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(teacherPortalViewModelProvider);
    final vm = ref.read(teacherPortalViewModelProvider.notifier);

    if (state.isLoading && state.workspace == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Daily Updates')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (state.error != null && state.workspace == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Daily Updates')),
        body: TeacherErrorView(
          message: state.error!,
          onRetry: () => vm.refresh(),
        ),
      );
    }

    final workspace = state.workspace;
    if (workspace == null || workspace.classes.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Daily Updates')),
        body: const TeacherEmptyView(
          icon: Icons.note_alt_outlined,
          title: 'No assigned class',
          message: 'Daily updates require an assigned class.',
        ),
      );
    }

    // Sort classes chronologically by today's schedule time
    final sortedClasses = [...workspace.classes]..sort((a, b) {
        final timeA = _classStartTime(a, workspace.todayClasses);
        final timeB = _classStartTime(b, workspace.todayClasses);
        final cmp = timeA.compareTo(timeB);
        if (cmp != 0) return cmp;
        return a.name.compareTo(b.name);
      });

    // Extract unique subjects for the filter
    final subjectsSet = <String>{};
    for (final klass in sortedClasses) {
      if (klass.subject.trim().isNotEmpty) {
        subjectsSet.add(klass.subject.trim());
      }
    }
    final subjectFilters = ['All', ...subjectsSet.toList()..sort()];

    // Filter classes based on selected subject filter
    final filteredClasses = _selectedSubjectFilter == 'All'
        ? sortedClasses
        : sortedClasses
            .where((c) => c.subject.trim() == _selectedSubjectFilter)
            .toList();

    final allPendingUpdates = _getAllPendingUpdates(workspace);
    final pendingCount = allPendingUpdates.length;

    // Collect ready items across all classes for unified publishing
    final readyToPublish = <({
      TeacherClassInfo klass,
      _FlattenedTopic topic,
      String status,
      String? notes,
    })>[];

    for (final klass in sortedClasses) {
      final rawTopics = _flattenTopics(klass);
      final activeTopicId = _activeTopicPerClass[klass.id];
      final activeTopic = rawTopics.cast<_FlattenedTopic?>().firstWhere(
            (t) => t?.id == activeTopicId,
            orElse: () => _recommendedTopic(rawTopics),
          );
      if (activeTopic != null && activeTopic.todayLog == null) {
        final status = _draftStatusPerClass[klass.id] ?? activeTopic.status;
        final notes = _notesPerTopic[activeTopic.id];
        readyToPublish.add((
          klass: klass,
          topic: activeTopic,
          status: status,
          notes: notes,
        ));
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Daily Updates',
          style:
              GoogleFonts.fraunces(fontWeight: FontWeight.w700, fontSize: 21),
        ),
        actions: [
          // Explicit save draft button in app bar
          TextButton.icon(
            onPressed: () async {
              await _saveDraftNow();
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('All daily update drafts saved.'),
                    duration: Duration(seconds: 2),
                  ),
                );
              }
            },
            icon: Icon(
              _isDraftSaved
                  ? Icons.cloud_done_rounded
                  : Icons.cloud_upload_outlined,
              size: 18,
              color: _isDraftSaved ? const Color(0xFF16A34A) : kColorPrimary,
            ),
            label: Text(
              _isDraftSaved ? 'Draft Saved' : 'Save Draft',
              style: TextStyle(
                color: _isDraftSaved ? const Color(0xFF16A34A) : kColorPrimary,
                fontWeight: FontWeight.w600,
                fontSize: 12.5,
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh',
            onPressed: () => vm.refresh(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => vm.refresh(),
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // Top buttons bar: Pending Updates (with count) and History
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () =>
                        _showPendingUpdatesSheet(context, workspace),
                    icon: Icon(
                      Icons.pending_actions_rounded,
                      size: 18,
                      color: pendingCount > 0
                          ? const Color(0xFFEA580C)
                          : kColorPrimary,
                    ),
                    label: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Flexible(
                          child: Text(
                            'Pending Updates',
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: pendingCount > 0
                                  ? const Color(0xFFEA580C)
                                  : Colors.black87,
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1.5),
                          decoration: BoxDecoration(
                            color: pendingCount > 0
                                ? const Color(0xFFEA580C)
                                : Colors.grey.shade400,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            '$pendingCount',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 10),
                      side: BorderSide(
                        color: pendingCount > 0
                            ? const Color(0xFFFDBA74)
                            : Colors.grey.shade300,
                        width: 1.2,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      backgroundColor: pendingCount > 0
                          ? const Color(0xFFFFF7ED)
                          : Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _showHistorySheet(context, workspace),
                    icon: const Icon(
                      Icons.history_rounded,
                      size: 18,
                      color: Color(0xFF2563EB),
                    ),
                    label: const Text(
                      'Update History',
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.black87,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 10),
                      side: BorderSide(
                        color: Colors.grey.shade300,
                        width: 1.2,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      backgroundColor: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // Subject Filter Bar (Initially "All" is selected)
            Row(
              children: [
                const Icon(Icons.filter_list_rounded,
                    size: 16, color: Colors.grey),
                const SizedBox(width: 6),
                Text(
                  'Subject:',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Colors.grey.shade800,
                  ),
                ),
                const Spacer(),
                Text(
                  '${filteredClasses.length} ${filteredClasses.length == 1 ? 'class' : 'classes'} scheduled',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: subjectFilters.map((subj) {
                  final isSelected = _selectedSubjectFilter == subj;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(subj),
                      selected: isSelected,
                      onSelected: (selected) {
                        if (selected) {
                          setState(() => _selectedSubjectFilter = subj);
                        }
                      },
                      labelStyle: TextStyle(
                        color: isSelected ? Colors.white : Colors.black87,
                        fontWeight:
                            isSelected ? FontWeight.bold : FontWeight.w500,
                        fontSize: 12.5,
                      ),
                      selectedColor: kColorPrimary,
                      backgroundColor: Colors.white,
                      side: BorderSide(
                        color: isSelected
                            ? kColorPrimary
                            : Colors.grey.shade300,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 16),

            // Chronological List of Classes
            if (filteredClasses.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(
                  child: TeacherEmptyView(
                    icon: Icons.event_busy_rounded,
                    title: 'No classes found',
                    message:
                        'No scheduled classes match the selected subject filter.',
                  ),
                ),
              )
            else
              for (final klass in filteredClasses) ...[
                _buildClassCard(klass, workspace, allPendingUpdates),
                const SizedBox(height: 18),
              ],
            const SizedBox(height: 70), // Padding above bottom sticky bar
          ],
        ),
      ),
      bottomNavigationBar: _buildBottomPublishBar(readyToPublish),
    );
  }

  Widget _buildBottomPublishBar(
      List<
              ({
                TeacherClassInfo klass,
                _FlattenedTopic topic,
                String status,
                String? notes
              })>
          readyToPublish) {
    final count = readyToPublish.length;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.grey.shade200)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        child: Row(
          children: [
            Expanded(
              flex: 4,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    count > 0
                        ? '$count ${count == 1 ? 'update ready' : 'updates ready'}'
                        : 'All published',
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                      color: Colors.black87,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Icon(
                        _isDraftSaved
                            ? Icons.check_circle_rounded
                            : Icons.edit_note_rounded,
                        size: 13,
                        color: _isDraftSaved
                            ? const Color(0xFF16A34A)
                            : const Color(0xFFD97706),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        _isDraftSaved
                            ? 'Saved in draft'
                            : 'Auto-saving...',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: _isDraftSaved
                              ? const Color(0xFF16A34A)
                              : const Color(0xFFD97706),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 5,
              child: SizedBox(
                height: 46,
                child: ElevatedButton.icon(
                  onPressed: (_isPublishingAll || count == 0)
                      ? null
                      : () => _publishAllReady(readyToPublish),
                  icon: _isPublishingAll
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.send_rounded, size: 16),
                  label: Text(
                    _isPublishingAll
                        ? 'Publishing $_publishCurrent/$count'
                        : (count > 0
                            ? 'Publish $count ${count == 1 ? 'Update' : 'Updates'}'
                            : 'Publish Updates'),
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: kColorPrimary,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: Colors.grey.shade300,
                    disabledForegroundColor: Colors.grey.shade600,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildClassCard(
      TeacherClassInfo klass,
      TeacherWorkspace workspace,
      List<TeacherPendingUpdate> allPendingUpdates) {
    final rawTopics = _flattenTopics(klass);
    final scheduleLabel =
        _classScheduleLabel(klass, workspace.todayClasses);

    // Extract all unique chapters for dropdown
    final allChapters = <({String id, int position, String title})>[];
    for (final syllabus in klass.syllabi) {
      for (final ch in syllabus.chapters) {
        if (!allChapters.any((c) => c.id == ch.id)) {
          allChapters.add((
            id: ch.id,
            position: ch.position,
            title: ch.title,
          ));
        }
      }
    }
    allChapters.sort((a, b) => a.position.compareTo(b.position));

    final selectedChapterId = _selectedChapterPerClass[klass.id] ?? 'ALL';
    final chapterFilteredTopics = selectedChapterId == 'ALL'
        ? rawTopics
        : rawTopics.where((t) => t.chapterId == selectedChapterId).toList();

    // Active topic for this class within the filtered chapter topics
    final activeTopicId = _activeTopicPerClass[klass.id];
    final activeTopic = chapterFilteredTopics.cast<_FlattenedTopic?>().firstWhere(
          (t) => t?.id == activeTopicId,
          orElse: () => _recommendedTopic(chapterFilteredTopics),
        );

    // Number line topic ordering: Completed (left) -> Active (center/default) -> Pending (right)
    final topics = _sortTopicsNumberLine(chapterFilteredTopics, activeTopic?.id);
    final activeIndex = topics.indexWhere((t) => t.id == activeTopic?.id);
    final initialOffset = activeIndex > 0 ? (activeIndex * 206.0) : 0.0;
    final scrollController =
        _getOrCreateTopicController('${klass.id}_$selectedChapterId', initialOffset);

    final completeCount =
        chapterFilteredTopics.where((t) => t.status == 'COMPLETED').length;
    final totalCount = chapterFilteredTopics.length;

    final activeTodayLog = activeTopic?.todayLog;
    final savedInfo =
        activeTopic != null ? _savedPerTopic[activeTopic.id] : null;

    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: Colors.grey.shade300,
          width: 1.2,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Class & Subject Header with Schedule Time (No "Update Pending" on top right)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        klass.subject,
                        style: GoogleFonts.fraunces(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        klass.name,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Colors.grey.shade700,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEFF6FF),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFBFDBFE)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.schedule_rounded,
                          size: 14, color: Color(0xFF2563EB)),
                      const SizedBox(width: 5),
                      Text(
                        scheduleLabel,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF1D4ED8),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const Divider(height: 22),

            if (rawTopics.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'No syllabus topics recorded for this class.',
                  style: TextStyle(fontSize: 13, color: Colors.grey),
                ),
              )
            else ...[
              // Chapter Selection Dropdown & Completed Numeric Count (Just numbers, no progress bar)
              Row(
                children: [
                  Expanded(
                    child: Container(
                      height: 42,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade50,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.grey.shade300),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: (selectedChapterId == 'ALL' ||
                                  allChapters.any((c) => c.id == selectedChapterId))
                              ? selectedChapterId
                              : 'ALL',
                          isExpanded: true,
                          icon: const Icon(Icons.arrow_drop_down_rounded,
                              color: Colors.black87),
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Colors.black87,
                          ),
                          items: [
                            DropdownMenuItem<String>(
                              value: 'ALL',
                              child: Text(
                                'All Chapters (${rawTopics.length})',
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            for (final ch in allChapters)
                              DropdownMenuItem<String>(
                                value: ch.id,
                                child: Text(
                                  'Ch. ${ch.position}: ${ch.title}',
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                          ],
                          onChanged: (newChapterId) {
                            if (newChapterId == null) return;
                            setState(() {
                              _selectedChapterPerClass[klass.id] =
                                  newChapterId;
                              final filtered = newChapterId == 'ALL'
                                  ? rawTopics
                                  : rawTopics
                                      .where((t) =>
                                          t.chapterId == newChapterId)
                                      .toList();
                              final rec = _recommendedTopic(filtered);
                              if (rec != null) {
                                _activeTopicPerClass[klass.id] = rec.id;
                                final todayLog = rec.todayLog;
                                _draftStatusPerClass[klass.id] =
                                    rec.status == 'LEFT' && todayLog == null
                                        ? 'IN_PROGRESS'
                                        : rec.status;
                                if (todayLog?.notes != null &&
                                    todayLog!.notes!.isNotEmpty) {
                                  _notesPerTopic[rec.id] = todayLog.notes!;
                                }
                              }
                            });
                            _scheduleDraftSave();
                          },
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0FDF4),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFBBF7D0)),
                    ),
                    child: Text(
                      'Completed: $completeCount / $totalCount',
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF166534),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Scrollable Topic Queue (Horizontal scrolling with high readability & number-line layout)
              SizedBox(
                height: 108,
                child: ListView.separated(
                  controller: scrollController,
                  scrollDirection: Axis.horizontal,
                  itemCount: topics.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (context, i) {
                    final topic = topics[i];
                    final isSelected = topic.id == activeTopic?.id;
                    final isDone = topic.status == 'COMPLETED';
                    final isActive = topic.status == 'IN_PROGRESS';
                    final hasTodayLog = topic.todayLog != null;

                    final dotColor = isDone
                        ? const Color(0xFF10B981)
                        : (isActive
                            ? const Color(0xFFF59E0B)
                            : const Color(0xFF94A3B8));

                    final toneBadge = isDone
                        ? 'Completed'
                        : (isActive ? 'Active' : 'Next / Pending');

                    return InkWell(
                      onTap: () => _onTopicSelected(klass, topic, i),
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        width: 196,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? const Color(0xFFEFF6FF)
                              : (isDone
                                  ? const Color(0xFFF0FDF4)
                                  : Colors.white),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: isSelected
                                ? kColorPrimary
                                : (isDone
                                    ? const Color(0xFFBBF7D0)
                                    : Colors.grey.shade300),
                            width: isSelected ? 2.0 : 1.0,
                          ),
                          boxShadow: isSelected
                              ? [
                                  BoxShadow(
                                    color:
                                        kColorPrimary.withValues(alpha: 0.12),
                                    blurRadius: 6,
                                    offset: const Offset(0, 2),
                                  ),
                                ]
                              : null,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 9,
                                  height: 9,
                                  decoration: BoxDecoration(
                                    color: dotColor,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  toneBadge,
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: dotColor,
                                  ),
                                ),
                                const Spacer(),
                                if (hasTodayLog) ...[
                                  const Icon(Icons.check_circle_rounded,
                                      size: 14, color: Color(0xFF16A34A)),
                                  const SizedBox(width: 3),
                                  const Text(
                                    'Today',
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFF16A34A),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                            Text(
                              topic.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 14.5,
                                fontWeight: FontWeight.w700,
                                height: 1.25,
                                color: isSelected
                                    ? kColorPrimary
                                    : Colors.black87,
                              ),
                            ),
                            Text(
                              'Ch. ${topic.chapterPosition} · ${topic.chapterTitle}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 12.5,
                                color: Colors.grey.shade700,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 16),

              // 3. ACTIVE TOPIC UPDATE FORM
              if (activeTopic != null) ...[
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: activeTodayLog != null
                        ? const Color(0xFFF0FDF4)
                        : Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: activeTodayLog != null
                          ? const Color(0xFFBBF7D0)
                          : Colors.grey.shade300,
                      width: 1.1,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: activeTodayLog != null
                                  ? const Color(0xFFDCFCE7)
                                  : const Color(0xFFEFF6FF),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              activeTodayLog != null
                                  ? 'PUBLISHED TODAY'
                                  : 'TODAY’S UPDATE',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: activeTodayLog != null
                                    ? const Color(0xFF166534)
                                    : const Color(0xFF1D4ED8),
                              ),
                            ),
                          ),
                          const Spacer(),
                          Text(
                            'Ch. ${activeTopic.chapterPosition}: ${activeTopic.chapterTitle}',
                            style: TextStyle(
                              fontSize: 11.5,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        activeTopic.title,
                        style: GoogleFonts.fraunces(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Status choice
                      Text(
                        'How far did the class get?',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                          color: Colors.grey.shade800,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          _buildMiniStatusChip(
                            klass: klass,
                            value: 'LEFT',
                            label: 'Not started',
                            disabled: activeTodayLog != null,
                          ),
                          const SizedBox(width: 6),
                          _buildMiniStatusChip(
                            klass: klass,
                            value: 'IN_PROGRESS',
                            label: 'In progress',
                            disabled: activeTodayLog != null,
                          ),
                          const SizedBox(width: 6),
                          _buildMiniStatusChip(
                            klass: klass,
                            value: 'COMPLETED',
                            label: 'Completed',
                            disabled: activeTodayLog != null,
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

                      // Lesson Note
                      TextFormField(
                        key: ValueKey('note_${activeTopic.id}'),
                        initialValue: _notesPerTopic[activeTopic.id] ?? '',
                        enabled: activeTodayLog == null,
                        maxLines: 2,
                        decoration: InputDecoration(
                          hintText:
                              'What was covered, assigned, or needs revision?',
                          hintStyle: TextStyle(
                            fontSize: 12.5,
                            color: Colors.grey.shade400,
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 10),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: BorderSide(color: Colors.grey.shade300),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: BorderSide(color: Colors.grey.shade300),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(
                                color: kColorPrimary, width: 1.5),
                          ),
                          filled: true,
                          fillColor: activeTodayLog != null
                              ? Colors.grey.shade100
                              : Colors.white,
                        ),
                        onChanged: (text) {
                          _notesPerTopic[activeTopic.id] = text;
                          _scheduleDraftSave();
                        },
                      ),
                      const SizedBox(height: 10),

                      // Lock / confirmation / draft notices
                      if (savedInfo != null) ...[
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF0FDF4),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: const Color(0xFFBBF7D0)),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.cloud_done_rounded,
                                  color: Color(0xFF16A34A), size: 16),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  'Saved as ${savedInfo.status.toLowerCase().replaceAll('_', ' ')} at ${savedInfo.at.hour.toString().padLeft(2, '0')}:${savedInfo.at.minute.toString().padLeft(2, '0')}. Locked.',
                                  style: const TextStyle(
                                    color: Color(0xFF166534),
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ] else if (activeTodayLog != null) ...[
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF8FAFC),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                          ),
                          child: const Row(
                            children: [
                              Icon(Icons.lock_rounded,
                                  color: Colors.grey, size: 16),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  'Today’s update is published and locked.',
                                  style: TextStyle(
                                    color: Color(0xFF475569),
                                    fontSize: 11.5,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ] else ...[
                        Row(
                          children: [
                            Icon(
                              _isDraftSaved
                                  ? Icons.check_circle_outline_rounded
                                  : Icons.edit_note_rounded,
                              size: 14,
                              color: Colors.grey.shade600,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              _isDraftSaved
                                  ? 'Saved in draft'
                                  : 'Auto-saving...',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey.shade600,
                                fontStyle: FontStyle.italic,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildMiniStatusChip({
    required TeacherClassInfo klass,
    required String value,
    required String label,
    required bool disabled,
  }) {
    final currentVal = _draftStatusPerClass[klass.id] ?? 'IN_PROGRESS';
    final isSelected = currentVal == value;

    return Expanded(
      child: InkWell(
        onTap: disabled
            ? null
            : () {
                setState(() => _draftStatusPerClass[klass.id] = value);
                _scheduleDraftSave();
              },
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color: isSelected
                ? kColorPrimary.withValues(alpha: 0.1)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isSelected ? kColorPrimary : Colors.grey.shade300,
              width: isSelected ? 1.6 : 1,
            ),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w600,
              color: disabled
                  ? Colors.grey.shade500
                  : (isSelected ? kColorPrimary : Colors.black87),
            ),
          ),
        ),
      ),
    );
  }
}
