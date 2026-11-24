import type { ListingCardWithRaw } from "@/lib/listingsCardUtils";

export const getListingsResultLabel = ({ // skipcq: JS-R1005 - Result labels intentionally branch by map, area, viewport, and pagination states.
  viewMode,
  polygonFilterIds,
  viewportIds,
  filtered,
  mapListings,
  hasNextPage,
  isGreek,
}: {
  viewMode: "grid" | "split" | "map";
  polygonFilterIds: Set<string> | null;
  viewportIds: Set<string> | null;
  filtered: ListingCardWithRaw[];
  mapListings: Array<{ id: string }>;
  hasNextPage: boolean;
  isGreek: boolean;
}) => {
  if ((viewMode === "split" || viewMode === "map") && polygonFilterIds !== null) {
    const count = filtered.filter((property) => polygonFilterIds.has(property.id)).length;
    const displayCount = `${count}${hasNextPage ? "+" : ""}`;
    return isGreek ? `${displayCount} στην περιοχή` : `${displayCount} in area`;
  }
  if (viewMode === "split" && viewportIds !== null) {
    const count = filtered.filter((property) => viewportIds.has(property.id)).length;
    const displayCount = `${count}${hasNextPage ? "+" : ""}`;
    return isGreek ? `${displayCount} στον χάρτη` : `${displayCount} in view`;
  }
  if (viewMode === "map") {
    const count = hasNextPage ? `${mapListings.length}+` : String(mapListings.length);
    return isGreek ? `${count} αποτελέσματα χάρτη` : `${count} map result${mapListings.length !== 1 ? "s" : ""}`;
  }
  if (hasNextPage) {
    return isGreek ? `${filtered.length} φορτωμένα ακίνητα` : `${filtered.length} loaded propert${filtered.length === 1 ? "y" : "ies"}`;
  }
  return isGreek ? `${filtered.length} ακίνητα` : `${filtered.length} properties`;
};
