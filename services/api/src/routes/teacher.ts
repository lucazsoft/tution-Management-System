import { Router, Response } from 'express';
import prisma from '../utils/db';
import { normalizeSchedule } from '../utils/schedule';
import { generateDailyTeacherSessions } from '../services/timetable-service';
import { TenantRequest } from '../middleware/tenant';
import { authMiddleware } from '../middleware/auth';
import { UserPayload } from '@tms/types';

const router = Router();
const ACTIVE_ENROLLMENTS = ['ACTIVE', 'BLOCKED'];

function dayBounds(date = new Date()) {
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end = new Date(date); end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function ownedClass(classId: string, teacherId: string, tenantId: string) {
  return prisma.class.findFirst({
    where: { id: classId, teacherId, archivedAt: null, course: { tenantId } },
    include: {
      course: { include: { grade: true } },
      branch: true,
      enrollments: {
        where: { status: { in: ACTIVE_ENROLLMENTS } },
        include: { student: { include: { user: true } } },
        orderBy: { student: { user: { firstName: 'asc' } } },
      },
    },
  });
}

async function gradeBasedRoster(klass: { branchId: string; course: { gradeId: string | null; grade: { billingMode: string } | null } }, tenantId: string) {
  if (!klass.course.gradeId || klass.course.grade?.billingMode !== 'GRADE') return [];
  return prisma.student.findMany({
    where: {
      gradeId: klass.course.gradeId,
      user: { tenantId, status: 'ACTIVE', userRoles: { some: { branchId: klass.branchId } } },
    },
    include: { user: true },
    orderBy: { user: { firstName: 'asc' } },
  });
}

router.get('/workspace', authMiddleware, async (req: TenantRequest, res: Response) => {
  const user = req.user as UserPayload;
  const { start, end } = dayBounds();
  try {
    await generateDailyTeacherSessions({ tenantId: req.tenantId! });
    const assignedClassIds = await prisma.class.findMany({
      where: { teacherId: user.id, archivedAt: null, course: { tenantId: req.tenantId! } },
      select: { id: true },
    }).then((rows) => rows.map((row) => row.id));
    const [classes, stamps, sessions, staff, leaves, scores, resultDefinitions] = await Promise.all([
      prisma.class.findMany({
        where: { teacherId: user.id, archivedAt: null, course: { tenantId: req.tenantId! } },
        include: {
          course: { include: { grade: true } }, branch: true,
          enrollments: { where: { status: { in: ACTIVE_ENROLLMENTS } }, include: { student: { include: { user: true } } } },
          sessions: { orderBy: { date: 'desc' }, take: 30, include: { studentAttendance: true } },
          syllabi: { include: { chapters: { orderBy: { position: 'asc' }, include: { topics: { orderBy: { position: 'asc' }, include: { logs: { orderBy: { logDate: 'desc' }, take: 20 } } } } }, dailyLogs: { orderBy: { logDate: 'desc' }, take: 20 } } },
          homework: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.teacherAttendance.findMany({ where: { userId: user.id }, include: { branch: true }, orderBy: { timestamp: 'desc' }, take: 60 }),
      prisma.teacherSession.findMany({ where: { teacherId: user.id, date: { gte: start, lte: end } }, include: { class: { include: { course: true, branch: true } } }, orderBy: { createdAt: 'asc' } }),
      prisma.staffRecord.findFirst({ where: { userId: user.id }, include: { performanceScore: true, payrolls: { orderBy: [{ year: 'desc' }, { month: 'desc' }] } } }),
      prisma.leave.findMany({ where: { tenantId: req.tenantId!, userId: user.id }, include: { branch: true }, orderBy: { createdAt: 'desc' } }),
      prisma.studentScore.findMany({
        where: {
          tenantId: req.tenantId!,
          OR: [
            { recordedBy: user.id },
            { resultDefinition: { classId: { in: assignedClassIds } } },
          ],
        },
        include: { student: { include: { user: true } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.resultDefinition.findMany({
        where: { tenantId: req.tenantId!, isOpen: true, classId: { in: assignedClassIds } },
        orderBy: { testDate: 'desc' },
      }),
    ]);
    const lastStamp = stamps[0] ?? null;
    const gradeRosters = new Map(await Promise.all(classes.map(async (klass) => [klass.id, await gradeBasedRoster(klass, req.tenantId!)] as const)));
    const checkedIn = Boolean(lastStamp && ['IN', 'RE_IN'].includes(lastStamp.stampType));
    const completedSessions = classes.flatMap((item) => item.sessions).filter((item) => ['PRESENT_CONFIRMED', 'PRESENT_UPDATE_PENDING'].includes(item.status));
    const confirmedSessions = completedSessions.filter((item) => item.dailyUpdateSubmitted);
    const presentStamps = stamps.filter((stamp) => ['IN', 'RE_IN'].includes(stamp.stampType));
    const absentLeaves = leaves.filter((leave) => ['APPROVED_LEVEL1', 'APPROVED_LEVEL2'].includes(leave.status));
    const attendanceRate = presentStamps.length + absentLeaves.length
      ? Math.round((presentStamps.length / (presentStamps.length + absentLeaves.length)) * 100)
      : 0;
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const presentDays = new Set(presentStamps.filter((stamp) => stamp.timestamp >= monthStart).map((stamp) => stamp.timestamp.toISOString().slice(0, 10))).size;
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const requiredDays = Array.from({ length: daysInMonth }, (_, offset) => {
      const day = new Date(monthStart); day.setDate(offset + 1); return day;
    }).filter((day) => day.getDay() !== 6).length;
    return res.json({
      generatedAt: new Date().toISOString(),
      teacher: {
        id: user.id, name: `${user.firstName} ${user.lastName}`, email: user.email,
        phone: staff?.userId ? undefined : '', designation: staff?.designation ?? 'Teacher',
        joiningDate: staff?.joiningDate ?? null, contractType: staff?.contractType ?? null,
        branches: [...new Map(classes.map((item) => [item.branch.id, { id: item.branch.id, name: item.branch.name }])).values()],
      },
      statistics: {
        attendanceRate, presentDays, requiredDays, approvedLeaveDays: absentLeaves.length,
        totalSessions: completedSessions.length,
        updateCompliance: completedSessions.length ? Math.round((confirmedSessions.length / completedSessions.length) * 100) : 0,
        assignedClasses: classes.length,
      },
      attendance: { checkedIn, lastStampType: lastStamp?.stampType ?? null, lastStampAt: lastStamp?.timestamp ?? null },
      stamps: stamps.map((stamp) => ({ ...stamp, branchName: stamp.branch.name })),
      todayClasses: sessions.map((session) => ({
        sessionId: session.id, classId: session.classId, className: session.class.name, courseName: session.class.course.name,
        branch: session.class.branch, schedule: normalizeSchedule(session.class.schedule), status: session.status,
        dailyUpdateSubmitted: session.dailyUpdateSubmitted, checkInTime: session.checkInTime, checkOutTime: session.checkOutTime,
      })),
      pendingUpdates: classes.flatMap((item) => item.sessions.filter((session) => !session.dailyUpdateSubmitted).map((session) => ({
        sessionId: session.id, classId: item.id, className: item.name, courseName: item.course.name, date: session.date,
      }))),
      classes: classes.map((item) => ({
        id: item.id, name: item.name, subject: item.course.name, type: item.course.type, schedule: normalizeSchedule(item.schedule),
        branch: { id: item.branch.id, name: item.branch.name, address: item.branch.address, radiusMeters: item.branch.radiusMeters },
        students: (() => {
          const explicit = item.enrollments.map((enrollment) => ({ id: enrollment.student.id, name: `${enrollment.student.user.firstName} ${enrollment.student.user.lastName}`, status: enrollment.status }));
          const known = new Set(explicit.map((student) => student.id));
          const inherited = (gradeRosters.get(item.id) ?? []).filter((student) => !known.has(student.id)).map((student) => ({ id: student.id, name: `${student.user.firstName} ${student.user.lastName}`, status: 'ACTIVE' }));
          return [...explicit, ...inherited].sort((a, b) => a.name.localeCompare(b.name));
        })(),
        attendance: item.sessions.flatMap((session) => session.studentAttendance),
        syllabi: item.syllabi, homework: item.homework,
      })),
      results: scores.map((score) => ({ ...score, score: Number(score.score), maximum: Number(score.maximum), passMarks: score.passMarks == null ? null : Number(score.passMarks), percentile: score.percentile == null ? null : Number(score.percentile), studentName: `${score.student.user.firstName} ${score.student.user.lastName}` })),
      resultDefinitions,
      profile: { performance: staff?.performanceScore ?? null, salaryStructure: staff?.salaryStructure ?? null },
      leaves,
      payrolls: staff?.payrolls ?? [],
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to load teacher workspace.', details: error.message });
  }
});

router.get('/dashboard', authMiddleware, async (req: TenantRequest, res: Response) => {
  return res.redirect(307, '/api/teacher/workspace');
});

router.post('/class/:classId/attendance', authMiddleware, async (req: TenantRequest, res: Response) => {
  const { classId } = req.params;
  const date = req.body?.date ? new Date(req.body.date) : new Date();
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  if (!records.length || Number.isNaN(date.getTime())) return res.status(400).json({ error: 'Date and at least one attendance record are required.' });
  const { start, end } = dayBounds(date);
  try {
    const today = dayBounds();
    if (start.getTime() !== today.start.getTime()) return res.status(422).json({ error: 'Class attendance can only be taken for the present day.' });
    const teacherPresent = await prisma.teacherAttendance.findFirst({
      where: { userId: req.user!.id, timestamp: { gte: today.start, lte: today.end }, stampType: { in: ['IN', 'RE_IN'] } },
    });
    if (!teacherPresent) return res.status(403).json({ error: 'You must be marked present today before taking class attendance.' });
    const klass = await ownedClass(classId, req.user!.id, req.tenantId!);
    if (!klass) return res.status(404).json({ error: 'Assigned class not found.' });
    const enrollmentMap = new Map(klass.enrollments.map((item) => [item.studentId, item]));
    if (records.some((item: any) => !enrollmentMap.has(item.studentId) || !['PRESENT', 'ABSENT'].includes(item.status))) {
      return res.status(422).json({ error: 'Every attendance record must belong to this class and use Present or Absent.' });
    }
    const studentUserIds = klass.enrollments.map((item) => item.student.userId);
    const approvedLeaves = await prisma.leave.findMany({ where: { userId: { in: studentUserIds }, startDate: { lte: end }, endDate: { gte: start }, status: { in: ['APPROVED_LEVEL1', 'APPROVED_LEVEL2'] } } });
    const excusedUsers = new Set(approvedLeaves.map((item) => item.userId));
    const normalized: Array<{ studentId: string; status: 'PRESENT' | 'ABSENT' | 'EXCUSED' }> = records.map((item: any) => {
      const enrollment = enrollmentMap.get(item.studentId)!;
      if (excusedUsers.has(enrollment.student.userId)) return { studentId: item.studentId, status: 'EXCUSED' as const };
      if (enrollment.status === 'BLOCKED' && item.status === 'PRESENT') throw new Error(`${enrollment.student.user.firstName} is fee-blocked and cannot be marked present.`);
      return { studentId: item.studentId, status: item.status as 'PRESENT' | 'ABSENT' };
    });
    let session = await prisma.teacherSession.findFirst({ where: { teacherId: req.user!.id, classId, date: { gte: start, lte: end } } });
    session ??= await prisma.teacherSession.create({ data: { teacherId: req.user!.id, classId, date: start } });
    await prisma.$transaction([
      prisma.studentAttendance.deleteMany({ where: { sessionId: session.id, markedBy: req.user!.id } }),
      prisma.studentAttendance.createMany({ data: normalized.map((item) => ({ ...item, classId, sessionId: session!.id, date: start, markedBy: req.user!.id })) }),
    ]);
    return res.json({ message: 'Class attendance saved.', sessionId: session.id, records: normalized });
  } catch (error: any) {
    return res.status(error.message?.includes('fee-blocked') ? 422 : 500).json({ error: error.message || 'Failed to save attendance.' });
  }
});

router.post('/syllabus', authMiddleware, async (req: TenantRequest, res: Response) => {
  const { classId, subject } = req.body;
  const chapters = Array.isArray(req.body?.chapters) ? req.body.chapters.map((item: any) => typeof item === 'string' ? { title: item.trim(), topics: [] } : { title: String(item?.title || '').trim(), topics: Array.isArray(item?.topics) ? item.topics.map((topic: unknown) => String(topic).trim()).filter(Boolean) : [] }).filter((item: { title: string }) => item.title) : [];
  if (!classId || !String(subject).trim() || !chapters.length) return res.status(400).json({ error: 'Class, subject, and at least one chapter are required.' });
  try {
    const klass = await ownedClass(classId, req.user!.id, req.tenantId!);
    if (!klass) return res.status(404).json({ error: 'Assigned class not found.' });
    const syllabus = await prisma.syllabus.create({ data: { classId, subject: String(subject).trim(), createdBy: req.user!.id, chapters: { create: chapters.map((chapter: { title: string; topics: string[] }, position: number) => ({ title: chapter.title, position: position + 1, topics: { create: chapter.topics.map((title, topicPosition) => ({ title, position: topicPosition + 1 })) } })) } }, include: { chapters: { include: { topics: true } } } });
    return res.status(201).json({ message: 'Syllabus shared with enrolled students.', syllabus });
  } catch (error: any) {
    return res.status(error.code === 'P2002' ? 409 : 500).json({ error: error.code === 'P2002' ? 'A syllabus already exists for this class and subject.' : 'Failed to create syllabus.' });
  }
});

router.patch('/syllabus/:syllabusId', authMiddleware, async (req: TenantRequest, res: Response) => {
  const subject = String(req.body?.subject || '').trim();
  const chapters = Array.isArray(req.body?.chapters)
    ? req.body.chapters.map((item: any) => ({ id: item?.id ? String(item.id) : undefined, title: String(item?.title || '').trim() })).filter((item: { title: string }) => item.title)
    : [];
  if (!subject || !chapters.length) return res.status(400).json({ error: 'Subject and at least one chapter are required.' });
  try {
    const syllabus = await prisma.syllabus.findFirst({
      where: { id: req.params.syllabusId, createdBy: req.user!.id, class: { teacherId: req.user!.id, course: { tenantId: req.tenantId! } } },
      include: { chapters: { include: { _count: { select: { dailyLogs: true } } } } },
    });
    if (!syllabus) return res.status(404).json({ error: 'Owned syllabus not found.' });
    const existingIds = new Set(syllabus.chapters.map((chapter) => chapter.id));
    if (chapters.some((chapter: { id?: string }) => chapter.id && !existingIds.has(chapter.id))) return res.status(422).json({ error: 'One or more chapters do not belong to this syllabus.' });
    const retainedIds = new Set<string>(chapters.flatMap((chapter: { id?: string }) => chapter.id ? [chapter.id] : []));
    const loggedRemoval = syllabus.chapters.find((chapter) => !retainedIds.has(chapter.id) && chapter._count.dailyLogs > 0);
    if (loggedRemoval) return res.status(409).json({ error: `“${loggedRemoval.title}” has daily logs and cannot be removed. Rename it or keep it in the syllabus.` });
    const updated = await prisma.$transaction(async (tx) => {
      await tx.syllabus.update({ where: { id: syllabus.id }, data: { subject } });
      await tx.syllabusChapter.deleteMany({ where: { syllabusId: syllabus.id, id: { notIn: [...retainedIds] } } });
      for (let position = 0; position < chapters.length; position += 1) {
        const chapter = chapters[position];
        if (chapter.id) await tx.syllabusChapter.update({ where: { id: chapter.id }, data: { title: chapter.title, position: -(position + 1) } });
      }
      for (let position = 0; position < chapters.length; position += 1) {
        const chapter = chapters[position];
        if (chapter.id) await tx.syllabusChapter.update({ where: { id: chapter.id }, data: { position: position + 1 } });
        else await tx.syllabusChapter.create({ data: { syllabusId: syllabus.id, title: chapter.title, position: position + 1 } });
      }
      return tx.syllabus.findUnique({ where: { id: syllabus.id }, include: { chapters: { orderBy: { position: 'asc' } }, dailyLogs: { orderBy: { logDate: 'desc' }, take: 20 } } });
    });
    return res.json({ message: 'Syllabus updated and shared with enrolled students.', syllabus: updated });
  } catch (error: any) {
    return res.status(error.code === 'P2002' ? 409 : 500).json({ error: error.code === 'P2002' ? 'A syllabus already exists for this class and subject.' : 'Failed to update syllabus.', details: error.message });
  }
});

router.post('/syllabus/:syllabusId/log', authMiddleware, async (req: TenantRequest, res: Response) => {
  const { chapterId, status, notes, logDate } = req.body;
  if (!chapterId || !['IN_PROGRESS', 'COMPLETED', 'LEFT'].includes(status)) return res.status(400).json({ error: 'Chapter and a valid progress status are required.' });
  try {
    const syllabus = await prisma.syllabus.findFirst({ where: { id: req.params.syllabusId, createdBy: req.user!.id, class: { teacherId: req.user!.id, course: { tenantId: req.tenantId! } }, chapters: { some: { id: chapterId } } } });
    if (!syllabus) return res.status(404).json({ error: 'Owned syllabus chapter not found.' });
    const date = logDate ? new Date(logDate) : new Date(); date.setHours(0, 0, 0, 0);
    const [log] = await prisma.$transaction([
      prisma.dailyLessonLog.upsert({ where: { chapterId_logDate: { chapterId, logDate: date } }, create: { syllabusId: syllabus.id, chapterId, teacherId: req.user!.id, classId: syllabus.classId, logDate: date, status, notes: notes?.trim() || null }, update: { status, notes: notes?.trim() || null } }),
      prisma.syllabusChapter.update({ where: { id: chapterId }, data: { status } }),
    ]);
    return res.json({ message: 'Daily syllabus progress shared with students.', log });
  } catch (error: any) { return res.status(500).json({ error: 'Failed to update syllabus progress.', details: error.message }); }
});

router.post('/syllabus/:syllabusId/topic-log', authMiddleware, async (req: TenantRequest, res: Response) => {
  const { topicId, status, notes, logDate } = req.body;
  if (!topicId || !['IN_PROGRESS', 'COMPLETED', 'LEFT'].includes(status)) return res.status(400).json({ error: 'Topic and a valid progress status are required.' });
  try {
    const syllabus = await prisma.syllabus.findFirst({ where: { id: req.params.syllabusId, createdBy: req.user!.id, class: { teacherId: req.user!.id, course: { tenantId: req.tenantId! } }, chapters: { some: { topics: { some: { id: topicId } } } } } });
    if (!syllabus) return res.status(404).json({ error: 'Owned syllabus topic not found.' });
    const topic = await prisma.syllabusTopic.findUniqueOrThrow({ where: { id: topicId }, select: { chapterId: true } });
    const date = logDate ? new Date(logDate) : new Date();
    if (Number.isNaN(date.getTime())) return res.status(400).json({ error: 'A valid progress date is required.' });
    date.setHours(0, 0, 0, 0);
    const saved = await prisma.$transaction(async (tx) => {
      const saved = await tx.topicProgressLog.upsert({ where: { topicId_logDate: { topicId, logDate: date } }, create: { topicId, teacherId: req.user!.id, classId: syllabus.classId, logDate: date, status, notes: String(notes || '').trim() || null }, update: { status, notes: String(notes || '').trim() || null } });
      const updatedTopic = await tx.syllabusTopic.update({ where: { id: topicId }, data: { status } });
      const topics = await tx.syllabusTopic.findMany({ where: { chapterId: topic.chapterId }, select: { status: true } });
      const chapterStatus = topics.every((item) => item.status === 'COMPLETED') ? 'COMPLETED' : topics.some((item) => item.status === 'IN_PROGRESS' || item.status === 'COMPLETED') ? 'IN_PROGRESS' : 'LEFT';
      const updatedChapter = await tx.syllabusChapter.update({ where: { id: topic.chapterId }, data: { status: chapterStatus } });
      return { log: saved, topic: updatedTopic, chapter: updatedChapter };
    });
    return res.json({ message: 'Topic progress saved and shared with students and Branch Admin.', ...saved });
  } catch (error: any) { return res.status(500).json({ error: 'Failed to update topic progress.', details: error.message }); }
});

router.post('/syllabus/:syllabusId/topics', authMiddleware, async (req: TenantRequest, res: Response) => {
  const chapterId = String(req.body?.chapterId || ''); const title = String(req.body?.title || '').trim();
  if (!chapterId || !title) return res.status(400).json({ error: 'Chapter and topic title are required.' });
  const syllabus = await prisma.syllabus.findFirst({ where: { id: req.params.syllabusId, createdBy: req.user!.id, class: { teacherId: req.user!.id, course: { tenantId: req.tenantId! } }, chapters: { some: { id: chapterId } } } });
  if (!syllabus) return res.status(404).json({ error: 'Owned syllabus chapter not found.' });
  const last = await prisma.syllabusTopic.findFirst({ where: { chapterId }, orderBy: { position: 'desc' }, select: { position: true } });
  const topic = await prisma.syllabusTopic.create({ data: { chapterId, title, position: (last?.position ?? 0) + 1 } });
  return res.status(201).json({ message: 'Topic added.', topic });
});

router.patch('/syllabus/:syllabusId/topics/:topicId', authMiddleware, async (req: TenantRequest, res: Response) => {
  const title = String(req.body?.title || '').trim(); if (!title) return res.status(400).json({ error: 'Topic title is required.' });
  const topic = await prisma.syllabusTopic.findFirst({ where: { id: req.params.topicId, chapter: { syllabus: { id: req.params.syllabusId, createdBy: req.user!.id, class: { teacherId: req.user!.id, course: { tenantId: req.tenantId! } } } } } });
  if (!topic) return res.status(404).json({ error: 'Owned syllabus topic not found.' });
  return res.json({ message: 'Topic updated.', topic: await prisma.syllabusTopic.update({ where: { id: topic.id }, data: { title } }) });
});

router.delete('/syllabus/:syllabusId/topics/:topicId', authMiddleware, async (req: TenantRequest, res: Response) => {
  const topic = await prisma.syllabusTopic.findFirst({ where: { id: req.params.topicId, chapter: { syllabus: { id: req.params.syllabusId, createdBy: req.user!.id, class: { teacherId: req.user!.id, course: { tenantId: req.tenantId! } } } } }, include: { _count: { select: { logs: true } } } });
  if (!topic) return res.status(404).json({ error: 'Owned syllabus topic not found.' });
  if (topic._count.logs) return res.status(409).json({ error: 'A topic with progress history cannot be deleted. Rename it instead.' });
  await prisma.syllabusTopic.delete({ where: { id: topic.id } }); return res.status(204).send();
});

router.post('/results', authMiddleware, async (req: TenantRequest, res: Response) => {
  const { classId, resultDefinitionId, subject, assessment, maximum, passMarks, testDate } = req.body;
  const marks = Array.isArray(req.body?.marks) ? req.body.marks : [];
  const max = Number(maximum); const pass = Number(passMarks);
  if (!classId || !resultDefinitionId || !subject?.trim() || !assessment?.trim() || !marks.length || !(max > 0) || pass < 0 || pass > max) return res.status(400).json({ error: 'An available result, class, valid mark limits, and student marks are required.' });
  try {
    const klass = await ownedClass(classId, req.user!.id, req.tenantId!);
    if (!klass) return res.status(404).json({ error: 'Assigned class not found.' });
    const definition = await prisma.resultDefinition.findFirst({ where: { id: resultDefinitionId, tenantId: req.tenantId!, classId, isOpen: true } });
    if (!definition) return res.status(404).json({ error: 'This Branch Admin-created result is unavailable for the selected class.' });
    if (definition.title !== assessment.trim() || definition.subject !== subject.trim()) return res.status(422).json({ error: 'Result title and subject must match the selected result.' });
    const inheritedRoster = await gradeBasedRoster(klass, req.tenantId!);
    const allowed = new Set([...klass.enrollments.map((item) => item.studentId), ...inheritedRoster.map((item) => item.id)]);
    const numeric = marks.map((item: any) => ({ studentId: String(item.studentId), score: Number(item.score), resultSheetUrl: typeof item.resultSheetUrl === 'string' ? item.resultSheetUrl : '' }));
    if (numeric.some((item: any) => !item.resultSheetUrl)) return res.status(422).json({ error: 'Upload an individual result sheet for every student before saving.' });
    if (numeric.some((item: any) => !allowed.has(item.studentId) || item.score < 0 || item.score > max || !Number.isFinite(item.score))) return res.status(422).json({ error: 'Each mark must belong to an enrolled student and be within the full marks.' });
    const sorted = numeric.map((item: any) => item.score).sort((a: number, b: number) => a - b);
    const saved = await prisma.$transaction(numeric.map((item: any) => {
      const scoreData = { recordedBy: req.user!.id, subject: subject.trim(), assessment: assessment.trim(), score: item.score, maximum: max, passMarks: pass, percentile: Math.round((sorted.filter((value: number) => value <= item.score).length / sorted.length) * 10000) / 100, resultSheetUrl: item.resultSheetUrl, testDate: testDate ? new Date(testDate) : definition.testDate, publishedAt: null };
      return prisma.studentScore.upsert({ where: { resultDefinitionId_studentId: { resultDefinitionId: definition.id, studentId: item.studentId } }, create: { tenantId: req.tenantId!, studentId: item.studentId, resultDefinitionId: definition.id, ...scoreData }, update: scoreData });
    }));
    return res.status(201).json({ message: 'Result drafts saved or updated. Share them when ready.', resultIds: saved.map((item) => item.id) });
  } catch (error: any) { return res.status(500).json({ error: 'Failed to save result draft.', details: error.message }); }
});

router.post('/results/share', authMiddleware, async (req: TenantRequest, res: Response) => {
  const ids = Array.isArray(req.body?.resultIds) ? req.body.resultIds.map(String) : [];
  if (!ids.length) return res.status(400).json({ error: 'Select at least one result to share.' });
  const update = await prisma.studentScore.updateMany({ where: { id: { in: ids }, tenantId: req.tenantId!, recordedBy: req.user!.id, publishedAt: null }, data: { publishedAt: new Date() } });
  if (!update.count) return res.status(409).json({ error: 'These results were already shared or are not yours.' });
  return res.json({ message: `${update.count} student result${update.count === 1 ? '' : 's'} shared.`, sharedCount: update.count });
});

router.delete('/results/:resultId', authMiddleware, async (req: TenantRequest, res: Response) => {
  const score = await prisma.studentScore.findFirst({ where: { id: req.params.resultId, tenantId: req.tenantId!, recordedBy: req.user!.id, publishedAt: null, resultDefinition: { class: { teacherId: req.user!.id } } } });
  if (!score) return res.status(404).json({ error: 'An unpublished result draft owned by you was not found.' });
  await prisma.studentScore.delete({ where: { id: score.id } });
  return res.status(204).send();
});

router.post('/session/:sessionId/update', authMiddleware, async (req: TenantRequest, res: Response) => {
  const updateContent = typeof req.body?.updateContent === 'string' ? req.body.updateContent.trim() : '';
  if (!updateContent) return res.status(400).json({ error: 'A lesson summary is required.' });
  try {
    const transition = await prisma.teacherSession.updateMany({ where: { id: req.params.sessionId, teacherId: req.user!.id, dailyUpdateSubmitted: false, class: { course: { tenantId: req.tenantId! } } }, data: { updateContent, dailyUpdateSubmitted: true, status: 'PRESENT_CONFIRMED' } });
    if (!transition.count) return res.status(409).json({ error: 'Session not found or its update was already submitted.' });
    return res.json({ message: 'Daily update submitted.', session: { sessionId: req.params.sessionId, dailyUpdateSubmitted: true, status: 'PRESENT_CONFIRMED' } });
  } catch (error: any) { return res.status(500).json({ error: 'Failed to submit daily update.', details: error.message }); }
});

export default router;
