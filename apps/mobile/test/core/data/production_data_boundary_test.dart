import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('production code does not import mobile mock or demo data sources', () {
    final lib = Directory('lib');
    final blockedSources = {
      'features/auth/data/mock_auth_service.dart',
      'features/student/data/student_demo_data.dart',
      'features/janitor/data/janitor_demo_data.dart',
      'shared/data/mock_portal_data.dart',
    };

    final offenders = <String>[];
    for (final file in lib
        .listSync(recursive: true)
        .whereType<File>()
        .where((file) => file.path.endsWith('.dart'))) {
      final normalizedPath = file.path.replaceAll('\\', '/');
      if (blockedSources.any(normalizedPath.endsWith)) continue;

      final contents = file.readAsStringSync();
      for (final blocked in blockedSources) {
        final basename = blocked.split('/').last;
        if (contents.contains(basename) || contents.contains(blocked)) {
          offenders.add('$normalizedPath imports or references $basename');
        }
      }
    }

    expect(offenders, isEmpty, reason: offenders.join('\n'));
  });
}
