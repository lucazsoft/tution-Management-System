import assert from 'node:assert/strict';
import prisma from '../utils/db';
import { listPendingPastUpdates, mergePendingUpdates, pendingPastSessionWhere } from './pending-updates';

async function main() {
  const today = new Date(Date.UTC(2026, 10, 25));

  // The check-in guard and the portal list must use one predicate.
  const where = pendingPastSessionWhere('teacher-1', 'tenant-1', today);
  assert.deepEqual(where, {
    teacherId: 'teacher-1',
    dailyUpdateSubmitted: false,
    date: { lt: today },
    class: { course: { tenantId: 'tenant-1' } },
  });
  // Nothing in it depends on the class's current teacher, archive state or a row limit.
  assert.equal(JSON.stringify(where).includes('archivedAt'), false);

  // A past session of a class that was reassigned to another teacher is still listed.
  let captured: any;
  (prisma as any).teacherSession = {
    findMany: async (args: any) => {
      captured = args;
      return [{
        id: 'session-reassigned', classId: 'class-science', date: new Date(Date.UTC(2026, 8, 2)),
        class: { name: 'Science', teacherId: 'other-teacher', course: { name: 'Science course' } },
      }];
    },
  };
  const list = await listPendingPastUpdates('teacher-1', 'tenant-1');
  assert.equal(captured.where.teacherId, 'teacher-1');
  assert.equal(captured.where.class.course.tenantId, 'tenant-1');
  assert.equal('archivedAt' in captured.where.class, false);
  assert.deepEqual(list.map((item) => [item.sessionId, item.classId, item.className, item.courseName]), [
    ['session-reassigned', 'class-science', 'Science', 'Science course'],
  ]);

  // Merge keeps blocking sessions first and never duplicates a session.
  const merged = mergePendingUpdates(
    [{ sessionId: 'a' }, { sessionId: 'b' }],
    [{ sessionId: 'b' }, { sessionId: 'today' }],
  );
  assert.deepEqual(merged.map((item) => item.sessionId), ['a', 'b', 'today']);
  console.log('pending-updates tests passed');
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
