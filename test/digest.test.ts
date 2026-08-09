import { describe, expect, it } from "vitest";
import {
  buildDigestTemplate,
  calculateDigestWindow,
  curateDigestEvents,
} from "../src/digests/digest.js";
import { DigestCandidate } from "../src/core/types.js";

const event = (id: number): DigestCandidate => ({
  id,
  eventId: `public-${id}`,
  identifier: `event-${id}`,
  name: `Event ${id}`,
  imageUrl: `https://images.test/${id}.jpg`,
  startDate: "2026-08-10T12:00:00.000Z",
  location: "Lagos",
  rsvpCount: 100 - id,
  hasTickets: id % 2 === 0,
});

describe("digest curation", () => {
  it("uses Monday through Friday in the configured timezone", () => {
    const window = calculateDigestWindow(
      "monday",
      new Date("2026-08-10T08:00:00.000Z"),
      "Africa/Lagos"
    );
    expect(window.targetDate).toBe("2026-08-10");
    expect(window.windowEnd).toBe("2026-08-14T22:59:59.999Z");
  });

  it("puts admin picks in their exact positions and fills gaps by ranking", () => {
    const result = curateDigestEvents({
      overrides: [{ eventId: 8, position: 1, isPinned: true }],
      candidates: Array.from({ length: 8 }, (_, index) => event(index + 1)),
    });
    expect(result.map((item) => item.id)).toEqual([8, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("wraps the digest body in the shared Faajii header and footer", () => {
    const template = buildDigestTemplate({
      type: "friday",
      runId: "friday-digest:test",
      publicUrl: "https://faajii.app",
      events: Array.from({ length: 6 }, (_, index) => event(index + 1)),
    });
    expect(template.html).toContain("faajii-bg-pattern.png");
    expect(template.html).toContain("Handle, plan, discover and share events");
    expect(template.html).toContain("Download on the App Store");
    expect(template.html).toContain("Faajii. All rights reserved.");
  });
});
