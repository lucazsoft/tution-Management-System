import 'package:dio/dio.dart';
import 'package:dio_web_adapter/dio_web_adapter.dart';

HttpClientAdapter buildWebCredentialsAdapter() {
  return BrowserHttpClientAdapter(withCredentials: true);
}
