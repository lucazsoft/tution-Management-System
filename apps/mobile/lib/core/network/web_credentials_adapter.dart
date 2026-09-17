export 'web_credentials_adapter_stub.dart'
    if (dart.library.js_interop) 'web_credentials_adapter_web.dart'
    if (dart.library.html) 'web_credentials_adapter_web.dart';
