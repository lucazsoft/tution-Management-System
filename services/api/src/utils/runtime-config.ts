type Environment = Record<string, string | undefined>;

export interface RuntimeConfig {
  authSecret: string;
  authUrl: string;
  webOrigin: string;
}

export const PRODUCTION_BOOTSTRAP_ACK = 'INITIAL_TENANT_BOOTSTRAP';

function required(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required before starting the API.`);
  }
  return value;
}

function validateUrl(value: string, name: string, requireHttps: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL.`);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must be an HTTP(S) URL.`);
  }
  if (requireHttps && url.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS in production.`);
  }

  return url.origin;
}

export function validateRuntimeConfig(env: Environment = process.env): RuntimeConfig {
  const isProduction = env.NODE_ENV === 'production';
  const authSecret = required(env, 'BETTER_AUTH_SECRET');
  if (authSecret.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must be at least 32 characters long.');
  }

  const authUrl = validateUrl(required(env, 'BETTER_AUTH_URL'), 'BETTER_AUTH_URL', isProduction);
  const webOrigin = validateUrl(required(env, 'WEB_ORIGIN'), 'WEB_ORIGIN', isProduction);

  if (isProduction) {
    if (env.PLATFORM_ADMIN_ENABLED === 'true' && env.PLATFORM_ADMIN_PRODUCTION_ACK !== PRODUCTION_BOOTSTRAP_ACK) {
      throw new Error(
        `PLATFORM_ADMIN_PRODUCTION_ACK must equal ${PRODUCTION_BOOTSTRAP_ACK} when enabling platform administration in production.`,
      );
    }
    const smsProvider = (env.SMS_PROVIDER || 'MOCK').toUpperCase();
    if (smsProvider === 'MOCK') {
      throw new Error('SMS_PROVIDER must not be MOCK in production.');
    }
    if (!['AAKASH', 'DISABLED'].includes(smsProvider)) {
      throw new Error('SMS_PROVIDER must be AAKASH or DISABLED in production.');
    }
    if (smsProvider === 'AAKASH' && !env.AAKASH_SMS_AUTH_TOKEN?.trim()) {
      throw new Error('AAKASH_SMS_AUTH_TOKEN is required when SMS_PROVIDER=AAKASH.');
    }
    const pushProvider = (env.PUSH_PROVIDER || 'DISABLED').toUpperCase();
    if (!['WEBHOOK', 'DISABLED'].includes(pushProvider)) {
      throw new Error('PUSH_PROVIDER must be WEBHOOK or DISABLED in production.');
    }
    if (pushProvider === 'WEBHOOK') {
      validateUrl(required(env, 'PUSH_WEBHOOK_URL'), 'PUSH_WEBHOOK_URL', true);
      if (!env.PUSH_WEBHOOK_TOKEN?.trim()) throw new Error('PUSH_WEBHOOK_TOKEN is required when PUSH_PROVIDER=WEBHOOK.');
    }
    const webhookSecret = required(env, 'NEPALPAY_WEBHOOK_SECRET');
    if (webhookSecret.length < 32) {
      throw new Error('NEPALPAY_WEBHOOK_SECRET must be at least 32 characters long.');
    }
  }

  return { authSecret, authUrl, webOrigin };
}
