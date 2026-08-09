import { describe, expect, it } from 'vitest';
import { createDeliveryId, createRunId } from '../src/core/identity.js';

describe('deterministic identities', () => {
  it('creates the same run for the same scheduled minute', () => {
    expect(createRunId('digest', new Date('2026-08-01T08:00:05Z'))).toBe(createRunId('digest', new Date('2026-08-01T08:00:55Z')));
  });
  it('creates stable, channel-specific delivery IDs', () => {
    const first = createDeliveryId('digest:2026-08-01T08:00', '42', 'email');
    expect(first).toBe(createDeliveryId('digest:2026-08-01T08:00', '42', 'email'));
    expect(first).not.toBe(createDeliveryId('digest:2026-08-01T08:00', '42', 'sms'));
  });
});
