import { describe, expect, it } from "vitest";
import {
  getPosterTemplate,
  listPosterTemplates,
} from "../src/posters/poster-catalog.js";

describe("poster template catalog", () => {
  it("returns enabled birthday templates in configured order", () => {
    expect(listPosterTemplates()).toHaveLength(5);
    const templates = listPosterTemplates("birthday");
    expect(templates.map((template) => template.id)).toEqual([
      "birthday-vortex-01",
      "birthday-balloon-red-01",
      "birthday-purple-balloons-01",
    ]);
  });

  it("preserves the supplied typography and safe-area configuration", () => {
    const template = getPosterTemplate("birthday-vortex-01");
    expect(template?.canvas).toMatchObject({ width: 1080, height: 1350 });
    expect(template?.fields.eventName).toMatchObject({
      fontFamily: "Great Vibes",
      fontSize: 116,
      minimumFontSize: 58,
      maxLines: 2,
      autoShrink: true,
    });
    expect(template?.fields.date?.enabled).toBe(true);
    expect(template?.fields.time?.enabled).toBe(true);
    expect(template?.fields.location?.enabled).toBe(true);
    expect(template?.fields.rsvpUrl?.enabled).toBe(true);
  });

  it("keeps birthday typography and field layouts template-specific", () => {
    const vortex = getPosterTemplate("birthday-vortex-01")!;
    const red = getPosterTemplate("birthday-balloon-red-01")!;
    const purple = getPosterTemplate("birthday-purple-balloons-01")!;
    expect(vortex.fields.eventName?.fontFile).toBe("GreatVibes-Regular.ttf");
    expect(red.fields.eventName?.fontFile).toBe("Montserrat-Bold.ttf");
    expect(purple.fields.eventName?.fontFile).toBe("Anton-Regular.ttf");
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
