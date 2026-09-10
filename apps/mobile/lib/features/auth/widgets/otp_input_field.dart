import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:tms_mobile/core/theme/app_colors.dart';
import 'package:tms_mobile/core/theme/app_tokens.dart';

class OtpInputField extends StatefulWidget {
  const OtpInputField({
    super.key,
    required this.onComplete,
    this.onChanged,
    this.autoFocus = false,
  });

  final ValueChanged<String> onComplete;
  final ValueChanged<String>? onChanged;
  final bool autoFocus;

  @override
  State<OtpInputField> createState() => _OtpInputFieldState();
}

class _OtpInputFieldState extends State<OtpInputField> {
  late final List<TextEditingController> _controllers;
  late final List<FocusNode> _focusNodes;

  @override
  void initState() {
    super.initState();
    _controllers = List.generate(6, (_) => TextEditingController());
    _focusNodes = List.generate(6, (_) => FocusNode());
    if (widget.autoFocus) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _focusNodes.first.requestFocus();
        }
      });
    }
  }

  @override
  void dispose() {
    for (final controller in _controllers) {
      controller.dispose();
    }
    for (final node in _focusNodes) {
      node.dispose();
    }
    super.dispose();
  }

  void _emitValue() {
    final code = _controllers.map((controller) => controller.text).join();
    widget.onChanged?.call(code);
    if (code.length == 6 &&
        !_controllers.any((controller) => controller.text.isEmpty)) {
      widget.onComplete(code);
    }
  }

  void _setCell(int index, String value) {
    _controllers[index].text = value;
    _controllers[index].selection =
        TextSelection.collapsed(offset: value.length);
  }

  void _distributeDigits(int startIndex, String input) {
    final digits = input.replaceAll(RegExp(r'\D'), '');
    setState(() {
      for (var i = startIndex; i < _controllers.length; i++) {
        final digitIndex = i - startIndex;
        _setCell(i, digitIndex < digits.length ? digits[digitIndex] : '');
      }
    });
    final target =
        (startIndex + digits.length).clamp(0, _focusNodes.length - 1);
    _focusNodes[target].requestFocus();
    _emitValue();
  }

  void _handleChanged(int index, String value) {
    final digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) {
      setState(() => _setCell(index, ''));
      _emitValue();
      return;
    }

    if (digits.length > 1) {
      _distributeDigits(index, digits);
      return;
    }

    setState(() => _setCell(index, digits));
    if (index < _focusNodes.length - 1) {
      _focusNodes[index + 1].requestFocus();
    } else {
      _focusNodes[index].unfocus();
    }
    _emitValue();
  }

  KeyEventResult _handleKeyEvent(int index, KeyEvent event) {
    if (event is KeyDownEvent &&
        event.logicalKey == LogicalKeyboardKey.backspace &&
        _controllers[index].text.isEmpty &&
        index > 0) {
      setState(() => _setCell(index - 1, ''));
      _focusNodes[index - 1].requestFocus();
      _emitValue();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: List.generate(
        6,
        (index) => SizedBox(
          width: 44,
          height: 54,
          child: Focus(
            onKeyEvent: (_, event) => _handleKeyEvent(index, event),
            child: TextField(
              controller: _controllers[index],
              focusNode: _focusNodes[index],
              keyboardType: TextInputType.number,
              textInputAction:
                  index == 5 ? TextInputAction.done : TextInputAction.next,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                isDense: true,
                filled: true,
                fillColor: Colors.white,
                contentPadding: EdgeInsets.zero,
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(TmsRadius.r8),
                  borderSide: BorderSide(
                    color: _controllers[index].text.isEmpty
                        ? const Color(0xFFC8D0DB)
                        : kColorPrimaryLight,
                  ),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(TmsRadius.r8),
                  borderSide:
                      const BorderSide(color: kColorPrimaryLight, width: 2),
                ),
              ),
              onChanged: (value) => _handleChanged(index, value),
            ),
          ),
        ),
      ),
    );
  }
}
