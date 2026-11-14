import { ISmsSender } from '@tms/types';

const AAKASH_SMS_ENDPOINT = 'https://sms.aakashsms.com/sms/v3/send';

type AakashSmsResponse = {
  error?: boolean | string | number;
  status?: string | number;
  message?: string;
  message_id?: string | number;
  messageId?: string | number;
  id?: string | number;
  data?: {
    valid?: Array<{ id?: string | number; mobile?: string; status?: string }>;
    invalid?: Array<{ mobile?: string; status?: string }>;
  } | unknown[];
  [key: string]: unknown;
};

// Kept in its own dependency-free module so code that only needs the
// normaliser does not load (or get stubbed together with) the SMS sender.
import { normaliseAakashPhoneNumber } from './phone';
export { normaliseAakashPhoneNumber };

function maskPhoneNumber(value: string): string {
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

// Concrete Adapter for Mock SMS gateway (used in development and testing)
export class MockSmsSender implements ISmsSender {
  async sendSms(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    console.log(`[SMS Gateway SIMULATION] To: ${to} | Content: "${message}"`);
    return {
      success: true,
      messageId: 'mock-sms-' + Math.random().toString(36).substr(2, 9),
    };
  }
}

// Explicit production-safe no-delivery adapter. It never reports a simulated
// message as delivered.
export class DisabledSmsSender implements ISmsSender {
  async sendSms(): Promise<{ success: boolean; error: string }> {
    return { success: false, error: 'SMS delivery is disabled.' };
  }
}

// Concrete adapter for Aakash SMS API v3.
// Docs: POST/GET https://sms.aakashsms.com/sms/v3/send
// Parameters: auth_token, to, text
export class AakashSmsSender implements ISmsSender {
  constructor(private readonly authToken: string) {}

  async sendSms(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const recipient = normaliseAakashPhoneNumber(to);

    if (!/^\d{10}$/.test(recipient)) {
      return { success: false, error: 'A valid Nepali mobile number is required.' };
    }
    if (!message.trim()) {
      return { success: false, error: 'SMS text cannot be empty.' };
    }

    try {
      const response = await fetch(AAKASH_SMS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ auth_token: this.authToken, to: recipient, text: message }).toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const rawBody = await response.text();
      let body: AakashSmsResponse | undefined;

      try {
        body = JSON.parse(rawBody) as AakashSmsResponse;
      } catch {
        // Aakash may return a non-JSON gateway error. Keep it out of logs and
        // return a safe, actionable failure to the caller.
      }

      const apiError = body?.error === true || body?.error === 'true' || body?.error === 1;
      const deliveryData = body?.data && !Array.isArray(body.data) ? body.data : undefined;
      const acceptedMessage = deliveryData?.valid?.[0];
      const rejectedRecipient = Boolean(deliveryData?.invalid?.length) && !acceptedMessage;
      if (!response.ok || apiError || rejectedRecipient) {
        return {
          success: false,
          error: rejectedRecipient
            ? 'Aakash SMS rejected the recipient number.'
            : body?.message || `Aakash SMS request failed (${response.status}).`,
        };
      }

      const messageId = acceptedMessage?.id ?? body?.message_id ?? body?.messageId ?? body?.id;
      console.info(`[Aakash SMS] Message accepted for ${maskPhoneNumber(recipient)}`);
      return { success: true, messageId: messageId == null ? undefined : String(messageId) };
    } catch (error) {
      console.error('[Aakash SMS] Request failed:', error instanceof Error ? error.message : 'Unknown error');
      return { success: false, error: 'Unable to reach Aakash SMS. Please try again.' };
    }
  }
}

// Factory to resolve the SMS Sender based on environment configuration
export function getSmsSender(): ISmsSender {
  const provider = (process.env.SMS_PROVIDER || 'MOCK').toUpperCase();
  const token = process.env.AAKASH_SMS_AUTH_TOKEN || '';

  if (provider === 'AAKASH') {
    if (!token) {
      console.error('[Aakash SMS] AAKASH_SMS_AUTH_TOKEN is not configured; SMS delivery is disabled.');
      return new DisabledSmsSender();
    }
    return new AakashSmsSender(token);
  }

  if (provider === 'DISABLED') return new DisabledSmsSender();

  return new MockSmsSender();
}

const smsSender = getSmsSender();
export default smsSender;
