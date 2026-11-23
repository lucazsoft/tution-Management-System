// Phone-linked logins (docs/planphone.md, phase 7). Database calls are stubbed.
import assert from 'node:assert/strict';
import prisma from '../utils/db';
import {
  deliverablePhone,
  findExistingParent,
  generateLoginEmail,
  loginEmailLocalPart,
  parseAdmissionParent,
  parseAdmissionStudent,
  readYesNo,
} from './admission-identity';
import { deliveryPhoneFor, EXISTING_LOGIN_CHANNEL, prepareAdmissionDeliveries, primaryGuardian } from './admission-delivery';
import { resolveSecurityMobile } from '../utils/linked-security-mobile';

const db = prisma as any;
const verifiedAt = new Date('2026-11-01T00:00:00Z');

async function identityRules() {
  // Login ID local part: ASCII, dotted, never empty.
  assert.equal(loginEmailLocalPart('Rām', 'Śarmā K.C.'), 'ram.sarma.k.c');
  assert.equal(loginEmailLocalPart('  Anu ', 'Shrestha'), 'anu.shrestha');
  assert.equal(loginEmailLocalPart('राम', 'शर्मा'), 'user');

  // Collision suffixes: name, name2, name3…
  const db1 = { user: { findMany: async () => [{ email: 'ram.sharma@login.test' }, { email: 'ram.sharma2@login.test' }] } };
  assert.equal(await generateLoginEmail(db1 as any, 'Ram', 'Sharma', 'login.test'), 'ram.sharma3@login.test');
  const db2 = { user: { findMany: async () => [] } };
  assert.equal(await generateLoginEmail(db2 as any, 'Ram', 'Sharma', 'login.test'), 'ram.sharma@login.test');

  // Yes/no parsing for JSON and CSV.
  assert.equal(readYesNo(true), true);
  assert.equal(readYesNo('Yes'), true);
  assert.equal(readYesNo(''), false);
  assert.equal(readYesNo('maybe'), null);
  assert.equal(deliverablePhone('+977 981-2345678'), '9812345678');
  assert.equal(deliverablePhone('12345'), null);

  // Student phone rule: own phone XOR "use parent's number".
  const base = { firstName: 'Ram', lastName: 'Sharma' };
  assert.equal(parseAdmissionStudent({ ...base, phone: '9812345678' }).success, true);
  const linked = parseAdmissionStudent({ ...base, useGuardianPhone: true });
  assert.ok(linked.success && linked.data.usesGuardianPhone && linked.data.email === '');
  assert.match((parseAdmissionStudent(base) as any).error, /tick 'Use parent's number as primary'/);
  assert.match((parseAdmissionStudent({ ...base, phone: '9812345678', useGuardianPhone: true }) as any).error, /not both/);
  assert.match((parseAdmissionStudent({ ...base, phone: '123' }) as any).error, /10-digit/);
  assert.match((parseAdmissionStudent({ ...base, phone: '9812345678', role: 'x' }) as any).error, /Unexpected field: role/);
  assert.match((parseAdmissionStudent({ ...base, email: 'bad', phone: '9812345678' }) as any).error, /email is invalid/);

  // Parent: email optional, phone always required.
  const parent = parseAdmissionParent({ firstName: 'Hari', lastName: 'Sharma', phone: '9812345678' });
  assert.ok(parent.success && parent.data.email === '');
  assert.match((parseAdmissionParent({ firstName: 'Hari', lastName: 'Sharma' }) as any).error, /phone is required/);
  console.log('PASS identity rules: generated login IDs, student phone choice, parent phone required');
}

async function siblingMatching() {
  const parentUser = (id: string, phone: string, extra: Record<string, unknown> = {}) => ({
    id, email: `${id}@x.test`, phone, tenantId: 't1', firstName: 'Hari', lastName: id,
    parent: { id: `p-${id}`, _count: { studentParents: 1 } }, ...extra,
  });
  const person = { firstName: 'Hari', lastName: 'Sharma', email: '', phone: '9812345678' };

  // No email: matched by normalised phone.
  db.user.findMany = async () => [parentUser('a', '+977-9812345678')];
  assert.deepEqual(await findExistingParent('t1', person), { kind: 'parent', parentId: 'p-a', userId: 'a', email: 'a@x.test', phone: '+977-9812345678' });

  // Two parents with the phone: never guessed, choices returned.
  db.user.findMany = async () => [parentUser('a', '9812345678'), parentUser('b', '9812345678')];
  const twice = await findExistingParent('t1', person);
  assert.ok(twice.kind === 'conflict' && twice.status === 409 && twice.parentChoices?.length === 2);

  // A suffix match that normalises to a different number is not a match.
  db.user.findMany = async () => [parentUser('a', '9702345678')];
  assert.deepEqual(await findExistingParent('t1', person), { kind: 'none' });

  // Real email of an existing Parent here: linked. Of staff or another tenant: 409.
  db.user.findUnique = async () => parentUser('a', '9812345678');
  assert.equal((await findExistingParent('t1', { ...person, email: 'a@x.test' })).kind, 'parent');
  db.user.findUnique = async () => parentUser('s', '9812345678', { parent: null });
  assert.equal((await findExistingParent('t1', { ...person, email: 's@x.test' })).kind, 'conflict');
  db.user.findUnique = async () => parentUser('o', '9812345678', { tenantId: 't2' });
  assert.equal((await findExistingParent('t1', { ...person, email: 'o@x.test' })).kind, 'conflict');
  db.user.findUnique = async () => null;
  assert.deepEqual(await findExistingParent('t1', { ...person, email: 'new@x.test' }), { kind: 'none' });

  // Explicit choice must be a Parent in this tenant.
  db.user.findFirst = async ({ where }: any) => (where.id === 'a' && where.tenantId === 't1' ? parentUser('a', '9812345678') : null);
  assert.equal((await findExistingParent('t1', person, 'a')).kind, 'parent');
  assert.equal((await findExistingParent('t1', person, 'zzz')).kind, 'conflict');
  console.log('PASS sibling matching: by email, by phone, ambiguous phone, explicit choice');
}

async function deliveryRouting() {
  const parent = { phone: '9811111111' };
  assert.equal(deliveryPhoneFor('PARENT', { usesGuardianPhone: false, user: { phone: '9822222222' } }, parent), '9811111111');
  assert.equal(deliveryPhoneFor('STUDENT', { usesGuardianPhone: true, user: { phone: '' } }, parent), '9811111111');
  assert.equal(deliveryPhoneFor('STUDENT', { usesGuardianPhone: false, user: { phone: '9822222222' } }, parent), '9822222222');
  assert.equal(deliveryPhoneFor('STUDENT', { usesGuardianPhone: false, user: { phone: '' } }, parent), null);
  assert.deepEqual(primaryGuardian([{ isPrimary: false, id: 1 }, { isPrimary: true, id: 2 }]), { isPrimary: true, id: 2 });
  assert.deepEqual(primaryGuardian([{ isPrimary: false, id: 1 }]), { isPrimary: false, id: 1 });

  // Sibling admission: the active parent keeps their password; only the
  // student SMS is queued, and it goes to the parent's phone.
  const created: any[] = [];
  const upserts: any[] = [];
  const userUpdates: any[] = [];
  const tx = {
    $queryRaw: async () => [],
    student: {
      findFirst: async () => ({
        id: 's2', usesGuardianPhone: true,
        user: { id: 'u-s2', firstName: 'Sita', lastName: 'Sharma', email: 'sita.sharma@login.test', phone: '' },
        studentParents: [{ isPrimary: true, parent: { user: { id: 'u-p', firstName: 'Hari', lastName: 'Sharma', email: 'hari@x.test', phone: '9811111111', status: 'ACTIVE' } } }],
        invoices: [{ status: 'PAID', paymentDate: new Date() }],
      }),
      update: async () => ({}),
    },
    admissionLoginDelivery: {
      findMany: async () => [],
      create: async (args: any) => { created.push(args.data); return args.data; },
      upsert: async (args: any) => { upserts.push(args.create); return args.create; },
    },
    user: { update: async (args: any) => { userUpdates.push(args.where.id); return {}; } },
    account: { updateMany: async () => ({ count: 1 }) },
    enrollment: { updateMany: async () => ({ count: 0 }) },
  };
  db.$transaction = async (fn: any) => fn(tx);
  process.env.ADMISSION_DELIVERY_SECRET ??= 'test-only-admission-delivery-secret-value';
  const phones = await prepareAdmissionDeliveries('t1', 's2');
  assert.equal(phones.studentPhone, '9811111111');
  assert.equal(created.length, 1);
  assert.equal(created[0].recipient, 'PARENT');
  assert.equal(created[0].channel, EXISTING_LOGIN_CHANNEL);
  assert.equal(created[0].status, 'SENT');
  assert.deepEqual(upserts.map((job) => job.recipient), ['STUDENT']);
  assert.deepEqual(userUpdates, ['u-s2'], 'only the student password is (re)issued');
  console.log('PASS delivery routing: guardian phone, sibling parent login left untouched');
}

async function securityMobileResolution() {
  const guardian = { id: 'u-p', status: 'ACTIVE', phone: '9811111111', securityMobile: '9811111111', securityMobileVerifiedAt: verifiedAt };
  const studentUser = { id: 'u-s', status: 'ACTIVE', phone: '', securityMobile: null, securityMobileVerifiedAt: null };
  let student: any = { usesGuardianPhone: true, studentParents: [{ isPrimary: true, parent: { user: guardian } }] };
  db.student.findUnique = async () => student;

  assert.deepEqual(await resolveSecurityMobile(studentUser), { via: 'GUARDIAN', phone: '9811111111', guardianUserId: 'u-p', guardianVerifiedAt: verifiedAt });

  // Unverified or inactive guardian: no code can be sent.
  student = { ...student, studentParents: [{ isPrimary: true, parent: { user: { ...guardian, securityMobileVerifiedAt: null } } }] };
  assert.equal(await resolveSecurityMobile(studentUser), null);
  student = { ...student, studentParents: [{ isPrimary: true, parent: { user: { ...guardian, status: 'SUSPENDED' } } }] };
  assert.equal(await resolveSecurityMobile(studentUser), null);

  // A student with their own verified phone, and a non-student, use their own.
  student = { usesGuardianPhone: false, studentParents: [] };
  const own = { ...studentUser, phone: '9822222222', securityMobile: '9822222222', securityMobileVerifiedAt: verifiedAt };
  assert.deepEqual(await resolveSecurityMobile(own), { via: 'SELF', phone: '9822222222' });
  student = null;
  assert.deepEqual(await resolveSecurityMobile({ ...guardian }), { via: 'SELF', phone: '9811111111' });
  assert.equal(await resolveSecurityMobile({ ...guardian, status: 'INACTIVE' }), null);
  console.log('PASS security mobile: guardian-linked students use the verified parent phone only');
}

async function main() {
  await identityRules();
  await siblingMatching();
  await deliveryRouting();
  await securityMobileResolution();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
