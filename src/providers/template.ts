export function renderTemplate(value: string | undefined, data: Record<string, unknown>): string | undefined {
  if (value === undefined) return undefined;
  return value.replace(/{{\s*([\w.]+)\s*}}/g, (_match, path: string) => {
    const result = path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, data);
    return result === undefined || result === null ? '' : String(result);
  });
}
