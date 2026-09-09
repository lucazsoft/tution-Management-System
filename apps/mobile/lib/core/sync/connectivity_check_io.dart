import 'dart:io';

Future<bool> checkTcpSocket(String target, int port) async {
  try {
    final socket =
        await Socket.connect(target, port, timeout: const Duration(seconds: 3));
    socket.destroy();
    return true;
  } catch (_) {
    return false;
  }
}
