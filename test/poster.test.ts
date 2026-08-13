import { describe, expect, it } from "vitest";
import {
  getPosterTemplate,
  listPosterTemplates,
} from "../src/posters/poster-catalog.js";

describe("poster template catalog", () => {
  it("returns enabled birthday templates in configured order", () => {
    expect(listPosterTemplates()).toHaveLength(9);
    const templates = listPosterTemplates("birthday");
    expect(templates.map((template) => template.id)).toEqual([
      "birthday-vortex-01",
      "birthday-balloon-red-01",
      "birthday-purple-balloons-01",
      "launch-party-orange-01",
      "clara-turns-30-01",
      "pink-bar-birthday-01",
      "tiger-fiesta-01",
    ]);
  });

  it("appends global defaults after exact category matches", () => {
    expect(listPosterTemplates("music").map((template) => template.id)).toEqual([
      "music-neon-pop-01",
      "launch-party-orange-01",
      "clara-turns-30-01",
      "pink-bar-birthday-01",
      "tiger-fiesta-01",
    ]);
    expect(listPosterTemplates("wedding").map((template) => template.id)).toEqual([
      "launch-party-orange-01",
      "clara-turns-30-01",
      "pink-bar-birthday-01",
      "tiger-fiesta-01",
    ]);
    expect(listPosterTemplates("wedding").every((template) => template.type === "default")).toBe(true);
  });

  it("preserves the supplied typography and safe-area configuration", () => {
    const template = getPosterTemplate("birthday-vortex-01");
    expect(template?.canvas).toMatchObject({ width: 1080, height: 1350 });
    expect(template?.fields.eventName).toMatchObject({
      fontFamily: "Great Vibes",
      fontSize: 152,
      minimumFontSize: 76,
      maxLines: 2,
      autoShrink: true,
    });
    expect(template?.fields.date?.enabled).toBe(true);
    expect(template?.fields.time?.enabled).toBe(true);
    expect(template?.fields.location?.enabled).toBe(true);
    expect(template?.fields.rsvpUrl?.enabled).toBe(true);
    expect(template?.fields.eventType?.enabled).toBe(false);
  });

  it("keeps birthday typography and field layouts template-specific", () => {
    const vortex = getPosterTemplate("birthday-vortex-01")!;
    const red = getPosterTemplate("birthday-balloon-red-01")!;
    const purple = getPosterTemplate("birthday-purple-balloons-01")!;
    expect(vortex.fields.eventName?.fontFile).toBe("GreatVibes-Regular.ttf");
    expect(red.fields.eventName?.fontFile).toBe("Montserrat-Bold.ttf");
    expect(purple.fields.eventName?.fontFile).toBe("Anton-Regular.ttf");
    expect(red.fields.eventType?.enabled).toBe(false);
    expect(purple.fields.eventType?.enabled).toBe(false);
    expect(purple.fields.eventName?.width).toBe(920);
    expect(purple.fields.eventName?.maxLines).toBe(3);
    expect(new Set([vortex.fields.eventName?.y, red.fields.eventName?.y, purple.fields.eventName?.y]).size).toBe(3);
    for (const template of [vortex, red, purple]) {
      for (const field of Object.values(template.fields)) {
        if (!field.enabled) continue;
        expect((field.x || 0) + (field.width || 0)).toBeLessThanOrEqual(template.canvas.width);
        expect(field.y || 0).toBeLessThan(template.canvas.height - 60);
      }
    }
  });
});
