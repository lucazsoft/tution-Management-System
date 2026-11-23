// Build the same bundled worker for a Flutter web release using PUBLIC client
// settings. No service-account JSON/private key is accepted by this script.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Provide the path to the PUBLIC Flutter web client define JSON.');
const settings = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (Object.keys(settings).some((key) => /PRIVATE_KEY|CLIENT_EMAIL|TOKEN|PASSWORD|SECRET/i.test(key))) {
  throw new Error('Client build file must not contain server credentials or secrets.');
}
const fields = {
  FIREBASE_API_KEY: 'TMS_FIREBASE_API_KEY', FIREBASE_APP_ID: 'TMS_FIREBASE_APP_ID',
  FIREBASE_PROJECT_ID: 'TMS_FIREBASE_PROJECT_ID', FIREBASE_MESSAGING_SENDER_ID: 'TMS_FIREBASE_MESSAGING_SENDER_ID',
  FIREBASE_AUTH_DOMAIN: 'TMS_FIREBASE_AUTH_DOMAIN', FIREBASE_WEB_VAPID_KEY: 'TMS_FIREBASE_WEB_VAPID_KEY',
};
for (const [source, target] of Object.entries(fields)) {
  if (source !== 'FIREBASE_AUTH_DOMAIN' && (typeof settings[source] !== 'string' || !settings[source].trim())) {
    throw new Error(`Missing public client setting: ${source}`);
  }
  process.env[target] = settings[source] || '';
}
// Flutter web uses the Flutter route table, not the React admin routes.
process.env.TMS_PUSH_NATIVE_WEB_ROUTES = 'true';
const { default: configs } = await import('../apps/web/webpack.config.js');
const config = configs.find((entry) => entry.name === 'messaging-worker');
config.context = path.join(root, 'apps/web');
config.dependencies = [];
config.mode = 'production';
config.output.path = path.join(root, 'apps/mobile/web');
const stats = await new Promise((resolve, reject) => webpack(config, (error, result) => error ? reject(error) : resolve(result)));
if (stats.hasErrors()) throw new Error(stats.toString({ all: false, errors: true }));
console.log('Bundled Flutter web messaging worker. Client settings must match the Flutter web build.');
