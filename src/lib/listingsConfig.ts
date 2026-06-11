// Shared constants for the Listings page filters and options

export const buyPriceRanges = [
  { label: "Any Price", value: "" },
  { label: "Under €80k", value: "0-80000" },
  { label: "€80k – €150k", value: "80000-150000" },
  { label: "€150k – €300k", value: "150000-300000" },
  { label: "€300k – €600k", value: "300000-600000" },
  { label: "€600k – €1M", value: "600000-1000000" },
  { label: "€1M+", value: "1000000-9999999" },
];

export const rentPriceRanges = [
  { label: "Any Rent", value: "" },
  { label: "Under €400/mo", value: "0-400" },
  { label: "€400 – €700/mo", value: "400-700" },
  { label: "€700 – €1,200/mo", value: "700-1200" },
  { label: "€1,200 – €2,500/mo", value: "1200-2500" },
  { label: "€2,500+/mo", value: "2500-99999" },
];

export const listingTypeOptions = [
  { labelKey: "listingsPage.listingTypes.all", value: "", icon: "🏘️" },
  { labelKey: "listingsPage.listingTypes.buy", value: "sale", icon: "🏷️" },
  { labelKey: "listingsPage.listingTypes.rent", value: "rent", icon: "🔑" },
  { labelKey: "listingsPage.listingTypes.newBuild", value: "new_build", icon: "🏗️" },
];

export const sortOptions = [
  { labelKey: "listingsPage.sortOptions.relevant", value: "relevant" },
  { labelKey: "listingsPage.sortOptions.featured", value: "featured" },
  { labelKey: "listingsPage.sortOptions.priceAsc", value: "price-asc" },
  { labelKey: "listingsPage.sortOptions.priceDesc", value: "price-desc" },
  { labelKey: "listingsPage.sortOptions.newest", value: "newest" },
  { labelKey: "listingsPage.sortOptions.aiScore", value: "ai-score" },
  { labelKey: "listingsPage.sortOptions.mostViewed", value: "views" },
];

export const bathsOpts = ["1", "2", "3", "4"].map(v => ({ label: v, value: v }));

export const floorOpts = ["-1", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"].map(v => ({
  label: v === "-1" ? "Basement" : v === "0" ? "Ground" : v,
  value: v,
}));

export const yearOpts = [
  "1950", "1960", "1970", "1980", "1990", "2000", "2005",
  "2010", "2015", "2018", "2020", "2022", "2024", "2025",
].map(v => ({ label: v, value: v }));

export const PROPERTY_GROUP_TRANSLATION_KEYS: Record<string, string> = {
  residence: "listingsPage.propertyTypeGroups.residential",
  commercial: "listingsPage.propertyTypeGroups.commercial",
  land: "listingsPage.propertyTypeGroups.land",
};
