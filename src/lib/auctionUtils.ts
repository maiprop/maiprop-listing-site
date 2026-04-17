import { getStreetViewProxyUrl } from "@/lib/config";

export type ViewMode = "list" | "map";

// ── Filter option constants ───────────────────────────────────────────────────

export const PROPERTY_TYPES = [
  { value: "", label: "All Types" },
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "House" },
  { value: "villa", label: "Villa" },
  { value: "land", label: "Land / Plot (any)" },
  { value: "land:land", label: "Land (no building)" },
  { value: "land:land_with_building", label: "Land with building" },
  { value: "land:plot", label: "Agricultural plot" },
  { value: "land:plot_with_building", label: "Plot with building" },
  { value: "commercial", label: "Commercial (any)" },
  { value: "commercial:store", label: "Store / Retail" },
  { value: "commercial:warehouse", label: "Warehouse" },
  { value: "commercial:industrial", label: "Industrial" },
  { value: "commercial:storeroom", label: "Storeroom" },
  { value: "commercial:parking", label: "Parking" },
  { value: "commercial:hotel", label: "Hotel" },
  { value: "commercial:other_business_space", label: "Other business space" },
  { value: "office", label: "Office" },
];

const PROPERTY_TYPE_GR: Record<string, string> = {
  apartment: "Διαμέρισμα",
  house: "Κατοικία",
  villa: "Βίλα",
  land: "Γη",
  commercial: "Επαγγελματικός",
  office: "Γραφείο",
};

export const BID_RANGES = [
  { label: "Any Price", value: "" },
  { label: "Under €20k", value: "0-20000" },
  { label: "€20k – €50k", value: "20000-50000" },
  { label: "€50k – €100k", value: "50000-100000" },
  { label: "€100k – €200k", value: "100000-200000" },
  { label: "€200k – €500k", value: "200000-500000" },
  { label: "€500k+", value: "500000-9999999" },
];

export const YEAR_RANGES = [
  { label: "Any Year", value: "" },
  { label: "Pre-1980", value: "0-1979" },
  { label: "1980–2000", value: "1980-2000" },
  { label: "2000–2010", value: "2000-2010" },
  { label: "2010–2020", value: "2010-2020" },
  { label: "Post-2020", value: "2020-2100" },
];

export const OWNERSHIP_STATUSES = [
  { value: "", label: "Any Status" },
  { value: "full", label: "Full" },
  { value: "bare", label: "Bare" },
  { value: "common", label: "Common" },
  { value: "usufruct", label: "Usufruct" },
  { value: "vertical", label: "Vertical" },
  { value: "horizontal", label: "Horizontal" },
];

export const OWNERSHIP_BADGE: Record<string, { label: string; cls: string }> = {
  full:       { label: "Πλήρης κυριότητα",    cls: "bg-primary/15 text-primary border-primary/25" },
  bare:       { label: "Ψιλή κυριότητα",       cls: "bg-brand-purple/15 text-brand-purple border-brand-purple/25" },
  common:     { label: "Εξ αδιαιρέτου",        cls: "bg-accent/15 text-accent border-accent/25" },
  usufruct:   { label: "Επικαρπία",            cls: "bg-muted text-muted-foreground border-border" },
  vertical:   { label: "Κάθετη ιδιοκτησία",   cls: "bg-primary/10 text-primary border-primary/20" },
  horizontal: { label: "Οριζόντια ιδιοκτησία", cls: "bg-secondary text-foreground border-border" },
};

// ── Utility functions ─────────────────────────────────────────────────────────

export function getPropertyTypeLabel(a: { property_type?: string; tags?: string[] | null }): string {
  let base = a.property_type || "";
  if (!base && a.tags?.length) {
    if (a.tags.some(t => t.startsWith("land_type:"))) base = "land";
    else if (a.tags.some(t => t.startsWith("commercial_type:"))) base = "commercial";
  }
  if (base === "land" && a.tags?.length) {
    const landTag = a.tags.find(t => t.startsWith("land_type:"));
    if (landTag) {
      const subtype = landTag.replace("land_type:", "");
      const mapping: Record<string, string> = {
        plot_with_building: "Plot with Building",
        land_with_building: "Land with Building",
        land: "Land (no building)",
        plot: "Agricultural plot",
      };
      if (mapping[subtype]) return mapping[subtype];
    }
  }
  if (base === "commercial" && a.tags?.length) {
    const commTag = a.tags.find(t => t.startsWith("commercial_type:"));
    if (commTag) {
      const subtype = commTag.replace("commercial_type:", "");
      const mapping: Record<string, string> = {
        store: "Store / Retail",
        warehouse: "Warehouse",
        industrial: "Industrial",
        storeroom: "Storeroom",
        parking: "Parking",
        hotel: "Hotel",
        other_business_space: "Other business space",
      };
      if (mapping[subtype]) return mapping[subtype];
    }
  }
  if (!base) return "";
  return PROPERTY_TYPE_GR[base] ?? base.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function getOwnershipStatus(tags?: string[] | null): string | null {
  if (!tags) return null;
  const tag = tags.find(t => t.startsWith("ownership:") && !t.startsWith("ownership_pct:"));
  return tag ? tag.replace("ownership:", "") : null;
}

export function getOwnershipPct(tags?: string[] | null): number | null {
  if (!tags) return null;
  const tag = tags.find(t => t.startsWith("ownership_pct:"));
  return tag ? Number(tag.replace("ownership_pct:", "")) : null;
}

export function normalizeOwnership(v?: string | null): string | null {
  if (!v) return null;
  const raw = v.toLowerCase().trim();
  if (["full", "full_ownership", "complete", "100"].includes(raw)) return "full";
  if (["bare", "bare_ownership", "psili"].includes(raw)) return "bare";
  if (["common", "shared", "undivided", "joint"].includes(raw)) return "common";
  if (["usufruct", "epikarpia"].includes(raw)) return "usufruct";
  if (["vertical", "vertical_ownership"].includes(raw)) return "vertical";
  if (["horizontal", "horizontal_ownership"].includes(raw)) return "horizontal";
  return raw;
}

export function ownershipMatches(filterValue: string, tags?: string[] | null): boolean {
  if (!filterValue) return true;
  const status = normalizeOwnership(getOwnershipStatus(tags));
  const pct = getOwnershipPct(tags);
  const f = normalizeOwnership(filterValue);
  if (!f) return true;
  if (f === "full") return status === "full" || (pct != null && pct >= 100);
  if (f === "bare") return status === "bare";
  if (f === "common") return status === "common" || (status == null && pct != null && pct > 0 && pct < 100);
  if (f === "usufruct") return status === "usufruct";
  if (f === "vertical") return status === "vertical";
  if (f === "horizontal") return status === "horizontal";
  return status === f;
}

export function getAuctionRound(tags?: string[] | null): number | null {
  if (!tags?.length) return null;
  const t = tags.find(x => x.startsWith("round:"));
  if (!t) return null;
  const n = Number(t.replace("round:", ""));
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

const CITY_RENT_PER_SQM: Record<string, number> = {
  "αθήνα": 9.5, "athens": 9.5,
  "κολωνάκι": 13, "γλυφάδα": 11, "μαρούσι": 8.5, "περιστέρι": 7,
  "πειραιάς": 7.5, "piraeus": 7.5, "κηφισιά": 10, "χαλάνδρι": 8.5,
  "θεσσαλονίκη": 8, "thessaloniki": 8, "καλαμαριά": 7.5, "πολίχνη": 6,
  "μύκονος": 18, "mykonos": 18, "σαντορίνη": 16, "santorini": 16,
  "ρόδος": 10, "rhodes": 10, "κέρκυρα": 9, "corfu": 9,
  "ηράκλειο": 8, "heraklion": 8, "χανιά": 8.5,
  "πάτρα": 6.5, "patras": 6.5, "ιωάννινα": 6, "λάρισα": 6,
  "βόλος": 6.5, "καβάλα": 5.5, "χαλκίδα": 6, "λαμία": 5.5, "σέρρες": 5,
};
const DEFAULT_RENT_PER_SQM = 6;

export function estimateYield(a: {
  price?: number | null;
  auction_starting_bid?: number | null;
  sqm?: number | null;
  city?: string | null;
}): number | null {
  const bid = Number(a.auction_starting_bid ?? a.price ?? 0);
  const sqm = Number(a.sqm ?? 0);
  if (bid <= 0 || sqm <= 0) return null;
  const cityKey = (a.city ?? "").toLowerCase().trim();
  const rentPerSqm =
    CITY_RENT_PER_SQM[cityKey] ??
    Object.entries(CITY_RENT_PER_SQM).find(([k]) => cityKey.includes(k) || k.includes(cityKey))?.[1] ??
    DEFAULT_RENT_PER_SQM;
  return (rentPerSqm * sqm * 12) / bid * 100;
}

export function yieldRange(bucket: string): [number, number] | null {
  switch (bucket) {
    case "low":      return [0, 3];
    case "medium":   return [3, 6];
    case "high":     return [6, 9];
    case "very_high":return [9, Infinity];
    default:         return null;
  }
}

export function streetViewImg(lat?: number | null, lng?: number | null): string | null {
  if (lat == null || lng == null) return null;
  return getStreetViewProxyUrl({ lat, lng }) ?? null;
}

export function daysUntil(dateStr?: string | null): number {
  if (!dateStr) return 999;
  const now = new Date();
  const d = new Date(dateStr);
  return Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86_400_000));
}

export function countdownBadge(days: number): { label: string; cls: string } | null {
  if (days <= 0) return { label: "Today!",    cls: "bg-destructive text-destructive-foreground" };
  if (days === 1) return { label: "Tomorrow", cls: "bg-gradient-primary text-primary-foreground" };
  if (days <= 7)  return { label: `${days} days left`, cls: "bg-primary text-primary-foreground" };
  return null;
}
