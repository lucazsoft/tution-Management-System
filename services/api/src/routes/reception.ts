import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../utils/db';
import { authMiddleware } from '../middleware/auth';
import { TenantRequest } from '../middleware/tenant';
import { hasRole } from '../utils/access-control';
import { normalizeSchedule } from '../utils/schedule';
import { privateImageUrl } from '../services/object-storage';

const router = Router();

function receptionistBranch(req: TenantRequest, res: Response): string | null {
  if (!req.user || !hasRole(req.user, 'Receptionist')) {
    res.status(403).json({ error: 'Receptionist access is required.' });
    return null;
  }
  const assignments = req.user.roles.filter((role: any) => role.roleName === 'Receptionist' && role.branchId);
  if (assignments.length !== 1) {
    res.status(403).json({ error: 'A single branch assignment is required for front-desk access.' });
    return null;
  }
  return assignments[0].branchId;
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

router.get('/today', authMiddleware, async (req: TenantRequest, res: Response) => {
  const branchId = receptionistBranch(req, res);
  if (!branchId) return;
  const { start, end } = todayRange();
  const appointmentHorizon = new Date(start);
  appointmentHorizon.setDate(appointmentHorizon.getDate() + 30);

  try {
    const [branch, enrollments, checkIns, appointments, announcements, academicAttendance] = await Promise.all([
      prisma.branch.findFirst({ where: { id: branchId, tenantId: req.tenantId! }, select: { name: true } }),
      prisma.enrollment.findMany({
        where: { status: 'ACTIVE', class: { branchId } },
        select: {
          student: { select: { id: true, user: { select: { firstName: true, lastName: true, image: true } } } },
          class: { select: { name: true, schedule: true } },
        },
        orderBy: { student: { user: { firstName: 'asc' } } },
      }),
      prisma.receptionCheckIn.findMany({ where: { tenantId: req.tenantId!, branchId, checkInDate: start } }),
      prisma.appointment.findMany({
        where: {
          tenantId: req.tenantId!,
          status: { in: ['APPROVED', 'CONFIRMED'] },
          scheduledTime: { gte: start, lt: appointmentHorizon },
          student: { enrollments: { some: { class: { branchId } } } },
        },
        select: {
          id: true, scheduledTime: true, status: true,
          requestedBy: { select: { firstName: true, lastName: true } },
          teacher: { select: { firstName: true, lastName: true } },
        },
        orderBy: { scheduledTime: 'asc' },
      }),
      prisma.academicEvent.findMany({
        where: {
          tenantId: req.tenantId!, eventType: 'EVENT',
          OR: [{ branchId }, { branchId: null }], startDate: { lte: appointmentHorizon }, endDate: { gte: start },
        },
        select: { id: true, title: true, description: true }, orderBy: { startDate: 'asc' },
      }),
      prisma.studentAttendance.findMany({ where: { date: { gte: start, lt: end }, class: { branchId, course: { tenantId: req.tenantId! } } }, include: { student: { include: { user: { select: { firstName: true, lastName: true } } } }, class: { include: { course: { select: { name: true } }, assignedTeacher: { select: { firstName: true, lastName: true } } } } }, orderBy: [{ class: { name: 'asc' } }, { student: { user: { firstName: 'asc' } } }] }),
    ]);
    if (!branch) return res.status(404).json({ error: 'Assigned branch was not found.' });

    const checkedByStudent = new Map(checkIns.map((item) => [item.studentId, item.checkedInAt]));
    const rosterByStudent = new Map<string, {
      id: string; name: string; image: string | null; classNames: string[]; schedules: unknown[]; checkedInAt: Date | null;
    }>();
    for (const item of enrollments) {
      const current = rosterByStudent.get(item.student.id) ?? {
        id: item.student.id,
        name: `${item.student.user.firstName} ${item.student.user.lastName}`.trim(),
        image: item.student.user.image,
        classNames: [],
        schedules: [],
        checkedInAt: checkedByStudent.get(item.student.id) ?? null,
      };
      if (!current.classNames.includes(item.class.name)) current.classNames.push(item.class.name);
      current.schedules.push(normalizeSchedule(item.class.schedule));
      rosterByStudent.set(item.student.id, current);
    }
    const roster = await Promise.all(Array.from(rosterByStudent.values()).map(async (item) => ({
      id: item.id,
      name: item.name,
      className: item.classNames.join(' · '),
      schedule: item.schedules,
      checkedInAt: item.checkedInAt,
      photoUrl: await privateImageUrl(item.image),
    })));

    return res.json({
      branchName: branch.name,
      roster,
      appointments: appointments.map((item) => ({
        id: item.id, scheduledTime: item.scheduledTime, status: item.status,
        parentName: `${item.requestedBy.firstName} ${item.requestedBy.lastName}`.trim(),
        destination: `${item.teacher.firstName} ${item.teacher.lastName}`.trim(),
      })),
      announcements,
      academicAttendance: academicAttendance.map((row) => ({ id: row.id, studentName: `${row.student.user.firstName} ${row.student.user.lastName}`.trim(), className: row.class.name, subject: row.class.course.name, teacherName: row.class.assignedTeacher ? `${row.class.assignedTeacher.firstName} ${row.class.assignedTeacher.lastName}`.trim() : 'Unassigned', status: row.status })),
    });
  } catch {
    return res.status(500).json({ error: 'Failed to load the front-desk workspace.' });
  }
});

router.post('/students/:studentId/check-in', authMiddleware, async (req: TenantRequest, res: Response) => {
  const branchId = receptionistBranch(req, res);
  if (!branchId) return;
  const { start } = todayRange();
  try {
    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: req.params.studentId, status: 'ACTIVE', class: { branchId, branch: { tenantId: req.tenantId! } } },
      select: { studentId: true },
    });
    if (!enrollment) return res.status(404).json({ error: 'Student is not on this branch roster.' });
    const checkIn = await prisma.receptionCheckIn.create({
      data: { tenantId: req.tenantId!, branchId, studentId: enrollment.studentId, checkedInById: req.user!.id, checkInDate: start },
      select: { checkedInAt: true },
    });
    return res.status(201).json({ message: 'Student checked in at the front desk.', checkedInAt: checkIn.checkedInAt });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Student is already checked in today.' });
    }
    return res.status(500).json({ error: 'Student check-in could not be recorded.' });
  }
});

export default router;
