export interface PushDeliveryResult {
  success: boolean;
  notificationId?: string;
  error?: string;
}

export interface PushSender {
  sendPush(userId: string, title: string, body: string): Promise<PushDeliveryResult>;
}

class DisabledPushSender implements PushSender {
  async sendPush(): Promise<PushDeliveryResult> {
    return { success: false, error: 'Push delivery is disabled.' };
  }
}

class DevelopmentPushSender implements PushSender {
  async sendPush(userId: string, title: string, body: string): Promise<PushDeliveryResult> {
    console.info(`[Push simulation] user=${userId} title=${JSON.stringify(title)} body=${JSON.stringify(body)}`);
    return { success: true, notificationId: `dev-push-${Date.now()}` };
  }
}

class WebhookPushSender implements PushSender {
  constructor(private readonly endpoint: string, private readonly token: string) {}

  async sendPush(userId: string, title: string, body: string): Promise<PushDeliveryResult> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ userId, title, body }),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json().catch(() => ({})) as { id?: string; notificationId?: string; error?: string };
      if (!response.ok) return { success: false, error: payload.error || `Push gateway rejected the request (${response.status}).` };
      return { success: true, notificationId: payload.notificationId ?? payload.id };
    } catch {
      return { success: false, error: 'Unable to reach the push gateway.' };
    }
  }
}

export function getPushSender(): PushSender {
  const provider = (process.env.PUSH_PROVIDER || (process.env.NODE_ENV === 'production' ? 'DISABLED' : 'DEVELOPMENT')).toUpperCase();
  if (provider === 'WEBHOOK') {
    const endpoint = process.env.PUSH_WEBHOOK_URL?.trim() || '';
    const token = process.env.PUSH_WEBHOOK_TOKEN?.trim() || '';
    if (!endpoint || !token) return new DisabledPushSender();
    return new WebhookPushSender(endpoint, token);
  }
  if (provider === 'DEVELOPMENT' && process.env.NODE_ENV !== 'production') return new DevelopmentPushSender();
  return new DisabledPushSender();
}
