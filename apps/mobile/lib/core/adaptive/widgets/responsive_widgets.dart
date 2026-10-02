import 'package:flutter/material.dart';
import '../breakpoints.dart';
import '../../../../features/auth/screens/login_screen.dart';

class LoginScreenResponsive extends StatelessWidget {
  final LayoutSizeClass sizeClass;

  const LoginScreenResponsive({required this.sizeClass, super.key});

  @override
  Widget build(BuildContext context) {
    return const LoginScreen();
  }
}

class TeacherHomeScreenResponsive extends StatelessWidget {
  final LayoutSizeClass sizeClass;

  const TeacherHomeScreenResponsive({required this.sizeClass, super.key});

  @override
  Widget build(BuildContext context) {
    if (sizeClass.isCompact) {
      return const Scaffold(
        body: Column(
          children: [
            Text('Teacher Dashboard'),
            Expanded(child: Text('Content for teacher home')),
          ],
        ),
      );
    } else {
      return const Row(
        children: [
          Expanded(child: Text('Teacher Dashboard')),
          Expanded(child: Text('Content for teacher home')),
        ],
      );
    }
  }
}

class StudentHomeScreenResponsive extends StatelessWidget {
  final LayoutSizeClass sizeClass;

  const StudentHomeScreenResponsive({required this.sizeClass, super.key});

  @override
  Widget build(BuildContext context) {
    if (sizeClass.isCompact) {
      return const Scaffold(
        body: Column(
          children: [
            Text('Student Dashboard'),
            Expanded(child: Text('Content for student home')),
          ],
        ),
      );
    } else {
      return const Row(
        children: [
          Expanded(child: Text('Student Dashboard')),
          Expanded(child: Text('Content for student home')),
        ],
      );
    }
  }
}
