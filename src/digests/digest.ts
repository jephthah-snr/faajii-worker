import { DateTime } from "luxon";
import { DigestCandidate, DigestRunData } from "../core/types.js";
import { buildBaseEmailLayout } from "../templates/base-email.template.js";

export type DigestType = "monday" | "friday";

export function calculateDigestWindow(
  type: DigestType,
  scheduledInstant: Date,
  zone: string
) {
  const start = DateTime.fromJSDate(scheduledInstant, { zone: "utc" })
    .setZone(zone)
    .startOf("day");
  const end = start.plus({ days: type === "monday" ? 4 : 2 }).endOf("day");
  return {
    targetDate: start.toISODate()!,
    windowStart: start.toUTC().toISO()!,
    windowEnd: end.toUTC().toISO()!,
  };
}

export function curateDigestEvents(data: DigestRunData): DigestCandidate[] {
  const byId = new Map(data.candidates.map((event) => [event.id, event]));
  const slots: Array<DigestCandidate | undefined> = Array(8);
  for (const override of data.overrides) {
    const event = byId.get(override.eventId);
    if (event && override.position >= 1 && override.position <= 8)
      slots[override.position - 1] = event;
  }
  const used = new Set(slots.filter(Boolean).map((event) => event!.id));
  const automatic = data.candidates.filter((event) => !used.has(event.id));
  for (let index = 0; index < slots.length; index += 1)
    if (!slots[index]) slots[index] = automatic.shift();
  const result = slots.filter(Boolean) as DigestCandidate[];
  if (result.length < 6)
    throw new Error(
      `Digest requires at least six eligible events; got ${result.length} after curation from ${data.candidates.length} candidates and ${data.overrides.length} overrides`
    );
  return result;
}

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Collapse whitespace and truncate for a 2–3 line card blurb. */
export function truncateDescription(
  value: string | null | undefined,
  maxLength = 96
): string {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  const sliced = normalized.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  const cut = lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced;
  return `${cut}…`;
}

export function buildDigestTemplate(input: {
  type: DigestType;
  runId: string;
  publicUrl: string;
  /** RSVP web origin for event CTAs, e.g. https://faajii.rsvp */
  rsvpPublicUrl?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  subject?: string | null;
  headline?: string | null;
  events: DigestCandidate[];
}) {
  const subject =
    input.subject ||
    (input.type === "monday"
      ? "It’s Monday — discover what’s happening this week"
      : "Your weekend plans are here 🎉");
  const headline =
    input.headline ||
    (input.type === "monday"
      ? "It’s Monday. Unwind with Faajii."
      : "It’s the weekend. Here’s what we prepared for you.");
  const publicUrl = input.publicUrl.replace(/\/$/, "");
  const rsvpPublicUrl = (input.rsvpPublicUrl || publicUrl).replace(/\/$/, "");
  const exploreUrl = `${publicUrl}?utm_source=email&utm_campaign=${encodeURIComponent(
    input.runId
  )}&utm_content=explore_more`;
  const enriched = input.events.map((event) => {
    const slug = String(event.identifier || "")
      .trim()
      .replace(/^\/+|\/+$/g, "");
    const pathSlug = encodeURIComponent(slug);
    return {
      ...event,
      blurb: truncateDescription(event.description),
      // e.g. https://faajii.rsvp/byob
      ctaUrl: `${rsvpPublicUrl}/${pathSlug}?utm_source=email&utm_campaign=${encodeURIComponent(
        input.runId
      )}`,
    };
  });

  // Card image/content width 264px (+4px vs previous 260). CTA sits outside the bordered card.
  const cards = enriched
    .map((event) => {
      const ctaLabel = event.hasTickets ? "Get Ticket" : "RSVP Now";
      const blurb = event.blurb
        ? `<tr><td style="padding:0 12px 14px;font:12px/17px Arial,sans-serif;color:#555555;">${esc(
            event.blurb
          )}</td></tr>`
        : "";
      return `<td class="event-cell" width="50%" valign="top" style="width:50%;padding:10px 8px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:264px;margin:0 auto;"><tr><td style="border:1px solid #eeeeee;border-radius:12px;overflow:hidden;background:#ffffff;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><img src="${esc(
        event.imageUrl
      )}" alt="${esc(
        event.name
      )}" width="264" style="display:block;width:100%;max-width:264px;height:220px;object-fit:cover;border:0;" /></td></tr><tr><td style="padding:12px 12px 6px;font:700 15px/20px Arial,sans-serif;color:#111111;">${esc(
        event.name
      )}</td></tr>${blurb}</table></td></tr><tr><td align="center" style="padding:12px 0 0;"><a href="${esc(
        event.ctaUrl
      )}" style="display:inline-block;min-width:132px;padding:10px 22px;background:#000000;color:#ffffff;text-decoration:none;border-radius:999px;font:700 13px/16px Arial,sans-serif;text-align:center;">${ctaLabel}</a></td></tr></table></td>`;
    })
    .reduce<string[]>((rows, card, index) => {
      if (index % 2 === 0) rows.push(`<tr>${card}`);
      else rows[rows.length - 1] += `${card}</tr>`;
      return rows;
    }, [])
    .map((row) =>
      row.endsWith("</tr>") ? row : `${row}<td width="50%"></td></tr>`
    )
    .join("");

  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="email-padding" style="padding:42px 30px 16px;font:18px/26px Arial,sans-serif;color:#111111;">Hi {{ firstName }},</td></tr><tr><td class="email-padding" style="padding:0 30px 28px;font:21px/29px Arial,sans-serif;color:#111111;">${esc(
    headline
  )}</td></tr><tr><td style="padding:0 18px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}</table></td></tr><tr><td align="center" style="padding:8px 30px 40px;"><a href="${esc(
    exploreUrl
  )}" style="color:#2563eb;font:700 15px/20px Arial,sans-serif;text-decoration:underline;">Explore more</a></td></tr></table>`;

  return {
    subject,
    html: buildBaseEmailLayout({
      body,
      preheader: headline,
      appUrl: publicUrl,
      appStoreUrl: input.appStoreUrl,
      playStoreUrl: input.playStoreUrl,
      facebookUrl: input.facebookUrl,
      instagramUrl: input.instagramUrl,
      tiktokUrl: input.tiktokUrl,
    }),
    text: `${headline}\n\n${enriched
      .map((event) => `${event.name}: ${event.ctaUrl}`)
      .join("\n")}\n\nExplore more: ${exploreUrl}`,
  };
}
