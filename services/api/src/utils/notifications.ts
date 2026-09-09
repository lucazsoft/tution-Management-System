import { ISmsSender } from '@tms/types';

export class MockSmsSender implements ISmsSender {
  private static sentLogs: { to: string; message: string; timestamp: Date }[] = [];

  async sendSms(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    console.log(`[SMS Gateway] Sending SMS to ${to}: "${message}"`);
    const messageId = `sms-id-${Math.floor(Math.random() * 1000000)}`;
    MockSmsSender.sentLogs.push({ to, message, timestamp: new Date() });
    return { success: true, messageId };
  }

  static getLogs() {
    return this.sentLogs;
  }

  static clearLogs() {
    this.sentLogs = [];
  }
}
