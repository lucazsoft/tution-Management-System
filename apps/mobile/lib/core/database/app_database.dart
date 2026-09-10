import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'app_database.g.dart';

/// v1 offline-first schema (MOB-007, minimal).
///
/// Two tables only:
/// * [SyncQueue] — pending mutations with idempotency keys, replayed FIFO.
/// * [EntityCache] — generic per-user entity cache with updated-at stamps.
///
/// Security: rows are always scoped by [ownerUserId]. NEVER store
/// credentials, session cookies, or passwords here (see OFFLINE_POLICY.md).
/// All rows for a user are wiped on logout / 401 via [clearOfflineCache].
class SyncQueue extends Table {
  IntColumn get id => integer().autoIncrement()();

  /// Client-generated idempotency key (uuid v4). Unique: re-enqueue of the
  /// same key is a no-op so retries never double-apply server-side.
  TextColumn get idempotencyKey => text().unique()();

  /// Owning user id. Queue rows are per-user and wiped on logout/401.
  TextColumn get ownerUserId => text()();

  /// HTTP method: POST, PUT, PATCH, DELETE.
  TextColumn get method => text()();

  /// API path, e.g. `/api/tasks/123`.
  TextColumn get path => text()();

  /// JSON-encoded request body (null for bodyless e.g. DELETE).
  TextColumn get bodyJson => text().nullable()();

  /// Number of replay attempts so far (for backoff / poison-pill triage).
  IntColumn get attempts => integer().withDefault(const Constant(0))();

  /// Epoch millis, insertion order = replay order (FIFO per user).
  IntColumn get createdAt => integer()();
}

class EntityCache extends Table {
  IntColumn get id => integer().autoIncrement()();

  /// Owning user id. Scoped per user, wiped on logout/401.
  TextColumn get ownerUserId => text()();

  /// Entity collection, e.g. `tasks`, `profile`.
  TextColumn get entityType => text()();

  /// Server-side id of the entity.
  TextColumn get entityId => text()();

  /// JSON-encoded entity payload.
  TextColumn get payloadJson => text()();

  /// Epoch millis of last write; used for staleness display + LRU trims.
  IntColumn get updatedAt => integer()();

  @override
  List<Set<Column>> get uniqueKeys => [
        {ownerUserId, entityType, entityId},
      ];
}

@DriftDatabase(tables: [SyncQueue, EntityCache])
class AppDatabase extends _$AppDatabase {
  AppDatabase()
      : super(
          driftDatabase(
            name: 'tms_offline',
            web: DriftWebOptions(
              sqlite3Wasm: Uri.parse('sqlite3.wasm'),
              driftWorker: Uri.parse('drift_worker.js'),
            ),
          ),
        );

  /// Test / in-memory constructor.
  AppDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) async => m.createAll(),
        onUpgrade: (m, from, to) async {
          // v1 is the first schema; future versions add stepByStep here.
        },
      );

  /// Wipe every row owned by [userId] (logout / 401 path).
  ///
  /// Exposed so the network owner (MOB-network, owns
  /// `lib/core/network/`) can call it from `ApiClient.clearAuth`-equivalent
  /// flows without importing sync internals: see `clearOfflineCache()`.
  Future<void> clearUserData(String userId) async {
    await (delete(syncQueue)..where((t) => t.ownerUserId.equals(userId))).go();
    await (delete(entityCache)..where((t) => t.ownerUserId.equals(userId)))
        .go();
  }
}

/// Global wipe hook the auth/network layer can call on logout or 401.
///
/// MOB-007 must not modify `lib/core/network/` (owned by another agent), so
/// this indirection is the contract: whoever owns `ApiClient.clearAuth`
/// calls [clearOfflineCache] from there. The database instance is registered
/// once at startup via [registerOfflineDatabase]; until then the call is a
/// safe no-op (plus records the user id for a late wipe).
AppDatabase? _registeredDb;
String? _pendingWipeUserId;

Future<void> registerOfflineDatabase(AppDatabase db) async {
  _registeredDb = db;
  final pending = _pendingWipeUserId;
  if (pending != null) {
    _pendingWipeUserId = null;
    await db.clearUserData(pending);
  }
}

/// Wipe all offline rows for [userId]. Safe to call before init (deferred).
Future<void> clearOfflineCache(String userId) async {
  final db = _registeredDb;
  if (db == null) {
    _pendingWipeUserId = userId;
    return;
  }
  await db.clearUserData(userId);
}
