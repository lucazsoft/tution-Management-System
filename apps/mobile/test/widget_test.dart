import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tms_mobile/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('shows login screen by default', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: TMSApp()));
    await tester.pumpAndSettle();

    expect(find.text('Welcome Back'), findsOneWidget);
    expect(
      find.text('Sign in to your Tuition Management account'),
      findsOneWidget,
    );
    expect(find.text('Sign In'), findsOneWidget);
  });
}
