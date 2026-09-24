export type NotificationCategory =
  | 'ATTENDANCE'
  | 'LEAVE'
  | 'ANOMALY'
  | 'PAYROLL'
  | 'GENERAL';

export type NotificationRecordInput = {
  tenantId: string;
  userId: string;
  branchId?: string;
  category: NotificationCategory | string;
  title: string;
  body: string;
  destination?: string;
  entityId?: string;
};

type NotificationStore = {
  notification?: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
};

/**
 * Persists a notification record for later listing via `GET /api/notifications`.
 *
 * Fail-open by contract: persistence must never roll back the business change
 * it annotates (attendance stamps, leave transitions, anomaly scans), so every
 * failure — including a client that predates the Notification model — resolves
 * to null instead of throwing. Callers always pass server-side session scope;
 * client-supplied ids are never accepted here or in the routes.
 */
export async function recordNotification(
  db: NotificationStore,
  input: NotificationRecordInput,
): Promise<unknown> {
  try {
    const create = db?.notification?.create;
    if (typeof create !== 'function') return null;
    return await create.call(db.notification, {
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        category: input.category,
        title: input.title,
        body: input.body,
        ...(input.destination ? { destination: input.destination } : {}),
        ...(input.entityId ? { entityId: input.entityId } : {}),
      },
    });
  } catch {
    return null;
  }
}
