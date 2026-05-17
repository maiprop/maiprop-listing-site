const KAEK_PATTERN = /^\d{12}(\/\d{1,4}){0,2}$/;

export const KAEK_MAX_LENGTH = 22;

export const normalizeKaek = (raw: string) =>
  raw
    .replace(/[^\d/]/g, "")
    .replace(/\/{2,}/g, "/")
    .slice(0, KAEK_MAX_LENGTH);

export const isValidKaek = (value: string) => KAEK_PATTERN.test(normalizeKaek(value));

export const toFiresalePropertyType = (
  value: string,
): "apartment" | "house" | "villa" | "land" | "office" | "commercial" | null => {
  if (value === "apartment" || value === "house" || value === "villa" || value === "land" || value === "office") {
    return value;
  }
  if (value.startsWith("commercial_")) return "commercial";
  return null;
};
