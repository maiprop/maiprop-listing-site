const LEADING_BOM = /^\uFEFF/;

export const cleanEnvValue = (value: string | undefined): string =>
  (value ?? "").replace(LEADING_BOM, "").trim();

export const readCleanEnv = (...keys: string[]): string => {
  for (const key of keys) {
    const value = cleanEnvValue(process.env[key]);
    if (value) return value;
  }
  return "";
};
