import assert from 'assert';
import { validateRuntimeConfig } from './runtime-config';

const secureSecret = 'a-very-long-test-secret-that-is-safe-for-validation';

const development = validateRuntimeConfig({
  NODE_ENV: 'development',
  BETTER_AUTH_SECRET: secureSecret,
  BETTER_AUTH_URL: 'http://localhost:3001',
  WEB_ORIGIN: 'http://localhost:5173',
  PLATFORM_ADMIN_ENABLED: 'true',
  SMS_PROVIDER: 'MOCK',
  NEPALPAY_WEBHOOK_SECRET: secureSecret,
});

assert.equal(development.authUrl, 'http://localhost:3001');
assert.equal(development.webOrigin, 'http://localhost:5173');

assert.throws(
  () => validateRuntimeConfig({
    NODE_ENV: 'production',
    BETTER_AUTH_SECRET: secureSecret,
    BETTER_AUTH_URL: 'http://api.example.test',
    WEB_ORIGIN: 'https://app.example.test',
    PLATFORM_ADMIN_ENABLED: 'false',
    SMS_PROVIDER: 'TWILIO',
    NEPALPAY_WEBHOOK_SECRET: secureSecret,
  }),
  /HTTPS/,
);

assert.throws(
  () => validateRuntimeConfig({
    NODE_ENV: 'production',
    BETTER_AUTH_SECRET: secureSecret,
    BETTER_AUTH_URL: 'https://api.example.test',
    WEB_ORIGIN: 'https://app.example.test',
    PLATFORM_ADMIN_ENABLED: 'true',
    SMS_PROVIDER: 'DISABLED',
    NEPALPAY_WEBHOOK_SECRET: secureSecret,
  }),
  /PLATFORM_ADMIN_PRODUCTION_ACK/,
);

assert.doesNotThrow(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  BETTER_AUTH_SECRET: secureSecret,
  BETTER_AUTH_URL: 'https://api.example.test',
  WEB_ORIGIN: 'https://app.example.test',
  PLATFORM_ADMIN_ENABLED: 'true',
  PLATFORM_ADMIN_PRODUCTION_ACK: 'INITIAL_TENANT_BOOTSTRAP',
  SMS_PROVIDER: 'DISABLED',
  NEPALPAY_WEBHOOK_SECRET: secureSecret,
}));

assert.throws(
  () => validateRuntimeConfig({
    NODE_ENV: 'production',
    BETTER_AUTH_SECRET: secureSecret,
    BETTER_AUTH_URL: 'https://api.example.test',
    WEB_ORIGIN: 'https://app.example.test',
    PLATFORM_ADMIN_ENABLED: 'false',
    SMS_PROVIDER: 'MOCK',
    NEPALPAY_WEBHOOK_SECRET: secureSecret,
  }),
  /SMS_PROVIDER/,
);

assert.throws(
  () => validateRuntimeConfig({
    NODE_ENV: 'production',
    BETTER_AUTH_SECRET: secureSecret,
    BETTER_AUTH_URL: 'https://api.example.test',
    WEB_ORIGIN: 'https://app.example.test',
    PLATFORM_ADMIN_ENABLED: 'false',
    SMS_PROVIDER: 'AAKASH',
    NEPALPAY_WEBHOOK_SECRET: secureSecret,
  }),
  /AAKASH_SMS_AUTH_TOKEN/,
);

assert.doesNotThrow(() => validateRuntimeConfig({
  NODE_ENV: 'production',
  BETTER_AUTH_SECRET: secureSecret,
  BETTER_AUTH_URL: 'https://api.example.test',
  WEB_ORIGIN: 'https://app.example.test',
  PLATFORM_ADMIN_ENABLED: 'false',
  SMS_PROVIDER: 'DISABLED',
  NEPALPAY_WEBHOOK_SECRET: secureSecret,
}));

console.log('Runtime configuration tests passed.');

import { loginEmailDomain } from './runtime-config';
assert.equal(loginEmailDomain({ LOGIN_EMAIL_DOMAIN: 'Login.Example.com ' }), 'login.example.com');
assert.equal(loginEmailDomain({ WEB_ORIGIN: 'https://tms.example.com.np' }), 'login.tms.example.com.np');
assert.equal(loginEmailDomain({ WEB_ORIGIN: 'http://localhost:5173' }), 'login.tms.test');
assert.throws(() => loginEmailDomain({ LOGIN_EMAIL_DOMAIN: 'https://x.com' }), /bare hostname/);
console.log('Login email domain tests passed.');
