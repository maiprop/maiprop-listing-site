import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  invalidatePublicCatalogueQueries,
  PUBLIC_CATALOGUE_QUERY_KEYS,
} from "@/lib/publicCatalogueQueryInvalidation";

describe("public catalogue query invalidation", () => {
  it("invalidates every public catalogue surface and the changed detail row", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

    await invalidatePublicCatalogueQueries(queryClient, "listing-123");

    expect(PUBLIC_CATALOGUE_QUERY_KEYS).toEqual(expect.arrayContaining([
      ["listings"],
      ["listings-paginated"],
      ["homepage-featured"],
      ["homepage-open-houses"],
      ["auction-listings"],
      ["new-build-listing"],
      ["open-houses"],
    ]));
    for (const queryKey of PUBLIC_CATALOGUE_QUERY_KEYS) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey });
    }
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["listing", "listing-123"],
    });
  });

  it("does not create a malformed detail invalidation when no id is available", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

    await invalidatePublicCatalogueQueries(queryClient);

    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ["listing", undefined],
    });
  });
});
