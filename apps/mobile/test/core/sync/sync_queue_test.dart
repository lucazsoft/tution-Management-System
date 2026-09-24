import 'package:flutter_test/flutter_test.dart';
import 'package:tms_mobile/core/sync/sync_models.dart';
import 'package:tms_mobile/core/sync/sync_queue.dart';

/// In-memory fake so queue logic is tested without sqlite.
class FakeSyncQueueStore implements SyncQueueStore {
  final Map<String, SyncOperation> rows = {};
  final List<String> replayOrder = [];

  @override
  Future<bool> insert(SyncOperation op) async {
    if (rows.containsKey(op.idempotencyKey)) return false;
    rows[op.idempotencyKey] = op;
    return true;
  }

  @override
  Future<List<SyncOperation>> pendingForUser(String userId) async {
    final list = rows.values.where((o) => o.ownerUserId == userId).toList();
    list.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return list;
  }

  @override
  Future<void> remove(String key) async {
    rows.remove(key);
  }

  @override
  Future<void> bumpAttempts(String key, int attempts) async {
    final op = rows[key];
    if (op != null) rows[key] = op.withAttempts(attempts);
  }

  @override
  Future<int> countForUser(String userId) async =>
      rows.values.where((o) => o.ownerUserId == userId).length;

  @override
  Future<void> clearUser(String userId) async {
    rows.removeWhere((_, o) => o.ownerUserId == userId);
  }
}

SyncOperation op(String key, String user, int t) => SyncOperation(
      idempotencyKey: key,
      ownerUserId: user,
      method: 'POST',
      path: '/api/tasks',
      createdAt: t,
    );

void main() {
  group('SyncQueueService', () {
    test('duplicate idempotency key enqueues once', () async {
      final store = FakeSyncQueueStore();
      final queue = SyncQueueService(store);
      expect(
          await queue.enqueue(
              ownerUserId: 'u1',
              method: 'POST',
              path: '/api/tasks',
              idempotencyKey: 'k1'),
          isTrue);
      expect(
          await queue.enqueue(
              ownerUserId: 'u1',
              method: 'POST',
              path: '/api/tasks',
              idempotencyKey: 'k1'),
          isFalse);
      expect(await queue.pendingCount('u1'), 1);
      queue.dispose();
    });

    test('drain replays FIFO and drops applied ops', () async {
      final store = FakeSyncQueueStore();
      final queue = SyncQueueService(store);
      await store.insert(op('k1', 'u1', 3));
      await store.insert(op('k2', 'u1', 1));
      await store.insert(op('k3', 'u1', 2));
      final seen = <String>[];
      final result = await queue.drain('u1', (o) async {
        seen.add(o.idempotencyKey);
        return ReplayOutcome.applied;
      });
      expect(seen, ['k2', 'k3', 'k1']);
      expect(result.replayed, 3);
      expect(result.failed, 0);
      expect(await queue.pendingCount('u1'), 0);
      queue.dispose();
    });

    test('drain stops at first retryable, keeps order', () async {
      final store = FakeSyncQueueStore();
      final queue = SyncQueueService(store);
      await store.insert(op('k1', 'u1', 1));
      await store.insert(op('k2', 'u1', 2));
      final seen = <String>[];
      final result = await queue.drain('u1', (o) async {
        seen.add(o.idempotencyKey);
        return ReplayOutcome.retryable;
      });
      expect(seen, ['k1']); // k2 untouched, order preserved
      expect(result.failed, 1);
      expect(await queue.pendingCount('u1'), 2);
      expect(store.rows['k1']!.attempts, 1);
      queue.dispose();
    });

    test('server wins: conflict dropped + notified, drain continues', () async {
      final store = FakeSyncQueueStore();
      final queue = SyncQueueService(store);
      await store.insert(op('k1', 'u1', 1));
      await store.insert(op('k2', 'u1', 2));
      final notified = <SyncConflict>[];
      final sub = queue.conflicts.listen(notified.add);
      final result = await queue.drain(
        'u1',
        (o) async => o.idempotencyKey == 'k1'
            ? ReplayOutcome.conflict
            : ReplayOutcome.applied,
      );
      expect(result.replayed, 2);
      expect(result.conflicts, hasLength(1));
      expect(result.conflicts.single.path, '/api/tasks');
      expect(notified, hasLength(1));
      expect(await queue.pendingCount('u1'), 0);
      await sub.cancel();
      queue.dispose();
    });

    test('queue is per-user scoped', () async {
      final store = FakeSyncQueueStore();
      final queue = SyncQueueService(store);
      await store.insert(op('k1', 'u1', 1));
      await store.insert(op('k2', 'u2', 1));
      await queue.drain('u1', (_) async => ReplayOutcome.applied);
      expect(await queue.pendingCount('u1'), 0);
      expect(await queue.pendingCount('u2'), 1);
      queue.dispose();
    });
  });
}
