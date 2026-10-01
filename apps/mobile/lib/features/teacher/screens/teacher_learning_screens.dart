import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:tms_mobile/core/network/api_exception.dart';
import 'package:tms_mobile/features/teacher/data/teacher_portal_repository.dart';
import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';
import 'package:tms_mobile/features/teacher/viewmodels/teacher_portal_viewmodel.dart';
import 'package:tms_mobile/features/teacher/widgets/teacher_navigation.dart';

String _date(DateTime value) =>
    '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
Future<String?> _pickImageData() async {
  final file = await ImagePicker()
      .pickImage(source: ImageSource.gallery, imageQuality: 88);
  if (file == null) return null;
  final bytes = await file.readAsBytes();
  final extension = file.name.toLowerCase();
  final mime = extension.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return 'data:$mime;base64,${base64Encode(bytes)}';
}

class _FeatureHero extends StatelessWidget {
  const _FeatureHero(
      {required this.icon,
      required this.eyebrow,
      required this.title,
      required this.message});
  final IconData icon;
  final String eyebrow;
  final String title;
  final String message;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
            gradient: const LinearGradient(
                colors: [Color(0xFF002D72), Color(0xFF1560BD)]),
            borderRadius: BorderRadius.circular(18)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: .14),
                  borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, color: Colors.white)),
          const SizedBox(width: 14),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(eyebrow,
                    style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1)),
                const SizedBox(height: 4),
                Text(title,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: Colors.white, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text(message, style: const TextStyle(color: Colors.white70))
              ])),
        ]),
      );
}

class TeacherHomeworkScreen extends ConsumerStatefulWidget {
  const TeacherHomeworkScreen({super.key});
  @override
  ConsumerState<TeacherHomeworkScreen> createState() =>
      _TeacherHomeworkScreenState();
}

class _TeacherHomeworkScreenState extends ConsumerState<TeacherHomeworkScreen> {
  final _title = TextEditingController();
  final _instructions = TextEditingController();
  String? _classId;
  DateTime _due = DateTime.now().add(const Duration(days: 7));
  String? _attachment;
  bool _saving = false;
  @override
  void dispose() {
    _title.dispose();
    _instructions.dispose();
    super.dispose();
  }

  Future<void> _submit(TeacherClassInfo klass) async {
    if (_title.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Homework title is required.')));
      return;
    }
    setState(() => _saving = true);
    try {
      await TeacherPortalRepository().createHomework(
          classId: klass.id,
          subject: klass.subject,
          title: _title.text.trim(),
          description: _instructions.text.trim(),
          contentUrl: _attachment,
          deadline: _due);
      await ref.read(teacherPortalViewModelProvider.notifier).refresh();
      if (!mounted) return;
      _title.clear();
      _instructions.clear();
      setState(() {
        _saving = false;
        _attachment = null;
      });
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Homework assigned.')));
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<void> _editHomework(TeacherHomework homework) async {
    final title = TextEditingController(text: homework.title);
    final instructions = TextEditingController(text: homework.description ?? '');
    var due = homework.deadline;
    var attachment = homework.contentUrl;
    final save = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Edit homework'),
          content: SizedBox(
            width: 520,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                TextField(
                  controller: title,
                  maxLength: 200,
                  decoration: const InputDecoration(
                    labelText: 'Title',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: instructions,
                  minLines: 3,
                  maxLines: 7,
                  decoration: const InputDecoration(
                    labelText: 'Instructions',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.event_outlined),
                  title: const Text('Due date'),
                  subtitle: Text(_date(due)),
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: due,
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 730)),
                    );
                    if (picked != null) setDialogState(() => due = picked);
                  },
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(attachment == null
                      ? Icons.attach_file
                      : Icons.check_circle_outline),
                  title: Text(attachment == null
                      ? 'Add reference image'
                      : 'Replace reference image'),
                  trailing: attachment == null
                      ? null
                      : IconButton(
                          tooltip: 'Remove attachment',
                          onPressed: () =>
                              setDialogState(() => attachment = null),
                          icon: const Icon(Icons.close),
                        ),
                  onTap: () async {
                    final picked = await _pickImageData();
                    if (picked != null) {
                      setDialogState(() => attachment = picked);
                    }
                  },
                ),
              ]),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                if (title.text.trim().isEmpty) return;
                Navigator.pop(dialogContext, true);
              },
              child: const Text('Save changes'),
            ),
          ],
        ),
      ),
    );
    if (save != true || !mounted) {
      title.dispose();
      instructions.dispose();
      return;
    }
    setState(() => _saving = true);
    try {
      await TeacherPortalRepository().updateHomework(
        homeworkId: homework.id,
        title: title.text,
        description: instructions.text,
        contentUrl: attachment,
        deadline: due,
      );
      await ref.read(teacherPortalViewModelProvider.notifier).refresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Homework updated.')),
        );
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      title.dispose();
      instructions.dispose();
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final workspace = ref.watch(teacherPortalViewModelProvider).workspace;
    final classes = workspace?.classes ?? const <TeacherClassInfo>[];
    if (classes.isNotEmpty && !classes.any((item) => item.id == _classId))
      _classId = classes.first.id;
    final selected = classes.where((item) => item.id == _classId).firstOrNull;
    final recent = [
      for (final klass in classes)
        for (final item in klass.homework) (klass, item)
    ]..sort((a, b) => (b.$2.createdAt ?? b.$2.deadline)
        .compareTo(a.$2.createdAt ?? a.$2.deadline));
    return TeacherPortalScaffold(
        title: 'Homework',
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const _FeatureHero(
              icon: Icons.assignment_outlined,
              eyebrow: 'CLASSWORK',
              title: 'Homework studio',
              message:
                  'Create clear assignments and keep recent work visible in one place.'),
          const SizedBox(height: 20),
          Text('Assign homework',
              style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          const Text(
              'Choose a class, add clear instructions, and optionally attach a reference image.'),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
              initialValue: _classId,
              isExpanded: true,
              decoration: const InputDecoration(
                  labelText: 'Class', border: OutlineInputBorder()),
              items: [
                for (final klass in classes)
                  DropdownMenuItem(
                      value: klass.id,
                      child: Text('${klass.name} · ${klass.subject}',
                          maxLines: 1, overflow: TextOverflow.ellipsis))
              ],
              onChanged: (value) => setState(() => _classId = value)),
          const SizedBox(height: 12),
          TextField(
              controller: _title,
              decoration: const InputDecoration(
                  labelText: 'Title', border: OutlineInputBorder())),
          const SizedBox(height: 12),
          TextField(
              controller: _instructions,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(
                  labelText: 'Instructions', border: OutlineInputBorder())),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
                child: OutlinedButton.icon(
                    onPressed: () async {
                      final picked = await showDatePicker(
                          context: context,
                          initialDate: _due,
                          firstDate: DateTime.now(),
                          lastDate:
                              DateTime.now().add(const Duration(days: 730)));
                      if (picked != null) setState(() => _due = picked);
                    },
                    icon: const Icon(Icons.event_outlined),
                    label: Text('Due ${_date(_due)}'))),
            const SizedBox(width: 8),
            Expanded(
                child: OutlinedButton.icon(
                    onPressed: () async {
                      final value = await _pickImageData();
                      if (value != null && mounted)
                        setState(() => _attachment = value);
                    },
                    icon: Icon(_attachment == null
                        ? Icons.attach_file
                        : Icons.check_circle_outline),
                    label:
                        Text(_attachment == null ? 'Attachment' : 'Attached')))
          ]),
          const SizedBox(height: 12),
          FilledButton.icon(
              onPressed:
                  selected == null || _saving ? null : () => _submit(selected),
              icon: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send_outlined),
              label: const Text('Assign homework')),
          const SizedBox(height: 28),
          Text('Recent homework',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          if (recent.isEmpty)
            const Card(
                child: ListTile(
                    leading: Icon(Icons.assignment_outlined),
                    title: Text('No homework assigned yet')))
          else
            for (final entry in recent.take(12))
              Card(
                  child: ListTile(
                      leading: const Icon(Icons.assignment_outlined),
                      title: Text(entry.$2.title),
                      subtitle: Text(
                          '${entry.$1.name} · ${entry.$2.subject}\nDue ${_date(entry.$2.deadline)}'),
                      isThreeLine: true,
                      trailing: PopupMenuButton<String>(
                        tooltip: 'Homework actions',
                        onSelected: (value) {
                          if (value == 'edit') _editHomework(entry.$2);
                        },
                        itemBuilder: (_) => const [
                          PopupMenuItem(
                            value: 'edit',
                            child: ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: Icon(Icons.edit_outlined),
                              title: Text('Edit assignment'),
                            ),
                          ),
                        ],
                        icon: Badge(
                          isLabelVisible:
                              entry.$2.contentUrl?.isNotEmpty == true,
                          smallSize: 7,
                          child: const Icon(Icons.more_vert),
                        ),
                      ))),
        ]));
  }
}

class TeacherSyllabusScreen extends ConsumerStatefulWidget {
  const TeacherSyllabusScreen({super.key});
  @override
  ConsumerState<TeacherSyllabusScreen> createState() =>
      _TeacherSyllabusScreenState();
}

class _TeacherSyllabusScreenState extends ConsumerState<TeacherSyllabusScreen> {
  String? _classId;
  String? _busyTopic;
  bool _editing = false;
  bool _savingPlan = false;
  String _subject = '';
  List<_ChapterDraft> _chapters = const [];

  void _editPlan(TeacherClassInfo klass, TeacherSyllabus? syllabus) {
    setState(() {
      _editing = true;
      _subject = syllabus?.subject ?? klass.subject;
      _chapters = syllabus == null
          ? [_ChapterDraft(null, '')]
          : [
              for (final chapter in syllabus.chapters)
                _ChapterDraft(chapter.id, chapter.title)
            ];
    });
  }

  Future<void> _savePlan(
      TeacherClassInfo klass, TeacherSyllabus? syllabus) async {
    final chapters =
        _chapters.where((item) => item.title.trim().isNotEmpty).toList();
    if (_subject.trim().isEmpty || chapters.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Add a subject and at least one chapter.')));
      return;
    }
    setState(() => _savingPlan = true);
    try {
      final repository = TeacherPortalRepository();
      if (syllabus == null) {
        await repository.createSyllabus(
            classId: klass.id,
            subject: _subject.trim(),
            chapters: [for (final item in chapters) item.title.trim()]);
      } else {
        await repository.updateSyllabus(
            syllabusId: syllabus.id,
            subject: _subject.trim(),
            chapters: [
              for (final item in chapters)
                {'id': item.id, 'title': item.title.trim()}
            ]);
      }
      await ref.read(teacherPortalViewModelProvider.notifier).refresh();
      if (mounted) setState(() => _editing = false);
    } on ApiException catch (error) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
    }
    if (mounted) setState(() => _savingPlan = false);
  }

  Future<void> _addTopic(
      TeacherSyllabus syllabus, TeacherSyllabusChapter chapter) async {
    final controller = TextEditingController();
    final title = await showDialog<String>(
        context: context,
        builder: (dialogContext) => AlertDialog(
              title: Text('Add topic to ${chapter.title}'),
              content: TextField(
                  controller: controller,
                  autofocus: true,
                  decoration: const InputDecoration(
                      labelText: 'Topic title', border: OutlineInputBorder())),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(dialogContext),
                    child: const Text('Cancel')),
                FilledButton(
                    onPressed: () =>
                        Navigator.pop(dialogContext, controller.text.trim()),
                    child: const Text('Add topic'))
              ],
            ));
    controller.dispose();
    if (title == null || title.isEmpty) return;
    try {
      await TeacherPortalRepository().createSyllabusTopic(
          syllabusId: syllabus.id, chapterId: chapter.id, title: title);
      await ref.read(teacherPortalViewModelProvider.notifier).refresh();
    } on ApiException catch (error) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _update(TeacherSyllabus syllabus, TeacherSyllabusTopic topic,
      String status) async {
    setState(() => _busyTopic = topic.id);
    try {
      await TeacherPortalRepository().updateTopicProgress(
          syllabusId: syllabus.id, topicId: topic.id, status: status);
      await ref.read(teacherPortalViewModelProvider.notifier).refresh();
    } on ApiException catch (error) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
    }
    if (mounted) setState(() => _busyTopic = null);
  }

  @override
  Widget build(BuildContext context) {
    final classes =
        ref.watch(teacherPortalViewModelProvider).workspace?.classes ??
            const <TeacherClassInfo>[];
    if (classes.isNotEmpty && !classes.any((item) => item.id == _classId)) {
      _classId = classes.first.id;
    }
    final klass = classes.where((item) => item.id == _classId).firstOrNull;
    final syllabus = klass?.syllabi.firstOrNull;
    if (klass != null && syllabus == null && !_editing && _chapters.isEmpty) {
      _editing = true;
      _subject = klass.subject;
      _chapters = [_ChapterDraft(null, '')];
    }
    final completed =
        syllabus?.chapters.where((item) => item.status == 'COMPLETED').length ??
            0;
    final total = syllabus?.chapters.length ?? 0;
    final progress = total == 0 ? 0.0 : completed / total;
    return TeacherPortalScaffold(
        title: 'Update syllabus',
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const _FeatureHero(
              icon: Icons.menu_book_outlined,
              eyebrow: 'TEACHING PLAN',
              title: 'Syllabus workspace',
              message:
                  'Build chapters, add lesson topics, and publish daily progress for students.'),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
              key: ValueKey(_classId),
              initialValue: _classId,
              isExpanded: true,
              decoration: const InputDecoration(
                  labelText: 'Class', border: OutlineInputBorder()),
              items: [
                for (final item in classes)
                  DropdownMenuItem(
                      value: item.id,
                      child: Text('${item.name} · ${item.subject}',
                          maxLines: 1, overflow: TextOverflow.ellipsis))
              ],
              onChanged: (value) => setState(() {
                    _classId = value;
                    _editing = false;
                  })),
          const SizedBox(height: 16),
          if (klass == null)
            const Card(child: ListTile(title: Text('No assigned class')))
          else if (_editing || syllabus == null)
            _buildPlanEditor(klass, syllabus)
          else ...[
            Card(
                child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            Expanded(
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                  Text(syllabus.subject,
                                      style: Theme.of(context)
                                          .textTheme
                                          .headlineSmall),
                                  Text(
                                      '$completed of $total chapters completed')
                                ])),
                            OutlinedButton.icon(
                                onPressed: () => _editPlan(klass, syllabus),
                                icon: const Icon(Icons.edit_outlined),
                                label: const Text('Edit plan'))
                          ]),
                          const SizedBox(height: 14),
                          LinearProgressIndicator(
                              value: progress,
                              minHeight: 8,
                              borderRadius: BorderRadius.circular(99)),
                          const SizedBox(height: 6),
                          Text('${(progress * 100).round()}% complete',
                              style: Theme.of(context).textTheme.labelMedium),
                        ]))),
            const SizedBox(height: 16),
            Text('Chapters and topics',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            for (final chapter in syllabus.chapters)
              Card(
                  child: ExpansionTile(
                leading: CircleAvatar(
                    child: Text('${syllabus.chapters.indexOf(chapter) + 1}')),
                title: Text(chapter.title),
                subtitle: Text(chapter.status.replaceAll('_', ' ')),
                children: [
                  for (final topic in chapter.topics)
                    ListTile(
                      leading: Icon(
                          topic.status == 'COMPLETED'
                              ? Icons.check_circle
                              : topic.status == 'IN_PROGRESS'
                                  ? Icons.timelapse
                                  : Icons.radio_button_unchecked,
                          color: topic.status == 'COMPLETED'
                              ? Colors.green
                              : null),
                      title: Text(topic.title),
                      subtitle: Text(topic.status.replaceAll('_', ' ')),
                      trailing: _busyTopic == topic.id
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : PopupMenuButton<String>(
                              tooltip: 'Update progress',
                              onSelected: (status) =>
                                  _update(syllabus, topic, status),
                              itemBuilder: (_) => const [
                                    PopupMenuItem(
                                        value: 'LEFT',
                                        child: Text('Not started')),
                                    PopupMenuItem(
                                        value: 'IN_PROGRESS',
                                        child: Text('In progress')),
                                    PopupMenuItem(
                                        value: 'COMPLETED',
                                        child: Text('Completed'))
                                  ]),
                    ),
                  Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                              onPressed: () => _addTopic(syllabus, chapter),
                              icon: const Icon(Icons.add),
                              label: const Text('Add topic')))),
                ],
              )),
          ]
        ]));
  }

  Widget _buildPlanEditor(TeacherClassInfo klass, TeacherSyllabus? syllabus) =>
      Card(
        child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(syllabus == null ? 'Create syllabus' : 'Edit syllabus',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 4),
                  const Text(
                      'Keep chapter names short and in teaching order. Add topics after saving.'),
                  const SizedBox(height: 16),
                  TextFormField(
                      key: ValueKey('subject-$_classId-$_editing'),
                      initialValue: _editing ? _subject : klass.subject,
                      decoration: const InputDecoration(
                          labelText: 'Subject', border: OutlineInputBorder()),
                      onChanged: (value) => _subject = value),
                  const SizedBox(height: 12),
                  for (var index = 0;
                      index < (_editing ? _chapters.length : 1);
                      index++)
                    Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Row(children: [
                          CircleAvatar(radius: 16, child: Text('${index + 1}')),
                          const SizedBox(width: 10),
                          Expanded(
                              child: TextFormField(
                                  key: ValueKey(
                                      'chapter-$index-${_chapters.elementAtOrNull(index)?.id}'),
                                  initialValue:
                                      _chapters.elementAtOrNull(index)?.title ??
                                          '',
                                  decoration: const InputDecoration(
                                      labelText: 'Chapter name',
                                      border: OutlineInputBorder()),
                                  onChanged: (value) {
                                    if (index < _chapters.length)
                                      _chapters[index].title = value;
                                  })),
                          IconButton(
                              onPressed: _chapters.length <= 1
                                  ? null
                                  : () =>
                                      setState(() => _chapters.removeAt(index)),
                              icon: const Icon(Icons.remove_circle_outline),
                              tooltip: 'Remove chapter'),
                        ])),
                  OutlinedButton.icon(
                      onPressed: () => setState(() =>
                          _chapters = [..._chapters, _ChapterDraft(null, '')]),
                      icon: const Icon(Icons.add),
                      label: const Text('Add chapter')),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                      onPressed:
                          _savingPlan ? null : () => _savePlan(klass, syllabus),
                      icon: _savingPlan
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.save_outlined),
                      label: Text(syllabus == null
                          ? 'Create syllabus'
                          : 'Save syllabus changes')),
                  if (syllabus != null)
                    TextButton(
                        onPressed: _savingPlan
                            ? null
                            : () => setState(() => _editing = false),
                        child: const Text('Cancel')),
                ])),
      );
}

class _ChapterDraft {
  _ChapterDraft(this.id, this.title);
  final String? id;
  String title;
}

class TeacherResultsScreen extends ConsumerStatefulWidget {
  const TeacherResultsScreen({super.key});
  @override
  ConsumerState<TeacherResultsScreen> createState() =>
      _TeacherResultsScreenState();
}

class _TeacherResultsScreenState extends ConsumerState<TeacherResultsScreen> {
  String? _definitionId;
  final _maximum = TextEditingController(text: '100');
  final _pass = TextEditingController(text: '40');
  final Map<String, TextEditingController> _scores = {};
  final Map<String, String> _papers = {};
  bool _saving = false;
  @override
  void dispose() {
    _maximum.dispose();
    _pass.dispose();
    for (final value in _scores.values) {
      value.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final workspace = ref.watch(teacherPortalViewModelProvider).workspace;
    final definitions =
        workspace?.resultDefinitions ?? const <TeacherResultDefinition>[];
    if (definitions.isNotEmpty &&
        !definitions.any((item) => item.id == _definitionId))
      _definitionId = definitions.first.id;
    final definition =
        definitions.where((item) => item.id == _definitionId).firstOrNull;
    final classes = workspace?.classes ?? const <TeacherClassInfo>[];
    final klass = definition == null
        ? null
        : classes.where((item) => item.id == definition.classId).firstOrNull;
    for (final student in klass?.students ?? const <TeacherStudent>[]) {
      _scores.putIfAbsent(student.id, TextEditingController.new);
    }
    Future<void> publish() async {
      final maximum = double.tryParse(_maximum.text);
      final pass = double.tryParse(_pass.text);
      if (definition == null ||
          klass == null ||
          maximum == null ||
          pass == null) return;
      final marks = <Map<String, dynamic>>[];
      for (final student in klass.students) {
        final score = double.tryParse(_scores[student.id]?.text ?? '');
        final paper = _papers[student.id];
        if (score == null || paper == null) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content:
                  Text('Enter marks and attach a paper for ${student.name}.')));
          return;
        }
        marks.add(
            {'studentId': student.id, 'score': score, 'resultSheetUrl': paper});
      }
      setState(() => _saving = true);
      try {
        final ids = await TeacherPortalRepository().saveResultDraft(
            definition: definition,
            classId: klass.id,
            maximum: maximum,
            passMarks: pass,
            marks: marks);
        await TeacherPortalRepository().publishResults(ids);
        await ref.read(teacherPortalViewModelProvider.notifier).refresh();
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Results published to students and parents.')));
        }
      } on ApiException catch (error) {
        if (context.mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(error.message)));
        }
      }
      if (mounted) setState(() => _saving = false);
    }

    return TeacherPortalScaffold(
        title: 'Enter results',
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const _FeatureHero(
              icon: Icons.analytics_outlined,
              eyebrow: 'ASSESSMENT',
              title: 'Results workspace',
              message:
                  'Record marks with individual paper evidence and publish them securely.'),
          const SizedBox(height: 20),
          const Text(
              'Choose an open assessment, enter every student’s marks, and attach their checked paper as evidence.'),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
              initialValue: _definitionId,
              isExpanded: true,
              decoration: const InputDecoration(
                  labelText: 'Assessment', border: OutlineInputBorder()),
              items: [
                for (final item in definitions)
                  DropdownMenuItem(
                      value: item.id,
                      child: Text('${item.title} · ${item.subject}',
                          maxLines: 1, overflow: TextOverflow.ellipsis))
              ],
              onChanged: (value) => setState(() => _definitionId = value)),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
                child: TextField(
                    controller: _maximum,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Full marks',
                        border: OutlineInputBorder()))),
            const SizedBox(width: 12),
            Expanded(
                child: TextField(
                    controller: _pass,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Pass marks', border: OutlineInputBorder())))
          ]),
          const SizedBox(height: 20),
          if (klass == null)
            const Card(
                child: ListTile(
                    leading: Icon(Icons.analytics_outlined),
                    title: Text('No open result assessment'),
                    subtitle: Text(
                        'A Branch Admin must open an assessment for one of your classes.')))
          else ...[
            Text('${klass.name} students',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            for (final student in klass.students)
              Card(
                  child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(student.name,
                                style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 10),
                            Row(children: [
                              Expanded(
                                  child: TextField(
                                      controller: _scores[student.id],
                                      keyboardType: TextInputType.number,
                                      decoration: const InputDecoration(
                                          labelText: 'Marks',
                                          border: OutlineInputBorder()))),
                              const SizedBox(width: 8),
                              OutlinedButton.icon(
                                  onPressed: () async {
                                    final paper = await _pickImageData();
                                    if (paper != null && mounted)
                                      setState(
                                          () => _papers[student.id] = paper);
                                  },
                                  icon: Icon(_papers.containsKey(student.id)
                                      ? Icons.check_circle
                                      : Icons.upload_file),
                                  label: Text(_papers.containsKey(student.id)
                                      ? 'Paper added'
                                      : 'Add paper'))
                            ])
                          ]))),
            const SizedBox(height: 12),
            FilledButton.icon(
                onPressed: _saving ? null : publish,
                icon: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.publish_outlined),
                label: const Text('Publish results'))
          ]
        ]));
  }
}
