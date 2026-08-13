import templates from "./templates.json";

export type PosterField = {
  enabled: boolean;
  source?: string;
  fallbackSource?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontFamily?: string;
  fontFile?: string;
  fontSize?: number;
  minimumFontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
  lineHeight?: number;
  color?: string;
  textTransform?: "uppercase" | "lowercase";
  alignment?: "left" | "center" | "right";
  verticalAlignment?: "top" | "middle" | "bottom";
  maxLines?: number;
  autoShrink?: boolean;
  format?: string;
  prefix?: string;
  example?: string;
  textShadow?: {
    color: string;
    opacity: number;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
};

export type PosterTemplate = {
  id: string;
  name: string;
  category: string;
  type: "category" | "default";
  backgroundUrl: string;
  enabled: boolean;
  sortOrder: number;
  canvas: {
    width: number;
    height: number;
    format: "png" | "jpeg";
    quality: number;
  };
  background: {
    fit: "cover" | "contain";
    position: string;
    preserveAspectRatio: boolean;
  };
  overlay: { enabled: boolean; color: string; opacity: number };
  fields: Record<string, PosterField>;
};

const catalog = templates as unknown as PosterTemplate[];

export function listPosterTemplates(category?: string): PosterTemplate[] {
  const enabled = catalog.filter((template) => template.enabled);
  if (!category) return enabled.sort((a, b) => a.sortOrder - b.sortOrder);

  const normalizedCategory = category.trim().toLowerCase();
  const defaults = enabled.filter((template) => template.type === "default");
  if (normalizedCategory === "default") {
    return defaults.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const exactMatches = enabled.filter(
    (template) => template.category.toLowerCase() === normalizedCategory,
  );
  const selected = [...exactMatches, ...defaults].filter(
    (template, index, templates) =>
      templates.findIndex((candidate) => candidate.id === template.id) === index,
  );

  return selected.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getPosterTemplate(id: string): PosterTemplate | undefined {
  return catalog.find((template) => template.enabled && template.id === id);
}
