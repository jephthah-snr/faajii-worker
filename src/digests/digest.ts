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

export function buildDigestTemplate(input: {
  type: DigestType;
  runId: string;
  publicUrl: string;
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
  const enriched = input.events.map((event) => ({
    ...event,
    ctaUrl: `${publicUrl}/${encodeURIComponent(event.identifier)}?${
      event.hasTickets ? "showTickets=true" : "rsvp=true"
    }&utm_source=email&utm_campaign=${encodeURIComponent(input.runId)}`,
  }));
  const cards = enriched
    .map(
      (event) =>
        `<td width="50%" valign="top" style="width:50%;padding:10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eeeeee;border-radius:12px;overflow:hidden;"><tr><td><img src="${esc(
          event.imageUrl
        )}" alt="${esc(
          event.name
        )}" width="260" style="display:block;width:100%;max-width:260px;height:220px;object-fit:cover;border:0;" /></td></tr><tr><td style="padding:10px 10px 4px;font:700 15px Arial;color:#111111;">${esc(
          event.name
        )}</td></tr><tr><td style="padding:0 10px 10px;font:12px/17px Arial;color:#555555;">${esc(
          event.location
        )}</td></tr><tr><td align="center" style="padding:4px 10px 14px;"><a href="${esc(
          event.ctaUrl
        )}" style="display:block;padding:11px 16px;background:#000;color:#fff;text-decoration:none;border-radius:24px;font:700 13px Arial;">${
          event.hasTickets ? "Get Ticket" : "RSVP Now"
        }</a></td></tr></table></td>`
    )
    .reduce<string[]>((rows, card, index) => {
      if (index % 2 === 0) rows.push(`<tr>${card}`);
      else rows[rows.length - 1] += `${card}</tr>`;
      return rows;
    }, [])
    .map((row) =>
      row.endsWith("</tr>") ? row : `${row}<td width="50%"></td></tr>`
    )
    .join("");
  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="email-padding" style="padding:42px 30px 16px;font-size:18px;color:#111111;">Hi {{ firstName }},</td></tr><tr><td class="email-padding" style="padding:16px 30px 24px;font-size:21px;line-height:29px;color:#111111;">${esc(
    headline
  )}</td></tr><tr><td align="center" style="padding:0 30px 26px;"><a href="${esc(
    publicUrl
  )}" style="display:inline-block;min-width:230px;padding:12px 22px;background:#000;color:#fff;text-decoration:none;border-radius:24px;font:700 13px Arial,sans-serif;">See More</a></td></tr><tr><td style="padding:0 20px 38px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}</table></td></tr></table>`;

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
      .join("\n")}`,
  };
}
