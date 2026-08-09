import { describe, expect, it } from "vitest";
import {
  buildDigestTemplate,
  calculateDigestWindow,
  curateDigestEvents,
  truncateDescription,
} from "../src/digests/digest.js";
import { DigestCandidate } from "../src/core/types.js";

const event = (
  id: number,
  overrides: Partial<DigestCandidate> = {}
): DigestCandidate => ({
  id,
  eventId: `public-${id}`,
  identifier: `event-${id}`,
  name: `Event ${id}`,
  description:
    "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text.",
  imageUrl: `https://images.test/${id}.jpg`,
  startDate: "2026-08-10T12:00:00.000Z",
  location: "Lagos",
  rsvpCount: 100 - id,
  hasTickets: id % 2 === 0,
  ...overrides,
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

  it("places CTAs outside cards, uses truncated descriptions, and links Explore more", () => {
    const template = buildDigestTemplate({
      type: "friday",
      runId: "friday-digest:test",
      publicUrl: "https://faajii.app",
      rsvpPublicUrl: "https://faajii.rsvp",
      events: Array.from({ length: 6 }, (_, index) => event(index + 1)),
    });
    expect(template.html).not.toContain(">See More</a>");
    expect(template.html).not.toContain("showTickets=");
    expect(template.html).not.toContain("rsvp=true");
    expect(template.html).toContain("max-width:264px");
    expect(template.html).toContain("border-radius:999px");
    expect(template.html).toContain(">Get Ticket</a>");
    expect(template.html).toContain(">RSVP Now</a>");
    expect(template.html).toContain("Explore more");
    expect(template.html).toContain(
      "https://faajii.app?utm_source=email&amp;utm_campaign=friday-digest%3Atest&amp;utm_content=explore_more"
    );
    expect(template.html).toContain(
      "https://faajii.rsvp/event-1?utm_source=email&amp;utm_campaign=friday-digest%3Atest"
    );
    expect(template.html).toContain(
      "https://faajii.rsvp/event-2?utm_source=email&amp;utm_campaign=friday-digest%3Atest"
    );
    expect(template.html).toContain("Lorem Ipsum is simply dummy text");
    // CTA sits in a row after the bordered card closes.
    expect(template.html).toContain(
      '</table></td></tr><tr><td align="center" style="padding:12px 0 0;"><a href='
    );
    // Location must not be used as the card blurb when description exists.
    expect(template.html).not.toContain(">Lagos</td>");
  });

  it("truncates descriptions on a word boundary and omits empty blurbs", () => {
    expect(truncateDescription("Short copy")).toBe("Short copy");
    expect(
      truncateDescription(
        "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text."
      )
    ).toMatch(/…$/);
    expect(truncateDescription("   ")).toBe("");

    const template = buildDigestTemplate({
      type: "monday",
      runId: "monday-digest:test",
      publicUrl: "https://faajii.app",
      rsvpPublicUrl: "https://faajii.rsvp/",
      events: Array.from({ length: 6 }, (_, index) =>
        event(index + 1, {
          identifier: index === 0 ? "/byob/" : `event-${index + 1}`,
          description: index === 0 ? null : event(index + 1).description,
          hasTickets: index === 0,
        })
      ),
    });
    expect(template.html).toContain(
      "https://faajii.rsvp/byob?utm_source=email&amp;utm_campaign=monday-digest%3Atest"
    );
    // First card has no description → no blurb row with empty padding cell after title alone is ok;
    // ensure we do not render location as a substitute.
    expect(template.html).not.toContain(">Lagos</td>");
  });
});
