export type Channel = 'email' | 'sms';

export interface Recipient {
  id: string;
  email?: string;
  phone?: string;
  locale?: string;
  timezone?: string;
  templateData: Record<string, unknown>;
}

export interface NotificationMessage {
  schemaVersion: 1;
  deliveryId: string;
  runId: string;
  jobKey: string;
  channel: Channel;
  recipient: Recipient;
  template: { subject?: string; html?: string; text: string };
  scheduledAt: string;
  attempt: number;
  createdAt: string;
}

export interface RecipientPage {
  recipients: Recipient[];
  nextCursor?: string | null;
  template: { subject?: string; html?: string; text: string };
}
