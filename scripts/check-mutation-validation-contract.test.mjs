import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkMutationValidationContract } from "./check-mutation-validation-contract.mjs";

const makeFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "maiprop-mutation-validation-"));
  mkdirSync(join(root, "src", "hooks"), { recursive: true });
  mkdirSync(join(root, "src", "lib"), { recursive: true });
  mkdirSync(join(root, "supabase", "functions", "_shared"), { recursive: true });
  mkdirSync(join(root, "supabase", "functions", "open-house-registration"), { recursive: true });

  writeFileSync(
    join(root, "src", "lib", "mutationSchemas.ts"),
    [
      "import { z } from \"zod\";",
      "export function parseMutationInput() {}",
      "export const savedSearchCreateSchema = {};",
      "export const contactSubmissionInputSchema = {};",
      "export const favoriteToggleSchema = {};",
      "export const leadCreateSchema = {};",
      "export const contactCreateSchema = {};",
      "export const listingWriteSchema = {};",
      "export const pricingConfigRowsSchema = {};",
      "export const aiSearchBodySchema = {};",
      "export const adminFiresaleActionBodySchema = {};",
      "export const agentDataInputActionBodySchema = {};",
      "export const submitFiresaleInterestBodySchema = {};",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "src", "hooks", "useSavedSearches.ts"),
    [
      "parseMutationInput(savedSearchCreateSchema, input, 'saved search');",
      "parseMutationInput(savedSearchIdSchema, id, 'saved search id');",
      "parseMutationInput(savedSearchAlertToggleSchema, input, 'saved search alert');",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "src", "hooks", "useContactSubmissions.ts"),
    "parseMutationInput(contactSubmissionInputSchema, input, 'contact submission');\n",
  );
  writeFileSync(
    join(root, "supabase", "functions", "_shared", "schema.ts"),
    "import { z } from 'npm:zod'; export class SchemaValidationError extends Error {} export async function parseJsonBody() {}\n",
  );
  writeFileSync(
    join(root, "supabase", "functions", "open-house-registration", "index.ts"),
    "const registrationRequestSchema = z.object({}); await parseJsonBody(req, registrationRequestSchema);\n",
  );
  return root;
};

describe("mutation validation contract", () => {
  it("accepts a fixture with schema-first browser and edge mutation validation", () => {
    const result = checkMutationValidationContract(makeFixture());

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when mutation entry points skip schema parsing", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "src", "hooks", "useSavedSearches.ts"),
      "useMutation(() => supabase.from('saved_searches').insert(input));\n",
    );
    writeFileSync(
      join(root, "supabase", "functions", "open-house-registration", "index.ts"),
      "const body = await req.json();\n",
    );

    const result = checkMutationValidationContract(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("src/hooks/useSavedSearches.ts");
    expect(result.failures.join("\n")).toContain("React Query mutation");
    expect(result.failures.join("\n")).toContain("supabase/functions/open-house-registration/index.ts");
  });
});
