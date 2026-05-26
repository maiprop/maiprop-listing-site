import { buyPriceRanges, rentPriceRanges } from "@/lib/listingsConfig";

export type SmartFilterFeature = { key: string; label: string };

export const getPriceRangeLabel = (selectedPrice: string) =>
  [...buyPriceRanges, ...rentPriceRanges].find((range) => range.value === selectedPrice)?.label || selectedPrice;

export const getFeatureFilterLabel = (features: SmartFilterFeature[], key: string) =>
  features.find((option) => option.key === key)?.label.replace(/^[^\s]+ /, "") || key;
