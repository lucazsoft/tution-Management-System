/// Dedicated daily class update flow for teacher sessions.
library;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/features/teacher/models/teacher_portal_dto.dart';

class DailyUpdateScreen extends StatefulWidget {
  const DailyUpdateScreen({
    super.key,
    required this.pending,
    required this.onSubmit,
  });

  final TeacherPendingUpdate pending;
  final Future<bool> Function(String content) onSubmit;

  @override
  State<DailyUpdateScreen> createState() => _DailyUpdateScreenState();
}

class _DailyUpdateScreenState extends State<DailyUpdateScreen> {
  final _controller = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final content = _controller.text.trim();
    if (content.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Daily update content is required.')),
      );
      return;
    }
    setState(() => _submitting = true);
    final submitted = await widget.onSubmit(content);
    if (!mounted) return;
    if (submitted) {
      Navigator.of(context).pop();
    } else {
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not submit the daily update.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = widget.pending;
    final dateLabel = pending.date == null
        ? 'Today'
        : pending.date!.toLocal().toString().split(' ').first;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Daily Update',
          style:
              GoogleFonts.fraunces(fontWeight: FontWeight.w700, fontSize: 22),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      pending.courseName,
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 4),
                    Text('${pending.className} - $dateLabel'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _controller,
              autofocus: true,
              minLines: 8,
              maxLines: 12,
              maxLength: 5000,
              textInputAction: TextInputAction.newline,
              decoration: const InputDecoration(
                labelText: 'What was covered?',
                hintText: 'Summarize lessons, exercises, blockers, or notes.',
                alignLabelWithHint: true,
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _submitting ? null : _submit,
              icon: _submitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send_outlined),
              label: Text(_submitting ? 'Submitting update' : 'Submit update'),
            ),
          ],
        ),
      ),
    );
  }
}
