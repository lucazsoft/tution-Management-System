import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guard = path.join(root, 'scripts/notification-test-no-network.cjs');
const runner = path.join(root, 'node_modules/ts-node/dist/bin.js');
const tests = [
  'services/api/src/services/push-notification.test.ts',
  'services/api/src/services/calendar-event-notifications.test.ts',
  'services/api/src/routes/notifications.test.ts',
  'services/api/src/utils/runtime-config.test.ts',
  'services/api/src/services/financial-anomaly-alerts.test.ts',
  'services/api/src/utils/push.test.ts',
  'services/api/src/routes/leaves.test.ts',
  'services/api/src/routes/phase-three-workflows.test.ts',
];
let failed = 0;
for (const test of tests) {
  console.log(`\nLocal mock test: ${test}`);
  const result = spawnSync(process.execPath, ['--require', guard, runner, test], {
    cwd: root, stdio: 'inherit',
    env: { ...process.env,
      NODE_ENV: 'test', PUSH_PROVIDER: 'DISABLED', SMS_PROVIDER: 'DISABLED',
      FIREBASE_PROJECT_ID: '', FIREBASE_CLIENT_EMAIL: '', FIREBASE_PRIVATE_KEY: '',
      PUSH_WEBHOOK_URL: '', PUSH_WEBHOOK_TOKEN: '', AAKASH_SMS_AUTH_TOKEN: '',
      DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:1/notification_mock_only',
    },
  });
  if (result.status !== 0) failed++;
}
if (failed) throw new Error(`${failed} local notification test suite(s) failed.`);
console.log('\nPASS all eight local server/mock suites. No real provider or production database used.');
