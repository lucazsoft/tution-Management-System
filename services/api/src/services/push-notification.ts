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
  }>;
}

type TokenStore = {
  findMany(args: {
    where: { tenantId: string; userId: string };
    select: { token: true };
  }): Promise<Array<{ token: string }>>;
};

type PushLogger = {
  warn(entry: Record<string, unknown>): void;
};

export function createPushNotificationService(dependencies: {
  tokenStore: TokenStore;
  provider: PushProvider | null;
  logger: PushLogger;
}) {
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
      if (records.length === 0) {
        return { success: true, sent: 0, failed: 0, skipped: true };
      }
      if (!dependencies.provider) {
        dependencies.logger.warn({
          event: 'PUSH_PROVIDER_UNCONFIGURED',
          tenantId,
          userId,
          tokenCount: records.length,
        });
        return { success: true, sent: 0, failed: 0, skipped: true };
      }

      try {
        const result = await dependencies.provider.send(
          records.map((record) => record.token),
          { title, body, data },
        );
        return {
          success: result.failureCount === 0,
          sent: result.successCount,
          failed: result.failureCount,
        };
      } catch (error) {
        dependencies.logger.warn({
          event: 'PUSH_DELIVERY_FAILED',
          tenantId,
          userId,
          tokenCount: records.length,
          error: error instanceof Error ? error.message : String(error),
        });
        return { success: false, sent: 0, failed: records.length };
      }
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
        for (let offset = 0; offset < tokens.length; offset += 500) {
          const result = await messaging.sendEachForMulticast({
            tokens: tokens.slice(offset, offset + 500),
            notification: { title: message.title, body: message.body },
            data: message.data,
          });
          successCount += result.successCount;
          failureCount += result.failureCount;
        }
        return { successCount, failureCount };
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
