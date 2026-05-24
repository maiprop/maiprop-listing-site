import { Check, GitCompare } from "lucide-react";
import type { ListingCard } from "@/types";
import { useTranslation } from "react-i18next";

interface ListingCompareButtonProps<TListing extends ListingCard> {
  listing: TListing;
  isSelected: boolean;
  isLimitReached: boolean;
  onToggle: (listing: TListing) => void;
}

export const ListingCompareButton = <TListing extends ListingCard>({
  listing,
  isSelected,
  isLimitReached,
  onToggle,
}: ListingCompareButtonProps<TListing>) => {
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const disabled = !isSelected && isLimitReached;

  return (
    <button
      type="button"
      onClick={() => onToggle(listing)}
      disabled={disabled}
      aria-pressed={isSelected}
      className={`absolute bottom-[108px] right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-all shadow-card ${
        isSelected
          ? "bg-accent/90 border-accent text-accent-foreground"
          : disabled
          ? "bg-secondary/80 border-border text-muted-foreground opacity-50 cursor-not-allowed"
          : "bg-card/80 border-border text-muted-foreground hover:border-accent/60 hover:text-accent backdrop-blur-sm opacity-0 group-hover:opacity-100"
      }`}
    >
      {isSelected ? <Check className="w-3 h-3" /> : <GitCompare className="w-3 h-3" />}
      {isGreek ? "Σύγκριση" : "Compare"}
    </button>
  );
};
