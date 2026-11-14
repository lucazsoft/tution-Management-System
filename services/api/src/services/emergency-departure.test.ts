import assert from 'node:assert/strict';
import {
  alertGuardians,
  departureMessage,
  departureSummary,
  nepalTimeLabel,
  usablePhone,
} from './emergency-departure';

async function main() {
  // Nepal time (UTC+5:45).
  assert.equal(nepalTimeLabel(new Date('2026-11-15T08:20:00Z')), '14:05, 15 Nov');
  assert.equal(nepalTimeLabel(new Date('2026-11-14T18:20:00Z')), '00:05, 15 Nov');

  // Phone normalisation: only 10-digit Nepali mobiles are texted.
  assert.equal(usablePhone('9812345678'), '9812345678');
  assert.equal(usablePhone('+977 981-234-5678'), '9812345678');
  assert.equal(usablePhone('9779812345678'), '9812345678');
  assert.equal(usablePhone('98510XXXXX'), null, 'the old placeholder is never texted');
  assert.equal(usablePhone('014412345'), null, 'landlines are skipped');
  assert.equal(usablePhone(''), null);
  assert.equal(usablePhone(null), null);

  const text = departureMessage({
    studentName: 'Sushanta Thapa',
    branchName: 'Damak',
    at: new Date('2026-11-15T08:20:00Z'),
    reason: 'Fever, sent home',
    collectedBy: 'Father',
  });
  assert.equal(
    text,
    'ALERT: Sushanta Thapa left Damak early at 14:05, 15 Nov. Reason: Fever, sent home. Collected by: Father. Please contact the branch if this is unexpected.',
  );
  assert.ok(!departureMessage({ studentName: 'A', branchName: 'B', at: new Date(), reason: 'R' }).includes('Collected by'));
  assert.ok(departureMessage({ studentName: 'A', branchName: 'B', at: new Date(), reason: 'x'.repeat(500) }).length < 320,
    'long reasons are clipped');

  // Delivery: one SMS per distinct number; failures and missing phones counted.
  const sent: string[] = [];
  const sender = {
    async sendSms(to: string) {
      sent.push(to);
      if (to === '9800000003') return { success: false };
      if (to === '9800000004') throw new Error('gateway down');
      return { success: true };
    },
  };
  const result = await alertGuardians(sender, [
    { userId: 'mum', phone: '9800000001' },
    { userId: 'dad', phone: '+9779800000001' }, // same number as mum
    { userId: 'aunt', phone: '9800000003' },
    { userId: 'uncle', phone: '9800000004' },
    { userId: 'grandpa', phone: '' },
  ], text);
  assert.deepEqual(sent.sort(), ['9800000001', '9800000003', '9800000004']);
  assert.deepEqual(result, { guardians: 5, attempted: 3, sent: 1, failed: 2, withoutPhone: 1 });

  // Staff-facing summaries.
  assert.match(departureSummary(result), /SMS sent to 1 number; 3 parent contacts could not be reached/);
  assert.match(departureSummary({ guardians: 0, attempted: 0, sent: 0, failed: 0, withoutPhone: 0 }), /No parent is linked/);
  assert.match(departureSummary({ guardians: 2, attempted: 1, sent: 0, failed: 1, withoutPhone: 1 }), /no parent SMS could be sent/);
  assert.equal(departureSummary({ guardians: 2, attempted: 2, sent: 2, failed: 0, withoutPhone: 0 }),
    'Emergency departure recorded. Parent SMS sent to 2 numbers.');

  console.log('emergency-departure service tests passed');
}

main().catch((error) => { console.error(error); process.exit(1); });
