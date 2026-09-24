import 'dart:async';

import 'package:flutter/material.dart';

import 'package:tms_mobile/core/theme/app_colors.dart';

class SkeletonLoader extends StatefulWidget {
  const SkeletonLoader({
    super.key,
    required this.height,
    this.width,
    this.borderRadius = 12,
  });

  final double height;
  final double? width;
  final double borderRadius;

  @override
  State<SkeletonLoader> createState() => _SkeletonLoaderState();
}

class _SkeletonLoaderState extends State<SkeletonLoader> {
  Timer? _timer;
  var _highlight = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(milliseconds: 900), (Timer timer) {
      if (mounted) {
        setState(() {
          _highlight = !_highlight;
        });
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 900),
      curve: Curves.easeInOut,
      width: widget.width,
      height: widget.height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(widget.borderRadius),
        gradient: LinearGradient(
          begin: _highlight ? Alignment.topLeft : Alignment.bottomRight,
          end: _highlight ? Alignment.bottomRight : Alignment.topLeft,
          colors: const <Color>[
            kColorSurface,
            kColorDivider,
            kColorSurface,
          ],
        ),
      ),
    );
  }
}
