import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/config/env.js', () => ({ config: { DRY_RUN: false, MAIL_API_TOKEN: 'test-token', MAIL_API_URL: 'https://mail.example', MAIL_FROM_ADDRESS: 'no-reply@example.com', MAIL_FROM_NAME: 'Faajii', HTTP_TIMEOUT_MS: 1000 } }));
vi.mock('../src/core/logger.js', () => ({ logger: { info: vi.fn() } }));
vi.mock('axios', () => ({ default: { post: vi.fn(async () => ({ data: { request_id: 'sent' } })) } }));
import axios from 'axios';
import { EmailProvider } from '../src/providers/email.provider.js';
import { NotificationMessage } from '../src/core/types.js';

const message = (withQr: boolean): NotificationMessage => ({
  schemaVersion: 1, deliveryId: 'delivery', runId: 'run', jobKey: 'event-reminder-1', channel: 'email',
  recipient: { id: '1', email: 'guest@example.com', templateData: { rsvpCode: 'PASS001' },
    ...(withQr ? { inlineImages: [{ cid: 'rsvp_qr_code', mimeType: 'image/png', contentBase64: 'cG5n' }] } : {}),
  },
  template: { subject: 'Reminder', html: '<img src="cid:rsvp_qr_code">{{ rsvpCode }}', text: '{{ rsvpCode }}' },
  scheduledAt: '', createdAt: '', attempt: 0,
});

describe('email inline delivery', () => {
  it('delivers the existing RSVP QR as a CID image', async () => {
    await new EmailProvider().send(message(true));
    expect(axios.post).toHaveBeenLastCalledWith('https://mail.example', expect.objectContaining({
      inline_images: [{ cid: 'rsvp_qr_code', mime_type: 'image/png', content: 'cG5n' }],
      htmlbody: '<img src="cid:rsvp_qr_code">PASS001', textbody: 'PASS001',
    }), expect.anything());
  });
  it('keeps emails without inline images compatible', async () => {
    await new EmailProvider().send(message(false));
    const body = vi.mocked(axios.post).mock.calls.at(-1)?.[1];
    expect(body).not.toHaveProperty('inline_images');
  });
});
