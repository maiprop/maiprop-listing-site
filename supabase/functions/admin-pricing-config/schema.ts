import { z } from "npm:zod@4.4.3";

const requiredString = (label: string, maxLength: number) =>
  z.string()
    .trim()
    .min(1, `Invalid ${label}`)
    .max(maxLength, `Invalid ${label}`);

const optionalString = (label: string, maxLength: number) =>
  z.preprocess(
    (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    },
    z.string().max(maxLength, `Invalid ${label}`).nullable(),
  );

const rowIdSchema = (label: string) =>
  z.string().trim().min(1, `Invalid ${label}`).max(120, `Invalid ${label}`);

const optionalDateTime = (label: string) =>
  z.preprocess(
    (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    },
    z.string().max(80, `Invalid ${label}`).nullable(),
  );

export const pricingConfigRowSchema = z.object({
  id: rowIdSchema("pricing config id"),
  key: requiredString("pricing key", 120),
  label: requiredString("pricing label", 180),
  description: optionalString("pricing description", 1000).optional(),
  audience: requiredString("pricing audience", 80),
  module: requiredString("pricing module", 120),
  unit: requiredString("pricing unit", 80),
  currency: requiredString("pricing currency", 12),
  amount: z.number().finite("Invalid pricing amount").min(0, "Invalid pricing amount").max(1_000_000, "Invalid pricing amount"),
  is_active: z.boolean(),
  sort_order: z.number().int("Invalid pricing sort order").min(0, "Invalid pricing sort order").max(10_000, "Invalid pricing sort order"),
  metadata: z.record(z.string(), z.unknown()).nullable().optional().default({}),
  created_at: optionalDateTime("pricing created date").optional(),
  updated_at: optionalDateTime("pricing updated date").optional(),
}).strict();

export const pricingConfigRowsSchema = z.array(pricingConfigRowSchema)
  .min(1, "Invalid pricing configuration")
  .max(500, "Invalid pricing configuration");

export const adminPricingActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upsert"),
    rows: pricingConfigRowsSchema,
  }).strict(),
  z.object({
    action: z.literal("delete"),
    id: rowIdSchema("pricing config id"),
  }).strict(),
]);

export type AdminPricingAction = z.infer<typeof adminPricingActionSchema>;
