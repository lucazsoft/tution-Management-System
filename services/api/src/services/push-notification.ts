import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import prisma from '../utils/db';

type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

type PushResult = {
  success: boolean;
  sent: number;
  failed: number;
  skipped?: boolean;
};

export interface PushProvider {
  send(tokens: string[], message: PushMessage): Promise<{
    successCount: number;
    failureCount: number;
    /** Tokens the provider reported as permanently unregistered/invalid. */
    invalidTokens?: string[];
  }>;
}

type TokenStore = {
  findMany(args: {
    where: { tenantId: string; userId: string | { in: string[] } };
    select: { token: true };
  }): Promise<Array<{ token: string }>>;
  deleteMany?(args: { where: { tenantId: string; token: { in: string[] } } }): Promise<unknown>;
};

type PushLogger = {
  warn(entry: Record<string, unknown>): void;
};

/** Android channel created by the Flutter app; keep both sides in sync. */
export const ANDROID_PUSH_CHANNEL_ID = 'tms_updates';

/** FCM error codes that mean the token will never work again. */
const PERMANENT_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export function createPushNotificationService(dependencies: {
  tokenStore: TokenStore;
  provider: PushProvider | null;
  logger: PushLogger;
}) {
  async function deliver(
    tenantId: string,
    tokens: string[],
    message: PushMessage,
    logContext: Record<string, unknown>,
  ): Promise<PushResult> {
    if (tokens.length === 0) {
      return { success: true, sent: 0, failed: 0, skipped: true };
    }
    if (!dependencies.provider) {
      dependencies.logger.warn({
        event: 'PUSH_PROVIDER_UNCONFIGURED',
        tenantId,
        ...logContext,
        tokenCount: tokens.length,
      });
      return { success: true, sent: 0, failed: 0, skipped: true };
    }

    try {
      const result = await dependencies.provider.send(tokens, message);
      if (result.invalidTokens?.length && dependencies.tokenStore.deleteMany) {
        // Stale tokens are pruned so later sends do not keep paying for them.
        await dependencies.tokenStore
          .deleteMany({ where: { tenantId, token: { in: result.invalidTokens } } })
          .catch(() => undefined);
      }
      return {
        success: result.failureCount === 0,
        sent: result.successCount,
        failed: result.failureCount,
      };
    } catch (error) {
      dependencies.logger.warn({
        event: 'PUSH_DELIVERY_FAILED',
        tenantId,
        ...logContext,
        tokenCount: tokens.length,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, sent: 0, failed: tokens.length };
    }
  }

  return {
    async sendPush(
      tenantId: string,
      userId: string,
      title: string,
      body: string,
      data?: Record<string, string>,
    ): Promise<PushResult> {
      const records = await dependencies.tokenStore.findMany({
        where: { tenantId, userId },
        select: { token: true },
      });
      return deliver(
        tenantId,
        records.map((record) => record.token),
        { title, body, data },
        { userId },
      );
    },

    /**
     * Sends one message to every registered device of the given users with a
     * single token query, instead of one query and provider call per user.
     */
    async sendPushToUsers(
      tenantId: string,
      userIds: string[],
      title: string,
      body: string,
      data?: Record<string, string>,
    ): Promise<PushResult> {
      const unique = [...new Set(userIds)];
      if (unique.length === 0) {
        return { success: true, sent: 0, failed: 0, skipped: true };
      }
      const records = await dependencies.tokenStore.findMany({
        where: { tenantId, userId: { in: unique } },
        select: { token: true },
      });
      return deliver(
        tenantId,
        [...new Set(records.map((record) => record.token))],
        { title, body, data },
        { userCount: unique.length },
      );
    },
  };
}

export function createConfiguredFirebaseProvider(
  environment: NodeJS.ProcessEnv = process.env,
): PushProvider | null {
  const projectId = environment.FIREBASE_PROJECT_ID;
  const clientEmail = environment.FIREBASE_CLIENT_EMAIL;
  const privateKey = environment.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (
    !projectId ||
    !clientEmail ||
    !privateKey?.includes('PRIVATE KEY') ||
    !privateKey.includes('-----END')
  ) {
    return null;
  }

  try {
    const app = getApps()[0] ?? initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId,
    });
    const messaging = getMessaging(app);
    return {
      async send(tokens, message) {
        let successCount = 0;
        let failureCount = 0;
        const invalidTokens: string[] = [];
        for (let offset = 0; offset < tokens.length; offset += 500) {
          const batch = tokens.slice(offset, offset + 500);
          const result = await messaging.sendEachForMulticast({
            tokens: batch,
            notification: { title: message.title, body: message.body },
            data: message.data,
            // High priority + the app's channel so the alert shows as a
            // heads-up notification even when the app is backgrounded.
            android: {
              priority: 'high',
              notification: { channelId: ANDROID_PUSH_CHANNEL_ID, sound: 'default' },
            },
            apns: { payload: { aps: { sound: 'default' } } },
          });
          successCount += result.successCount;
          failureCount += result.failureCount;
          result.responses.forEach((response, index) => {
            const code = response.error?.code;
            if (code && PERMANENT_TOKEN_ERRORS.has(code)) invalidTokens.push(batch[index]);
          });
        }
        return { successCount, failureCount, invalidTokens };
      },
    };
  } catch (error) {
    console.warn(JSON.stringify({
      event: 'PUSH_PROVIDER_CONFIGURATION_INVALID',
      error: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

const service = createPushNotificationService({
  tokenStore: prisma.devicePushToken,
  provider: createConfiguredFirebaseProvider(),
  logger: { warn: (entry) => console.warn(JSON.stringify(entry)) },
});

export const PushNotificationService = service;
