import 'package:flutter/material.dart';
import 'package:nepali_utils/nepali_utils.dart';

import '../../core/theme/app_theme.dart';
import 'academic_calendar.dart';

class MeetingScheduleFields extends StatelessWidget {
  const MeetingScheduleFields({
    super.key,
    required this.reasonController,
    required this.scheduled,
    required this.earliest,
    required this.onScheduledChanged,
    required this.actionLabel,
    required this.onAction,
    this.busy = false,
    this.reasonError,
    this.onReasonChanged,
    this.selectableDayPredicate,
    this.holidayPredicate,
    this.redDayPredicate,
    this.redDayLegend = 'Holiday',
    this.hasSelectedTime,
    this.onTimeSelected,
    this.lastDate,
  });

  final TextEditingController reasonController;
  final DateTime? scheduled;
  final DateTime earliest;
  final ValueChanged<DateTime> onScheduledChanged;
  final String actionLabel;
  final VoidCallback? onAction;
  final bool busy;
  final String? reasonError;
  final ValueChanged<String>? onReasonChanged;
  final bool Function(DateTime day)? selectableDayPredicate;
  final bool Function(DateTime day)? holidayPredicate;
  final bool Function(DateTime day)? redDayPredicate;
  final String redDayLegend;
  final bool? hasSelectedTime;
  final VoidCallback? onTimeSelected;
  final DateTime? lastDate;

  Future<void> _pickTime(BuildContext context) async {
    var initial = scheduled ?? earliest;
    final maximum = lastDate ?? earliest.add(const Duration(days: 365));
    while (selectableDayPredicate?.call(initial) == false &&
        initial.isBefore(maximum)) {
      initial = initial.add(const Duration(days: 1));
    }
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (time == null || !context.mounted) return;
    final day = initial;
    final value =
        DateTime(day.year, day.month, day.day, time.hour, time.minute);
    if (value.isBefore(earliest)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:
            Text('Choose a date and time after the booking notice period.'),
      ));
      return;
    }
    onTimeSelected?.call();
    onScheduledChanged(value);
  }

  void _selectDate(DateTime date) {
    if (selectableDayPredicate?.call(date) == false) return;
    final current = scheduled ?? earliest;
    var value = DateTime(
      date.year,
      date.month,
      date.day,
      current.hour,
      current.minute,
    );
    if (value.isBefore(earliest)) value = earliest;
    onScheduledChanged(value);
  }

  String _timeLabel(DateTime? value) {
    if (value == null) return 'Select time';
    final time = TimeOfDay.fromDateTime(value);
    final hour = time.hourOfPeriod == 0 ? 12 : time.hourOfPeriod;
    return '${hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')} ${time.period == DayPeriod.am ? 'AM' : 'PM'}';
  }

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: reasonController,
            onChanged: onReasonChanged,
            maxLength: 2000,
            minLines: 3,
            maxLines: 5,
            decoration: InputDecoration(
              labelText: 'Reason for meeting',
              errorText: reasonError,
            ),
          ),
          const SizedBox(height: 8),
          NepaliMeetingCalendar(
            selectedDate: scheduled ?? earliest,
            firstDate: earliest,
            lastDate: lastDate ?? earliest.add(const Duration(days: 365)),
            onDateSelected: busy ? null : _selectDate,
            selectableDayPredicate: selectableDayPredicate,
            holidayPredicate: holidayPredicate,
            redDayPredicate: redDayPredicate,
            redDayLegend: redDayLegend,
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: busy ? null : () => _pickTime(context),
                  icon: const Icon(Icons.schedule_rounded, size: 18),
                  label: Text(_timeLabel(
                    hasSelectedTime == false ? null : scheduled,
                  )),
                ),
              ),
              const SizedBox(width: 10),
              SizedBox(
                width: 148,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.blue,
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(44),
                  ),
                  onPressed: busy ? null : onAction,
                  child: Text(busy ? 'Please wait…' : actionLabel),
                ),
              ),
            ],
          ),
        ],
      );
}

class NepaliMeetingCalendar extends StatefulWidget {
  const NepaliMeetingCalendar({
    super.key,
    required this.selectedDate,
    required this.firstDate,
    required this.lastDate,
    required this.onDateSelected,
    this.selectableDayPredicate,
    this.holidayPredicate,
    this.redDayPredicate,
    this.redDayLegend = 'Holiday',
  });

  final DateTime selectedDate;
  final DateTime firstDate;
  final DateTime lastDate;
  final ValueChanged<DateTime>? onDateSelected;
  final bool Function(DateTime day)? selectableDayPredicate;
  final bool Function(DateTime day)? holidayPredicate;
  final bool Function(DateTime day)? redDayPredicate;
  final String redDayLegend;

  @override
  State<NepaliMeetingCalendar> createState() => _NepaliMeetingCalendarState();
}

class _NepaliMeetingCalendarState extends State<NepaliMeetingCalendar> {
  late DateTime _month;

  @override
  void initState() {
    super.initState();
    _month = _monthStart(widget.selectedDate);
  }

  @override
  void didUpdateWidget(covariant NepaliMeetingCalendar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_same(oldWidget.selectedDate, widget.selectedDate)) {
      _month = _monthStart(widget.selectedDate);
    }
  }

  DateTime _monthStart(DateTime date) {
    final bs = date.toNepaliDateTime();
    return NepaliDateTime(bs.year, bs.month).toDateTime();
  }

  bool _same(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  bool _beforeDay(DateTime a, DateTime b) => DateTime(a.year, a.month, a.day)
      .isBefore(DateTime(b.year, b.month, b.day));

  bool _afterDay(DateTime a, DateTime b) => DateTime(a.year, a.month, a.day)
      .isAfter(DateTime(b.year, b.month, b.day));

  @override
  Widget build(BuildContext context) {
    final monthBs = _month.toNepaliDateTime();
    final days = nepaliMonthGrid(_month);
    final previous = shiftNepaliMonth(_month, -1);
    final next = shiftNepaliMonth(_month, 1);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(TmsSpace.md),
        child: Column(
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: 'Previous Nepali month',
                  onPressed: _afterDay(widget.firstDate, _month)
                      ? null
                      : () => setState(() => _month = previous),
                  icon: const Icon(Icons.chevron_left_rounded),
                ),
                Expanded(
                  child: Text(
                    '${academicNepaliMonths[monthBs.month - 1]} ${_nepaliDigits('${monthBs.year}')} BS',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                IconButton(
                  tooltip: 'Next Nepali month',
                  onPressed: _beforeDay(widget.lastDate, next)
                      ? null
                      : () => setState(() => _month = next),
                  icon: const Icon(Icons.chevron_right_rounded),
                ),
              ],
            ),
            Row(
              children: [
                for (final label in academicNepaliWeekdays)
                  Expanded(
                    child: Text(label,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.labelSmall),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: days.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 7,
                mainAxisExtent: 48,
              ),
              itemBuilder: (context, index) {
                final date = days[index];
                final bs = date.toNepaliDateTime();
                final outside =
                    bs.month != monthBs.month || bs.year != monthBs.year;
                final selected = _same(date, widget.selectedDate);
                final redDay = (widget.holidayPredicate?.call(date) ?? false) ||
                    (widget.redDayPredicate?.call(date) ?? false);
                final enabled = !outside &&
                    !_beforeDay(date, widget.firstDate) &&
                    !_afterDay(date, widget.lastDate) &&
                    (widget.selectableDayPredicate?.call(date) ?? true) &&
                    widget.onDateSelected != null;
                return InkWell(
                  key: ValueKey('meeting-bs-${bs.year}-${bs.month}-${bs.day}'),
                  borderRadius: BorderRadius.circular(10),
                  onTap: enabled ? () => widget.onDateSelected!(date) : null,
                  child: Container(
                    margin: const EdgeInsets.all(2),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: redDay
                          ? (selected
                              ? Colors.red.shade700
                              : Colors.red.shade50)
                          : selected
                              ? kColorPrimary
                              : null,
                      border: redDay
                          ? Border.all(color: Colors.red.shade400)
                          : null,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          _nepaliDigits('${bs.day}'),
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: redDay
                                ? selected
                                    ? Colors.white
                                    : Colors.red.shade700
                                : selected
                                    ? Colors.white
                                    : enabled
                                        ? kColorText
                                        : Theme.of(context).disabledColor,
                          ),
                        ),
                        Text(
                          '${date.day}',
                          style: TextStyle(
                            fontSize: 10,
                            color: redDay
                                ? selected
                                    ? Colors.white70
                                    : Colors.red.shade600
                                : selected
                                    ? Colors.white70
                                    : enabled
                                        ? kColorMutedText
                                        : Theme.of(context).disabledColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
            if (widget.holidayPredicate != null ||
                widget.redDayPredicate != null) ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        border: Border.all(color: Colors.red.shade400),
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      widget.redDayLegend,
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                            color: Colors.red.shade700,
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

String _nepaliDigits(String value) => value.replaceAllMapped(
      RegExp(r'\d'),
      (match) => '०१२३४५६७८९'[int.parse(match.group(0)!)],
    );
