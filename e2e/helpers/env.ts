export const cleanEnvValue = (value: string | undefined): string =>
  (value ?? "").trim().replace(/^\uFEFF/, "").trim();
