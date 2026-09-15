import { Router, Response } from 'express';
import prisma from '../utils/db';
import { calculateDistanceInMeters } from '../utils/geo';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware, hasPermission } from '../middleware/auth';
import { parseStrictKeys, readFiniteNumber, readTrimmedString } from '../utils/request-validation';
import { nepalCalendarDate } from '../services/timetable-service';
import { recordNotification } from '../services/notification-records';

const router = Router();

// Constant GPS accuracy threshold in meters
const MAX_GPS_ACCURACY_METERS = 20.0;

function findAssignedTeacherBranch(branchId: string, teacherId: string, tenantId: string) {
  return prisma.branch.findFirst({
    where: {
      id: branchId,
      tenantId,
      classes: {
        some: {
          teacherId,
          archivedAt: null,
          course: { tenantId },
        },
      },
    },
  });
}

function parseGeoAttendanceInput(body: unknown) {
  const shape = parseStrictKeys(body, ['branchId', 'latitude', 'longitude', 'gpsAccuracy']);
  if (!shape.success) return shape;
  const branchId = readTrimmedString(shape.data, 'branchId', { required: true, maxLength: 128, message: 'A valid branchId is required.' });
  const latitude = readFiniteNumber(shape.data, 'latitude', { min: -90, max: 90, message: 'Latitude must be between -90 and 90.' });
  const longitude = readFiniteNumber(shape.data, 'longitude', { min: -180, max: 180, message: 'Longitude must be between -180 and 180.' });
  const gpsAccuracy = readFiniteNumber(shape.data, 'gpsAccuracy', { min: 0, max: 10_000, message: 'GPS accuracy must be a valid non-negative number.' });
  if (!branchId.success) return branchId;
  if (!latitude.success) return latitude;
  if (!longitude.success) return longitude;
  if (!gpsAccuracy.success) return gpsAccuracy;
  return { success: true as const, data: { branchId: branchId.data, latitude: latitude.data, longitude: longitude.data, gpsAccuracy: gpsAccuracy.data } };
}

function parseAttendanceDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseStudentAttendanceInput(body: unknown) {
  const shape = parseStrictKeys(body, ['classId', 'sessionId', 'date', 'students']);
  if (!shape.success) return shape;
  const classId = readTrimmedString(shape.data, 'classId', { required: true, maxLength: 128, message: 'A valid classId is required.' });
  const sessionId = readTrimmedString(shape.data, 'sessionId', { required: true, maxLength: 128, message: 'A valid sessionId is required.' });
  const date = readTrimmedString(shape.data, 'date', { required: true, maxLength: 40, message: 'A valid attendance date is required.' });
  const students = shape.data.students;
  if (!classId.success) return classId;
  if (!sessionId.success) return sessionId;
  if (!date.success || !parseAttendanceDate(date.data)) return { success: false as const, error: 'A valid attendance date is required.' };
  if (!Array.isArray(students) || students.length === 0 || students.length > 200) return { success: false as const, error: 'students must contain between 1 and 200 attendance records.' };
  const normalized = [] as Array<{ studentId: string; status: 'PRESENT' | 'ABSENT' | 'EXCUSED' }>;
  for (const entry of students) {
    const entryShape = parseStrictKeys(entry, ['studentId', 'status']);
    if (!entryShape.success) return entryShape;
    const studentId = readTrimmedString(entryShape.data, 'studentId', { required: true, maxLength: 128, message: 'A valid studentId is required.' });
    const status = readTrimmedString(entryShape.data, 'status', { required: true, maxLength: 20, pattern: /^(PRESENT|ABSENT|EXCUSED)$/, message: 'Attendance status must be PRESENT, ABSENT, or EXCUSED.' });
    if (!studentId.success) return studentId;
    if (!status.success) return status;
    normalized.push({ studentId: studentId.data, status: status.data as 'PRESENT' | 'ABSENT' | 'EXCUSED' });
  }
  return { success: true as const, data: { classId: classId.data, sessionId: sessionId.data, date: date.data, queryDate: parseAttendanceDate(date.data)!, students: normalized } };
}

function parseSessionUpdateInput(body: unknown) {
  const shape = parseStrictKeys(body, ['classId', 'date', 'updateContent']);
  if (!shape.success) return shape;
  const classId = readTrimmedString(shape.data, 'classId', { required: true, maxLength: 128, message: 'A valid classId is required.' });
  const date = readTrimmedString(shape.data, 'date', { required: true, maxLength: 40, message: 'A valid session date is required.' });
  const updateContent = readTrimmedString(shape.data, 'updateContent', { required: true, maxLength: 5_000, message: 'Daily update content is required and must be no longer than 5000 characters.' });
  if (!classId.success) return classId;
  if (!date.success || !parseAttendanceDate(date.data)) return { success: false as const, error: 'A valid session date is required.' };
  if (!updateContent.success) return updateContent;
  return { success: true as const, data: { classId: classId.data, date: date.data, updateContent: updateContent.data } };
}

// 1. Mark IN (Teacher only)
router.post(
  '/in',
  authMiddleware,
  hasPermission('mark_geo_attendance'),
  async (req: TenantRequest, res: Response) => {
    const input = parseGeoAttendanceInput(req.body);
    if (!input.success) return res.status(400).json({ error: input.error });
    const { branchId, latitude, longitude, gpsAccuracy } = input.data;
    const teacherId = req.user!.id;

    // Mandatory Daily Gate / Update Check
    try {
      const pendingSession = await prisma.teacherSession.findFirst({
        where: {
          teacherId,
          dailyUpdateSubmitted: false,
          date: { lt: nepalCalendarDate() },
          class: { course: { tenantId: req.tenantId! } },
        },
      });
      if (pendingSession) {
        return res.status(403).json({
          error: 'Daily class update pending for previous sessions. Attendance marking blocked.',
          pendingSessionId: pendingSession.id,
        });
      }
    } catch {
      return res.status(500).json({ error: 'Unable to verify pending class updates.' });
    }

    // 1. Validate GPS Accuracy threshold (must be precise to prevent coordinates spoofing)
    if (Number(gpsAccuracy) > MAX_GPS_ACCURACY_METERS) {
      return res.status(422).json({
        error: `GPS accuracy too low (${gpsAccuracy}m). Must be under ${MAX_GPS_ACCURACY_METERS} meters to verify geofence context.`,
      });
    }

    try {
      // 2. Fetch the target branch's geofencing boundaries
      const branch = await findAssignedTeacherBranch(branchId, teacherId, req.tenantId!);

      if (!branch) {
        return res.status(403).json({ error: 'You are not assigned to this branch.' });
      }

      // 3. Compute distance between teacher and center coordinates
      const distance = calculateDistanceInMeters(
        Number(latitude),
        Number(longitude),
        branch.latitude,
        branch.longitude
      );

      // 4. Validate geofence radius bounds
      if (distance > branch.radiusMeters) {
        return res.status(403).json({
          error: `Geofence violation. You are ${Math.round(distance - branch.radiusMeters)} meters outside the allowed branch radius of ${branch.radiusMeters}m.`,
          distanceComputed: distance,
          allowedRadius: branch.radiusMeters,
        });
      }

      // 5. Create Attendance Stamp
      const stamp = await prisma.teacherAttendance.create({
          data: {
            userId: teacherId,
            branchId,
            stampType: 'IN',
            latitude: Number(latitude),
            longitude: Number(longitude),
            gpsAccuracy: Number(gpsAccuracy),
          },
        });

      // Persistent inbox record for the teacher. Fail-open: a notification
      // store failure must never roll back the saved IN stamp.
      await recordNotification(prisma, {
        tenantId: req.tenantId!,
        userId: teacherId,
        branchId,
        category: 'ATTENDANCE',
        title: 'Attendance marked IN',
        body: `Marked IN at ${branch.name}.`,
        destination: 'attendance',
        entityId: stamp.id,
      });

      return res.status(200).json({
        message: 'Successfully marked IN. Session attendance validated server-side.',
        stamp,
        geofenceMeta: {
          distanceFromBranchCenterMeters: Math.round(distance),
          branchRadiusAllowedMeters: branch.radiusMeters,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Attendance registration failed.', details: error.message });
    }
  }
);

// 2. Mark OUT (Teacher only)
router.post(
  '/out',
  authMiddleware,
  hasPermission('mark_geo_attendance'),
  async (req: TenantRequest, res: Response) => {
    const input = parseGeoAttendanceInput(req.body);
    if (!input.success) return res.status(400).json({ error: input.error });
    const { branchId, latitude, longitude, gpsAccuracy } = input.data;
    const teacherId = req.user!.id;

    if (Number(gpsAccuracy) > MAX_GPS_ACCURACY_METERS) {
      return res.status(422).json({
        error: `GPS accuracy too low (${gpsAccuracy}m). Must be under ${MAX_GPS_ACCURACY_METERS} meters.`,
      });
    }

    try {
      const branch = await findAssignedTeacherBranch(branchId, teacherId, req.tenantId!);

      if (!branch) {
        return res.status(403).json({ error: 'You are not assigned to this branch.' });
      }

      const distance = calculateDistanceInMeters(
        Number(latitude),
        Number(longitude),
        branch.latitude,
        branch.longitude
      );

      if (distance > branch.radiusMeters) {
        return res.status(403).json({
          error: `Geofence violation. You cannot mark OUT from outside the branch radius.`,
          distanceComputed: distance,
        });
      }

      const stamp = await prisma.teacherAttendance.create({
          data: {
            userId: teacherId,
            branchId,
            stampType: 'OUT',
            latitude: Number(latitude),
            longitude: Number(longitude),
            gpsAccuracy: Number(gpsAccuracy),
          },
        });

      // Persistent inbox record for the teacher. Fail-open: a notification
      // store failure must never roll back the saved OUT stamp.
      await recordNotification(prisma, {
        tenantId: req.tenantId!,
        userId: teacherId,
        branchId,
        category: 'ATTENDANCE',
        title: 'Attendance marked OUT',
        body: `Marked OUT at ${branch.name}.`,
        destination: 'attendance',
        entityId: stamp.id,
      });

      return res.status(200).json({
        message: 'Successfully marked OUT. Core checkout logged.',
        stamp,
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Attendance registration failed.', details: error.message });
    }
  }
);

// 3. Mark Student Attendance Sheet (Teacher only)
router.post(
  '/student',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const input = parseStudentAttendanceInput(req.body);
    if (!input.success) return res.status(400).json({ error: input.error });
    const { classId, date, students, sessionId, queryDate } = input.data;
    const teacherId = req.user!.id;

    try {
      const klass = await prisma.class.findFirst({
        where: { id: classId, teacherId, course: { tenantId: req.tenantId! } },
      });
      if (!klass) return res.status(403).json({ error: 'You are not assigned to this class.' });
      const session = await prisma.teacherSession.findFirst({ where: { id: sessionId, classId, teacherId } });
      if (!session) return res.status(404).json({ error: 'Teacher session not found.' });
      const records = [];
      for (const entry of students) {
        const { studentId, status } = entry;

        // 1. Dues Block Check
        const enrollment = await prisma.enrollment.findFirst({
          where: { studentId, classId, student: { user: { tenantId: req.tenantId! } } },
          include: { student: { select: { userId: true } } },
        });
        if (!enrollment) return res.status(404).json({ error: `Student ${studentId} is not enrolled in this class.` });

        if (enrollment && enrollment.status === 'BLOCKED' && status === 'PRESENT') {
          return res.status(403).json({
            error: `Student ${studentId} is blocked due to unpaid fee dues. Present marking denied.`,
          });
        }

        // 2. Approved Leave Check
        const approvedLeave = await prisma.leave.findFirst({
            where: {
              userId: enrollment.student.userId,
              tenantId: req.tenantId!,
              status: 'APPROVED_LEVEL2',
              startDate: { lte: queryDate },
              endDate: { gte: queryDate },
            },
          });

        let finalStatus = status;
        if (approvedLeave) {
          finalStatus = 'EXCUSED';
        }

        const record = await prisma.studentAttendance.create({
            data: {
              studentId,
              classId,
              sessionId,
              date: queryDate,
              status: finalStatus,
              markedBy: teacherId,
            },
          });
        records.push(record);
      }

      return res.status(201).json({
        message: 'Student attendance sheet processed successfully.',
        records,
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to process student attendance.', details: error.message });
    }
  }
);

// 4. Submit Daily Class Update / Confirm Session (Teacher only)
router.post(
  '/session/update',
  authMiddleware,
  async (req: TenantRequest, res: Response) => {
    const input = parseSessionUpdateInput(req.body);
    if (!input.success) return res.status(400).json({ error: input.error });
    const { classId, date, updateContent } = input.data;
    const teacherId = req.user!.id;

    try {
      const assignedSession = await prisma.teacherSession.findFirst({
        where: {
          teacherId,
          classId,
          date: new Date(date),
          class: { course: { tenantId: req.tenantId! } },
        },
      });
      if (!assignedSession) {
        return res.status(404).json({ error: 'Assigned teacher session not found.' });
      }
      const result = await prisma.teacherSession.updateMany({
          where: {
            id: assignedSession.id,
            teacherId,
            dailyUpdateSubmitted: false,
          },
          data: {
            status: 'PRESENT_CONFIRMED',
            dailyUpdateSubmitted: true,
            updateContent,
          },
        });
      if (result.count === 0) {
        return res.status(409).json({ error: 'The daily update was already submitted by another request.' });
      }

      return res.status(200).json({
        message: 'Daily class update submitted successfully. Session confirmed.',
        session: {
          classId,
          date,
          status: 'PRESENT_CONFIRMED',
          dailyUpdateSubmitted: true,
          updateContent,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to submit daily class update.', details: error.message });
    }
  }
);

export default router;
