export 'connectivity_check_io.dart'
    if (dart.library.js_interop) 'connectivity_check_web.dart'
    if (dart.library.html) 'connectivity_check_web.dart';
