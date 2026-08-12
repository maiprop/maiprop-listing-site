import { expectTypeOf, test } from "vitest";
import type { Database } from "../integrations/supabase/types";

type CatalogueRow =
  Database["public"]["Functions"]["query_public_catalogue"]["Returns"][number];

test("generated catalogue RPC fields preserve database nullability", () => {
  const nullableFields: Pick<CatalogueRow, "ai_score" | "open_house_date"> = {
    ai_score: null,
    open_house_date: null,
  };

  expectTypeOf(nullableFields.ai_score).toEqualTypeOf<number | null>();
  expectTypeOf(nullableFields.open_house_date).toEqualTypeOf<string | null>();
});
