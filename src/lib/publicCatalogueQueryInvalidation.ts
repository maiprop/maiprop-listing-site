import type { QueryClient, QueryKey } from "@tanstack/react-query";

export const PUBLIC_CATALOGUE_QUERY_KEYS = [
  ["listings"],
  ["listings-paginated"],
  ["homepage-featured"],
  ["homepage-open-houses"],
  ["auction-listings"],
  ["new-build-listing"],
  ["open-houses"],
  ["manageable-listings"],
  ["manageable-listing-summary"],
] as const satisfies readonly QueryKey[];

export async function invalidatePublicCatalogueQueries(
  queryClient: QueryClient,
  listingId?: string | null,
): Promise<void> {
  const queryKeys: QueryKey[] = [...PUBLIC_CATALOGUE_QUERY_KEYS];
  if (listingId) queryKeys.push(["listing", listingId]);

  await Promise.all(
    queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}
