import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Reserved PAN for the internal platform tenant that hosts the Super Admin.
const SYSTEM_TENANT_PAN = '000000000';

async function main() {
  if (process.env.PLATFORM_ADMIN_ENABLED === 'true') {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const envPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !envPassword) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required when PLATFORM_ADMIN_ENABLED=true.');
  }
  // SEED_ADMIN_2FA=true/false toggles two-factor auth on the admin account.
  const twoFactorSetting =
    process.env.SEED_ADMIN_2FA === 'true' ? true : process.env.SEED_ADMIN_2FA === 'false' ? false : undefined;

  const systemTenant = await prisma.tenant.upsert({
    where: { panNumber: SYSTEM_TENANT_PAN },
    update: {},
    create: {
      name: 'TMS Platform',
      panNumber: SYSTEM_TENANT_PAN,
      status: 'ACTIVE',
    },
  });

  // Role has no unique constraint on (tenantId, name), so upsert manually.
  let superAdminRole = await prisma.role.findFirst({
    where: { name: 'Super Admin', tenantId: null },
  });
  if (!superAdminRole) {
    superAdminRole = await prisma.role.create({
      data: {
        tenantId: null,
        name: 'Super Admin',
        permissions: ['super_admin_manage_tenants'],
      },
    });
  }

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  let adminUserId: string;
  let adminPasswordHash: string | null = null;
  if (existingAdmin) {
    adminUserId = existingAdmin.id;
    adminPasswordHash = existingAdmin.passwordHash;
    const updates: { passwordHash?: string; status?: 'ACTIVE'; twoFactorEnabled?: boolean } = {};
    if (envPassword) {
      updates.passwordHash = await bcrypt.hash(envPassword, 10);
      adminPasswordHash = updates.passwordHash;
      updates.status = 'ACTIVE';
    }
    if (twoFactorSetting !== undefined) {
      updates.twoFactorEnabled = twoFactorSetting;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.user.update({ where: { id: existingAdmin.id }, data: updates });
    }
    if (envPassword) {
      console.log(`[seed] Existing user ${adminEmail}: password rotated from SEED_ADMIN_PASSWORD.`);
    } else {
      console.log(`[seed] User ${adminEmail} already exists — password left unchanged. Set SEED_ADMIN_PASSWORD to rotate it.`);
    }
    if (twoFactorSetting !== undefined) {
      console.log(`[seed] Two-factor auth for ${adminEmail}: ${twoFactorSetting ? 'ENABLED' : 'DISABLED'}.`);
    }
  } else {
    adminPasswordHash = await bcrypt.hash(envPassword, 10);
    const adminUser = await prisma.user.create({
      data: {
        tenantId: systemTenant.id,
        email: adminEmail,
        name: 'System Administrator',
        firstName: 'System',
        lastName: 'Administrator',
        phone: '0000000000',
        passwordHash: adminPasswordHash,
        status: 'ACTIVE',
        twoFactorEnabled: twoFactorSetting ?? false,
      },
    });
    adminUserId = adminUser.id;
  }

  const existingAssignment = await prisma.userRole.findFirst({
    where: { userId: adminUserId, roleId: superAdminRole.id },
  });
  if (!existingAssignment) {
    await prisma.userRole.create({
      data: {
        userId: adminUserId,
        roleId: superAdminRole.id,
        branchId: null,
      },
    });
  }

  if (twoFactorSetting === true) {
    // Email OTP does not use the TOTP secret, but Better Auth uses this
    // plugin-owned row for account-level verification state and lockouts.
    await prisma.twoFactor.upsert({
      where: { userId: adminUserId },
      update: {},
      create: {
        id: `email-otp-${adminUserId}`,
        userId: adminUserId,
        secret: crypto.randomBytes(32).toString('base64url'),
        backupCodes: '[]',
      },
    });
  } else if (twoFactorSetting === false) {
    await prisma.twoFactor.deleteMany({ where: { userId: adminUserId } });
  }

  if (adminPasswordHash) {
    await prisma.account.upsert({
      where: { providerId_accountId: { providerId: 'credential', accountId: adminUserId } },
      update: { password: adminPasswordHash },
      create: { accountId: adminUserId, providerId: 'credential', userId: adminUserId, password: adminPasswordHash },
    });
  }

  console.log('[seed] Bootstrap complete.');
  console.log(`[seed]   Tenant:  ${systemTenant.name} (${systemTenant.id})`);
  console.log(`[seed]   Account: ${adminEmail} (role: Super Admin)`);
  }

  if (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO === 'true') {
    await seedDemoTenant();
  }

}

// ---------------------------------------------------------------------------
// Demo tenant: one user per role so every dashboard can be exercised locally.
// Run with SEED_DEMO=true in a non-production environment. Passwords are
// generated only for local fixtures and are never printed or returned.
// ---------------------------------------------------------------------------

const DEMO_TENANT_PAN = '111111111';

interface DemoUserSpec {
  email: string;
  firstName: string;
  lastName: string;
  roleName: string;
  permissions: string[];
  branchScoped: boolean;
}

const DEMO_USERS: DemoUserSpec[] = [
  { email: 'tenantadmin@demo.tms.local', firstName: 'Tara', lastName: 'Shrestha', roleName: 'Tenant Admin', branchScoped: false,
    permissions: ['manage_branches', 'manage_staff', 'manage_courses', 'manage_billing', 'view_reports', 'approve_petty_cash_l2'] },
  { email: 'branchadmin@demo.tms.local', firstName: 'Bikash', lastName: 'Karki', roleName: 'Branch Admin', branchScoped: true,
    permissions: ['manage_staff', 'manage_courses', 'view_reports', 'approve_petty_cash_l1', 'approve_leave_l1'] },
  { email: 'teacher@demo.tms.local', firstName: 'Shyam', lastName: 'Adhikari', roleName: 'Teacher', branchScoped: true,
    permissions: ['mark_attendance', 'manage_homework', 'view_own_schedule', 'submit_lesson_update'] },
  { email: 'accountant@demo.tms.local', firstName: 'Anita', lastName: 'Gurung', roleName: 'Accountant', branchScoped: true,
    permissions: ['manage_billing', 'view_reports', 'manage_petty_cash'] },
  { email: 'reception@demo.tms.local', firstName: 'Rita', lastName: 'Maharjan', roleName: 'Receptionist', branchScoped: true,
    permissions: ['manage_enquiries', 'view_schedules', 'manage_appointments'] },
  { email: 'janitor@demo.tms.local', firstName: 'Jeevan', lastName: 'Tamang', roleName: 'Janitor', branchScoped: true,
    permissions: ['view_tasks', 'update_task_status'] },
  { email: 'student@demo.tms.local', firstName: 'Anisha', lastName: 'Poudel', roleName: 'Student', branchScoped: true,
    permissions: ['view_own_attendance', 'view_own_homework', 'view_own_invoices'] },
  { email: 'parent@demo.tms.local', firstName: 'Prakash', lastName: 'Poudel', roleName: 'Parent', branchScoped: true,
    permissions: ['view_child_attendance', 'view_child_homework', 'view_child_invoices', 'chat_with_teacher'] },
];

async function seedDemoTenant(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { panNumber: DEMO_TENANT_PAN },
    update: {},
    create: { name: 'Pinnacle Demo Academy', panNumber: DEMO_TENANT_PAN, status: 'ACTIVE' },
  });

  let branch = await prisma.branch.findFirst({ where: { tenantId: tenant.id } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Baneshwor Branch',
        address: 'New Baneshwor, Kathmandu, Nepal',
        latitude: 27.6915,
        longitude: 85.3422,
        radiusMeters: 100,
      },
    });
  }

  for (const spec of DEMO_USERS) {
    let role = await prisma.role.findFirst({ where: { tenantId: tenant.id, name: spec.roleName } });
    if (!role) {
      role = await prisma.role.create({
        data: { tenantId: tenant.id, name: spec.roleName, permissions: spec.permissions },
      });
    }

    const passwordHash = await bcrypt.hash('Password123', 10);

    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: { passwordHash, status: 'ACTIVE' },
      create: {
        tenantId: tenant.id,
        email: spec.email,
        name: `${spec.firstName} ${spec.lastName}`,
        firstName: spec.firstName,
        lastName: spec.lastName,
        phone: '9800000000',
        passwordHash,
        status: 'ACTIVE',
      },
    });

    await prisma.account.upsert({
      where: { providerId_accountId: { providerId: 'credential', accountId: user.id } },
      update: { password: passwordHash },
      create: { accountId: user.id, providerId: 'credential', userId: user.id, password: passwordHash },
    });

    const branchId = spec.branchScoped ? branch.id : null;
    const assignment = await prisma.userRole.findFirst({ where: { userId: user.id, roleId: role.id } });
    if (!assignment) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, branchId } });
    }

    // Domain records so role-specific pages have a subject to load.
    if (spec.roleName === 'Teacher' || spec.roleName === 'Accountant' || spec.roleName === 'Receptionist' || spec.roleName === 'Janitor') {
      const staffRecord = await prisma.staffRecord.findUnique({ where: { userId: user.id } });
      if (!staffRecord) {
        await prisma.staffRecord.create({
          data: {
            userId: user.id,
            joiningDate: new Date('2025-01-05'),
            designation: spec.roleName,
            contractType: 'FIXED',
            salaryStructure: { baseMonthlySalary: 45000 },
          },
        });
      }
    }

    if (spec.roleName === 'Student') {
      const student = await prisma.student.findUnique({ where: { userId: user.id } });
      if (!student) {
        await prisma.student.create({
          data: { userId: user.id, admissionDate: new Date('2025-02-01'), emergencyContact: '9800000001' },
        });
      }
    }

    if (spec.roleName === 'Parent') {
      const parent = await prisma.parent.findUnique({ where: { userId: user.id } });
      if (!parent) {
        await prisma.parent.create({ data: { userId: user.id } });
      }
    }

  }

  // Link the demo student to the demo parent.
  const studentUser = await prisma.user.findUnique({ where: { email: 'student@demo.tms.local' }, include: { student: true } });
  const parentUser = await prisma.user.findUnique({ where: { email: 'parent@demo.tms.local' }, include: { parent: true } });
  if (studentUser?.student && parentUser?.parent) {
    const link = await prisma.studentParent.findUnique({
      where: { studentId_parentId: { studentId: studentUser.student.id, parentId: parentUser.parent.id } },
    });
    if (!link) {
      await prisma.studentParent.create({
        data: { studentId: studentUser.student.id, parentId: parentUser.parent.id },
      });
    }
  }

  await seedDemoPortalData(tenant.id, branch.id);

  console.log('[seed] Demo tenant ready.');
  console.log(`[seed]   Tenant: ${tenant.name} (${tenant.id}) — branch: ${branch.name}`);
}

async function seedDemoPortalData(tenantId: string, branchId: string): Promise<void> {
  const [tenantAdmin, branchAdmin, teacher, accountant, reception, janitor, studentUser, parentUser] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'tenantadmin@demo.tms.local' } }),
    prisma.user.findUnique({ where: { email: 'branchadmin@demo.tms.local' } }),
    prisma.user.findUnique({ where: { email: 'teacher@demo.tms.local' } }),
    prisma.user.findUnique({ where: { email: 'accountant@demo.tms.local' } }),
    prisma.user.findUnique({ where: { email: 'reception@demo.tms.local' } }),
    prisma.user.findUnique({ where: { email: 'janitor@demo.tms.local' } }),
    prisma.user.findUnique({ where: { email: 'student@demo.tms.local' }, include: { student: true } }),
    prisma.user.findUnique({ where: { email: 'parent@demo.tms.local' } }),
  ]);
  if (!tenantAdmin || !branchAdmin || !teacher || !accountant || !reception || !janitor || !studentUser?.student || !parentUser) {
    throw new Error('Demo users must exist before portal fixtures are seeded.');
  }

  const now = new Date();
  const daysFromNow = (days: number, hour = 9) => {
    const value = new Date(now);
    value.setDate(value.getDate() + days);
    value.setHours(hour, 0, 0, 0);
    return value;
  };
  const student = studentUser.student;

  const grade = await prisma.grade.upsert({
    where: { tenantId_name: { tenantId, name: 'Grade 8' } },
    update: { monthlyFee: 6500, admissionFee: 12000 },
    create: { tenantId, name: 'Grade 8', sortOrder: 8, monthlyFee: 6500, admissionFee: 12000 },
  });
  await prisma.student.update({ where: { id: student.id }, data: { gradeId: grade.id, admissionStatus: 'ACTIVE' } });

  const course = await prisma.course.upsert({
    where: { id: 'demo-course-grade-8' },
    update: {},
    create: { id: 'demo-course-grade-8', tenantId, branchId, gradeId: grade.id, name: 'Grade 8 Core Programme', description: 'English, Mathematics, Science, Social Studies and Computer Science.', feeStructure: { monthly: 6500, billingMode: 'GRADE' } },
  });
  const demoClass = await prisma.class.upsert({
    where: { id: 'demo-class-8-a' },
    update: { teacherId: teacher.id },
    create: { id: 'demo-class-8-a', courseId: course.id, branchId, teacherId: teacher.id, name: 'Grade 8 · Section A', schedule: [{ day: 'Sunday', start: '09:00', end: '10:00', subject: 'Mathematics' }, { day: 'Monday', start: '10:00', end: '11:00', subject: 'Science' }, { day: 'Wednesday', start: '11:00', end: '12:00', subject: 'English' }] },
  });
  await prisma.enrollment.upsert({
    where: { id: 'demo-enrollment-anisha' }, update: { status: 'ACTIVE' },
    create: { id: 'demo-enrollment-anisha', studentId: student.id, courseId: course.id, classId: demoClass.id, status: 'ACTIVE', admissionDate: daysFromNow(-180) },
  });

  const pastSession = await prisma.teacherSession.upsert({
    where: { id: 'demo-session-complete' }, update: {},
    create: { id: 'demo-session-complete', teacherId: teacher.id, classId: demoClass.id, date: daysFromNow(-1), status: 'PRESENT_CONFIRMED', checkInTime: daysFromNow(-1, 9), checkOutTime: daysFromNow(-1, 10), totalMinutes: 60, dailyUpdateSubmitted: true, updateContent: 'Completed linear equations practice and reviewed homework.' },
  });
  await prisma.teacherSession.upsert({
    where: { id: 'demo-session-upcoming' }, update: {},
    create: { id: 'demo-session-upcoming', teacherId: teacher.id, classId: demoClass.id, date: daysFromNow(1), status: 'PRESENT_UPDATE_PENDING' },
  });
  await prisma.teacherAttendance.upsert({
    where: { id: 'demo-teacher-attendance' }, update: {},
    create: { id: 'demo-teacher-attendance', userId: teacher.id, branchId, stampType: 'IN', latitude: 27.6915, longitude: 85.3422, gpsAccuracy: 8, timestamp: daysFromNow(0, 8) },
  });
  await prisma.studentAttendance.upsert({
    where: { id: 'demo-student-attendance' }, update: {},
    create: { id: 'demo-student-attendance', studentId: student.id, classId: demoClass.id, sessionId: pastSession.id, date: daysFromNow(-1), status: 'PRESENT', markedBy: teacher.id },
  });

  const homework = await prisma.homework.upsert({
    where: { id: 'demo-homework-maths' }, update: {},
    create: { id: 'demo-homework-maths', classId: demoClass.id, subject: 'Mathematics', title: 'Linear equations practice', description: 'Complete exercises 4.1–4.3 and show each calculation step.', deadline: daysFromNow(3, 18), createdBy: teacher.id },
  });
  await prisma.homework.upsert({
    where: { id: 'demo-homework-science' }, update: {},
    create: { id: 'demo-homework-science', classId: demoClass.id, subject: 'Science', title: 'Cell structure diagram', description: 'Draw and label plant and animal cells.', deadline: daysFromNow(5, 18), createdBy: teacher.id },
  });
  await prisma.homeworkSubmission.upsert({
    where: { homeworkId_studentId: { homeworkId: homework.id, studentId: student.id } }, update: {},
    create: { homeworkId: homework.id, studentId: student.id, submissionUrl: '/demo/homework/linear-equations.pdf', grade: '18/20', remarks: 'Clear working and strong accuracy.', gradedBy: teacher.id },
  });

  const syllabus = await prisma.syllabus.upsert({
    where: { classId_subject: { classId: demoClass.id, subject: 'Mathematics' } }, update: {},
    create: { classId: demoClass.id, subject: 'Mathematics', createdBy: teacher.id },
  });
  const chapterOne = await prisma.syllabusChapter.upsert({ where: { syllabusId_position: { syllabusId: syllabus.id, position: 1 } }, update: { status: 'COMPLETED' }, create: { syllabusId: syllabus.id, title: 'Rational Numbers', position: 1, status: 'COMPLETED' } });
  await prisma.syllabusChapter.upsert({ where: { syllabusId_position: { syllabusId: syllabus.id, position: 2 } }, update: { status: 'IN_PROGRESS' }, create: { syllabusId: syllabus.id, title: 'Linear Equations', position: 2, status: 'IN_PROGRESS' } });
  await prisma.dailyLessonLog.upsert({
    where: { chapterId_logDate: { chapterId: chapterOne.id, logDate: daysFromNow(-1) } }, update: {},
    create: { syllabusId: syllabus.id, chapterId: chapterOne.id, teacherId: teacher.id, classId: demoClass.id, logDate: daysFromNow(-1), status: 'COMPLETED', notes: 'Revision and problem-solving session completed.' },
  });

  await prisma.studentScore.upsert({ where: { id: 'demo-score-maths' }, update: {}, create: { id: 'demo-score-maths', tenantId, studentId: student.id, recordedBy: teacher.id, subject: 'Mathematics', assessment: 'Monthly Test', score: 42, maximum: 50, passMarks: 20, percentile: 86, publishedAt: daysFromNow(-5), testDate: daysFromNow(-7) } });
  await prisma.studentScore.upsert({ where: { id: 'demo-score-science' }, update: {}, create: { id: 'demo-score-science', tenantId, studentId: student.id, recordedBy: teacher.id, subject: 'Science', assessment: 'Practical Assessment', score: 45, maximum: 50, passMarks: 20, percentile: 91, publishedAt: daysFromNow(-3), testDate: daysFromNow(-6) } });
  await prisma.studentRemark.upsert({ where: { id: 'demo-remark-progress' }, update: {}, create: { id: 'demo-remark-progress', tenantId, studentId: student.id, authorId: teacher.id, subject: 'Learning progress', message: 'Anisha is participating confidently and has improved her calculation accuracy.', signal: 'IMPROVING', parentVisible: true } });

  await prisma.invoice.upsert({ where: { id: 'demo-invoice-unpaid' }, update: {}, create: { id: 'demo-invoice-unpaid', tenantId, branchId, studentId: student.id, amount: 6500, discount: 500, fine: 0, netPayable: 6000, billingCycleStart: daysFromNow(-10), billingCycleEnd: daysFromNow(20), dueDate: daysFromNow(7), status: 'UNPAID', invoiceType: 'TUITION', panNumberSnapshot: DEMO_TENANT_PAN, vatRateSnapshot: 0, nepalPayQrCode: 'DEMO-NEPALPAY-QR' } });
  await prisma.invoice.upsert({ where: { id: 'demo-invoice-paid' }, update: {}, create: { id: 'demo-invoice-paid', tenantId, branchId, studentId: student.id, amount: 6500, netPayable: 6500, billingCycleStart: daysFromNow(-40), billingCycleEnd: daysFromNow(-11), dueDate: daysFromNow(-17), status: 'PAID', invoiceType: 'TUITION', panNumberSnapshot: DEMO_TENANT_PAN, vatRateSnapshot: 0, transactionId: 'DEMO-TXN-0001', paymentDate: daysFromNow(-20) } });

  await prisma.parentMessage.upsert({ where: { id: 'demo-message-parent' }, update: {}, create: { id: 'demo-message-parent', tenantId, studentId: student.id, senderId: parentUser.id, receiverId: teacher.id, messageText: 'Could you please share which algebra topics Anisha should revise this week?' } });
  await prisma.parentMessage.upsert({ where: { id: 'demo-message-teacher' }, update: {}, create: { id: 'demo-message-teacher', tenantId, studentId: student.id, senderId: teacher.id, receiverId: parentUser.id, messageText: 'Please focus on equations with variables on both sides. I have also posted a practice sheet.', readAt: now } });
  await prisma.broadcast.upsert({ where: { id: 'demo-broadcast-exam' }, update: {}, create: { id: 'demo-broadcast-exam', tenantId, authorId: tenantAdmin.id, title: 'Monthly assessment schedule', message: 'Monthly assessments begin next Sunday. The detailed routine is available in the calendar.', audienceRoles: ['Student', 'Parent', 'Teacher'] } });

  await prisma.appointment.upsert({ where: { id: 'demo-appointment-pending' }, update: {}, create: { id: 'demo-appointment-pending', tenantId, studentId: student.id, requestedById: parentUser.id, teacherId: branchAdmin.id, scheduledTime: daysFromNow(2, 15), status: 'REQUESTED', participantIds: [branchAdmin.id], participantApprovals: {}, remarks: 'Discuss academic progress and preparation for the monthly assessment.' } });
  await prisma.appointment.upsert({ where: { id: 'demo-appointment-confirmed' }, update: {}, create: { id: 'demo-appointment-confirmed', tenantId, studentId: student.id, requestedById: parentUser.id, teacherId: teacher.id, scheduledTime: daysFromNow(4, 14), status: 'CONFIRMED', participantIds: [teacher.id], participantApprovals: { [teacher.id]: 'APPROVED' }, remarks: 'Review Mathematics learning plan.', responseRemarks: 'Confirmed. Please meet in Classroom 8A at 2:00 PM.' } });

  await prisma.leave.upsert({ where: { id: 'demo-leave-teacher' }, update: {}, create: { id: 'demo-leave-teacher', tenantId, branchId, userId: teacher.id, leaveType: 'CASUAL', startDate: daysFromNow(6), endDate: daysFromNow(6), reason: 'Family ceremony', status: 'PENDING' } });
  await prisma.leave.upsert({ where: { id: 'demo-leave-student' }, update: {}, create: { id: 'demo-leave-student', tenantId, branchId, userId: studentUser.id, leaveType: 'SICK', startDate: daysFromNow(-3), endDate: daysFromNow(-2), reason: 'Seasonal fever', status: 'APPROVED_LEVEL2', approvedBy: branchAdmin.id, remarks: 'Approved as excused absence.' } });
  await prisma.pettyCash.upsert({ where: { id: 'demo-petty-cash' }, update: {}, create: { id: 'demo-petty-cash', tenantId, branchId, accountantId: accountant.id, purpose: 'Science laboratory consumables', amount: 4800, status: 'PENDING', remainingBalance: 4800, approvalChain: [{ role: 'Accountant', action: 'SUBMITTED', comment: 'Replacement beakers and indicator paper', timestamp: now.toISOString() }] } });

  await prisma.resourceLog.upsert({ where: { id: 'demo-resource-pending' }, update: {}, create: { id: 'demo-resource-pending', branchId, classroomId: 'Grade 8A', staffId: teacher.id, itemsCondition: { whiteboard: 'DAMAGED', markers: 'LOW', duster: 'OK', projector: 'OK' }, actionRequired: true, remarks: 'Whiteboard surface is scratched and difficult to clean.', status: 'PENDING' } });
  await prisma.resourceLog.upsert({ where: { id: 'demo-resource-progress' }, update: {}, create: { id: 'demo-resource-progress', branchId, classroomId: 'Science Lab', staffId: teacher.id, itemsCondition: { beakers: 'LOW', microscope: 'OK', sink: 'LEAKING' }, actionRequired: true, remarks: 'Sink tap requires a new washer.', status: 'IN_PROGRESS', assignedTaskId: 'demo-maintenance-lab' } });
  await prisma.resourceLog.upsert({ where: { id: 'demo-resource-complete' }, update: {}, create: { id: 'demo-resource-complete', branchId, classroomId: 'Library', staffId: reception.id, itemsCondition: { lights: 'OK', chairs: 'OK', shelves: 'OK' }, actionRequired: false, remarks: 'Weekly inspection completed.', status: 'COMPLETED' } });
  await prisma.maintenanceTask.upsert({ where: { id: 'demo-maintenance-lab' }, update: {}, create: { id: 'demo-maintenance-lab', branchId, assignedStaffId: janitor.id, classroomId: 'Science Lab', description: 'Repair the leaking sink tap and confirm the work with the branch office.', status: 'IN_PROGRESS', escalationDaysSnapshot: 3 } });
  await prisma.maintenanceTask.upsert({ where: { id: 'demo-maintenance-classroom' }, update: {}, create: { id: 'demo-maintenance-classroom', branchId, assignedStaffId: janitor.id, classroomId: 'Grade 8A', description: 'Clean the whiteboard and replace the marker set.', status: 'PENDING', escalationDaysSnapshot: 3 } });

  await prisma.academicEvent.upsert({ where: { id: 'demo-event-exam' }, update: {}, create: { id: 'demo-event-exam', tenantId, branchId, title: 'Monthly Mathematics Assessment', description: 'Bring geometry instruments and arrive 15 minutes early.', eventType: 'EXAM', startDate: daysFromNow(8, 10), endDate: daysFromNow(8, 12) } });
  await prisma.academicEvent.upsert({ where: { id: 'demo-event-parent' }, update: {}, create: { id: 'demo-event-parent', tenantId, title: 'Parent–Teacher Interaction Day', description: 'Scheduled meetings will be held branch-wise.', eventType: 'EVENT', startDate: daysFromNow(14, 9), endDate: daysFromNow(14, 16) } });
  const template = await prisma.certificateTemplate.upsert({ where: { id: 'demo-certificate-template' }, update: {}, create: { id: 'demo-certificate-template', tenantId, name: 'Academic Excellence', type: 'ACHIEVEMENT', layoutConfig: { theme: 'formal', accent: 'navy', signatory: 'Principal' } } });
  await prisma.certificate.upsert({ where: { certificateId: 'TMS-DEMO-2026-001' }, update: {}, create: { certificateId: 'TMS-DEMO-2026-001', studentId: student.id, templateId: template.id, branchId, issuerId: tenantAdmin.id, issuedDate: daysFromNow(-30), pdfUrl: '/demo/certificates/TMS-DEMO-2026-001.pdf' } });
  await prisma.receptionCheckIn.upsert({ where: { branchId_studentId_checkInDate: { branchId, studentId: student.id, checkInDate: daysFromNow(0) } }, update: {}, create: { tenantId, branchId, studentId: student.id, checkedInById: reception.id, checkInDate: daysFromNow(0), checkedInAt: daysFromNow(0, 8) } });

  await prisma.tenantRequest.upsert({ where: { id: 'demo-tenant-request-pending' }, update: {}, create: { id: 'demo-tenant-request-pending', name: 'Himalayan Learning Centre', email: 'hello@himalayan-demo.edu.np', phone: '9812345678', panNumber: '222222222', remarks: 'Two branches with approximately 420 students.', status: 'PENDING' } });
  await prisma.tenantRequest.upsert({ where: { id: 'demo-tenant-request-approved' }, update: {}, create: { id: 'demo-tenant-request-approved', name: 'Sunrise Tutorial Hub', email: 'admin@sunrise-demo.edu.np', phone: '9801234567', panNumber: '333333333', remarks: 'Requested onboarding for the upcoming academic term.', status: 'APPROVED' } });
  await prisma.expense.upsert({ where: { id: 'demo-expense-rent' }, update: {}, create: { id: 'demo-expense-rent', tenantId, branchId, category: 'RENT', amount: 85000, purpose: 'Baneshwor branch monthly rent', date: daysFromNow(-9), approvedBy: tenantAdmin.id } });
  await prisma.expense.upsert({ where: { id: 'demo-expense-utilities' }, update: {}, create: { id: 'demo-expense-utilities', tenantId, branchId, category: 'UTILITIES', amount: 12450, purpose: 'Electricity and internet charges', date: daysFromNow(-4), approvedBy: branchAdmin.id } });

  const teacherStaff = await prisma.staffRecord.findUnique({ where: { userId: teacher.id } });
  if (teacherStaff) {
    await prisma.staffPerformanceScore.upsert({ where: { staffRecordId: teacherStaff.id }, update: {}, create: { staffRecordId: teacherStaff.id, overallScore: 92, attendanceRate: 96, classUpdateRate: 94, studentFeedbackScore: 4.6, parentFeedbackScore: 4.7, leaveComplianceRate: 100, scoreHistory: [{ month: 'Baisakh', score: 88 }, { month: 'Jestha', score: 90 }, { month: 'Ashadh', score: 92 }] } });
    await prisma.staffDocument.upsert({ where: { id: 'demo-staff-document' }, update: {}, create: { id: 'demo-staff-document', staffRecordId: teacherStaff.id, documentType: 'CONTRACT', fileUrl: '/demo/staff/teacher-contract.pdf', expiryDate: daysFromNow(240) } });
  }

  console.log('[seed]   Portal fixtures: academics, operations, finance, communication, and resource logs.');
}

main()
  .catch((error) => {
    console.error('[seed] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
