export type Channel = "email" | "sms";

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

export interface DigestCandidate {
  id: number;
  eventId: string;
  identifier: string;
  name: string;
  description?: string | null;
  imageUrl: string;
  startDate: string;
  location: string;
  rsvpCount: number;
  hasTickets: boolean;
}

export interface DigestRunData {
  subject?: string | null;
  headline?: string | null;
  overrides: Array<{ eventId: number; position: number; isPinned: boolean }>;
  candidates: DigestCandidate[];
}
