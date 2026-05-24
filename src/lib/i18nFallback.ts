import type { TFunction } from "i18next";

export function tFallback(t: TFunction, key: string, fallback: string): string {
  const value = t(key);
  const leaf = key.split(".").at(-1);
  return value === key || value === leaf ? fallback : value;
}

export function interpolate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), String(value)),
    template,
  );
}

export function tInterpolate(
  t: TFunction,
  key: string,
  fallback: string,
  values: Record<string, string | number>,
): string {
  return interpolate(tFallback(t, key, fallback), values);
}
