import { readFile } from "node:fs/promises";
import { join } from "node:path";
import axios from "axios";
import sharp from "sharp";
import * as opentype from "opentype.js";
import { DateTime } from "luxon";
import { PosterField, PosterTemplate } from "./poster-catalog.js";

export interface PosterEventData {
  eventName: string;
  eventType?: string;
  subtitle?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  eventLocationShort?: string;
  rsvpUrl?: string;
}

const fontFiles: Record<string, string> = {
  "Montserrat-Regular.ttf":
    require.resolve("@fontsource/montserrat/files/montserrat-latin-400-normal.woff"),
  "Montserrat-Medium.ttf":
    require.resolve("@fontsource/montserrat/files/montserrat-latin-500-normal.woff"),
  "Montserrat-SemiBold.ttf":
    require.resolve("@fontsource/montserrat/files/montserrat-latin-600-normal.woff"),
  "Montserrat-Bold.ttf":
    require.resolve("@fontsource/montserrat/files/montserrat-latin-700-normal.woff"),
  "PlayfairDisplay-Bold.ttf":
    require.resolve("@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff"),
  "Anton-Regular.ttf": join(__dirname, "fonts", "Anton-Regular.ttf"),
  "GreatVibes-Regular.ttf": join(__dirname, "fonts", "GreatVibes-Regular.ttf"),
  "DancingScript-Bold.ttf": join(__dirname, "fonts", "DancingScript-Bold.ttf"),
  "BebasNeue-Regular.ttf": join(__dirname, "fonts", "BebasNeue-Regular.ttf"),
  "BodoniModa-Variable.ttf": join(__dirname, "fonts", "BodoniModa-Variable.ttf"),
  "Caveat-Variable.ttf": join(__dirname, "fonts", "Caveat-Variable.ttf"),
  "Allura-Regular.ttf": join(__dirname, "fonts", "Allura-Regular.ttf"),
};

const vectorFontCache = new Map<string, Promise<opentype.Font>>();

function vectorFont(file?: string): Promise<opentype.Font> | undefined {
  if (!file || !fontFiles[file]?.toLowerCase().endsWith(".ttf")) return;
  let cached = vectorFontCache.get(file);
  if (!cached) {
    cached = readFile(fontFiles[file]).then((bytes) =>
      opentype.parse(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      ),
    );
    vectorFontCache.set(file, cached);
  }
  return cached;
}

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function valueFor(
  name: string,
  field: PosterField,
  event: PosterEventData,
): string {
  const source = field.source || name;
  let value = String(event[source as keyof PosterEventData] || "");
  if (!value && field.fallbackSource)
    value = String(event[field.fallbackSource as keyof PosterEventData] || "");
  if ((source === "date" || source === "time") && event.startDate) {
    const start = DateTime.fromISO(event.startDate).setZone("Africa/Lagos");
    const end = event.endDate
      ? DateTime.fromISO(event.endDate).setZone("Africa/Lagos")
      : null;
    if (start.isValid) {
      const format =
        field.format || (source === "date" ? "dd LLL yyyy" : "h:mm a");
      const normalizedFormat = format.replace(/MMM/g, "LLL");
      if (
        source === "date" &&
        end?.isValid &&
        end.toISODate() !== start.toISODate()
      ) {
        value = `${start.toFormat(normalizedFormat)} – ${end.toFormat(normalizedFormat)}`;
      } else {
        value = start.toFormat(source === "time" ? "h:mm a" : normalizedFormat);
      }
    }
  }
  if (field.textTransform === "uppercase") value = value.toUpperCase();
  if (field.textTransform === "lowercase") value = value.toLowerCase();
  return `${field.prefix || ""}${value}`;
}

function fitText(value: string, field: PosterField) {
  const width = field.width || 1;
  const maxLines = field.maxLines || 1;
  let size = field.fontSize || 30;
  const minimum = field.minimumFontSize || size;
  const words = value.replace(/\n/g, " \n ").split(/\s+/).filter(Boolean);
  const buildLines = (fontSize: number) => {
    const approxCharacters = Math.max(1, Math.floor(width / (fontSize * 0.56)));
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (word === "\\n" || word === "\n") {
        lines.push(line);
        line = "";
      } else if (!line || `${line} ${word}`.length <= approxCharacters) {
        line = line ? `${line} ${word}` : word;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  let lines = buildLines(size);
  while (field.autoShrink && lines.length > maxLines && size > minimum) {
    size -= 2;
    lines = buildLines(size);
  }
  return { size, lines: lines.slice(0, maxLines) };
}

async function fontCss(template: PosterTemplate): Promise<string> {
  const requested = new Set(
    Object.values(template.fields)
      .filter((field) => field.enabled && field.fontFile)
      .map((field) => field.fontFile!),
  );
  const rules = await Promise.all(
    [...requested].map(async (file) => {
      const path = fontFiles[file];
      if (!path) return "";
      const bytes = await readFile(path);
      const family =
        Object.values(template.fields).find((field) => field.fontFile === file)
          ?.fontFamily || "Arial";
      const format = file.toLowerCase().endsWith(".ttf") ? "truetype" : "woff";
      const mime = format === "truetype" ? "font/ttf" : "font/woff";
      return `@font-face{font-family:'${family}';src:url(data:${mime};base64,${bytes.toString("base64")}) format('${format}');}`;
    }),
  );
  return rules.join("");
}

async function overlaySvg(template: PosterTemplate, event: PosterEventData) {
  const nodes: string[] = [];
  for (const [name, field] of Object.entries(template.fields)) {
    if (!field.enabled) continue;
    const value = valueFor(name, field, event);
    if (!value) continue;
    const { size, lines } = fitText(value, field);
    const x = field.x || 0;
    const y = field.y || 0;
    const width = field.width || template.canvas.width;
    const lineHeight = field.lineHeight || Math.round(size * 1.15);
    const anchor =
      field.alignment === "center"
        ? "middle"
        : field.alignment === "right"
          ? "end"
          : "start";
    const textX =
      field.alignment === "center"
        ? x + width / 2
        : field.alignment === "right"
          ? x + width
          : x;
    const totalHeight = lines.length * lineHeight;
    const offset =
      field.verticalAlignment === "middle"
        ? ((field.height || totalHeight) - totalHeight) / 2
        : field.verticalAlignment === "bottom"
          ? (field.height || totalHeight) - totalHeight
          : 0;
    const shadow = field.textShadow;
    const filter = shadow ? `filter="url(#shadow-${name})"` : "";
    if (shadow)
      nodes.push(
        `<filter id="shadow-${name}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="${shadow.offsetX}" dy="${shadow.offsetY}" stdDeviation="${shadow.blur / 2}" flood-color="${shadow.color}" flood-opacity="${shadow.opacity}"/></filter>`,
      );
    const font = await vectorFont(field.fontFile);
    if (font) {
      const vectorLetterSpacing = (field.letterSpacing || 0) / size;
      lines.forEach((line, index) => {
        const lineWidth = font.getAdvanceWidth(line, size, {
          letterSpacing: vectorLetterSpacing,
        });
        const pathX =
          field.alignment === "center"
            ? textX - lineWidth / 2
            : field.alignment === "right"
              ? textX - lineWidth
              : textX;
        const path = font.getPath(
          line,
          pathX,
          y + offset + size + index * lineHeight,
          size,
          { letterSpacing: vectorLetterSpacing },
        );
        const syntheticWeight = Math.max(
          0,
          ((field.fontWeight || 400) - 400) / 180,
        );
        nodes.push(
          `<path d="${path.toPathData(2)}" fill="${field.color || "#FFFFFF"}"${syntheticWeight > 0 ? ` stroke="${field.color || "#FFFFFF"}" stroke-width="${syntheticWeight}" stroke-linejoin="round" paint-order="stroke fill"` : ""} ${filter}/>`
        );
      });
    } else {
      nodes.push(
        `<text x="${textX}" y="${y + offset + size}" text-anchor="${anchor}" font-family="${esc(field.fontFamily || "Arial")}" font-size="${size}" font-weight="${field.fontWeight || 400}" letter-spacing="${field.letterSpacing || 0}" fill="${field.color || "#FFFFFF"}" ${filter}>${lines.map((line, index) => `<tspan x="${textX}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`).join("")}</text>`,
      );
    }
  }
  const overlay = template.overlay.enabled
    ? `<rect width="100%" height="100%" fill="${template.overlay.color}" opacity="${template.overlay.opacity}"/>`
    : "";
  return Buffer.from(
    `<svg width="${template.canvas.width}" height="${template.canvas.height}" xmlns="http://www.w3.org/2000/svg"><style>${await fontCss(template)}</style><defs>${nodes.filter((node) => node.startsWith("<filter")).join("")}</defs>${overlay}${nodes.filter((node) => !node.startsWith("<filter")).join("")}</svg>`,
  );
}

export async function renderPoster(
  template: PosterTemplate,
  event: PosterEventData,
  preview = false,
) {
  const response = await axios.get<ArrayBuffer>(template.backgroundUrl, {
    responseType: "arraybuffer",
    timeout: 20_000,
    maxContentLength: 15 * 1024 * 1024,
  });
  const width = preview ? 432 : template.canvas.width;
  const height = preview ? 540 : template.canvas.height;
  const background = await sharp(Buffer.from(response.data))
    .resize(template.canvas.width, template.canvas.height, {
      fit: template.background.fit,
      position: template.background.position,
    })
    .toBuffer();
  const fullSizePoster = await sharp(background)
    .composite([{ input: await overlaySvg(template, event), top: 0, left: 0 }])
    .png()
    .toBuffer();
  const composed = sharp(fullSizePoster).resize(width, height);
  return template.canvas.format === "jpeg"
    ? composed.jpeg({ quality: template.canvas.quality }).toBuffer()
    : composed.png({ quality: template.canvas.quality }).toBuffer();
}
