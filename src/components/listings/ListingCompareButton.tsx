import { Check, GitCompare } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ListingCard } from "@/types";

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
  const disabled = !isSelected && isLimitReached;
  const label = i18n.language?.toLowerCase().startsWith("el")
    ? "\u03a3\u03cd\u03b3\u03ba\u03c1\u03b9\u03c3\u03b7"
    : "Compare";

  return (
    <button
      type="button"
      onClick={() => onToggle(listing)}
      disabled={disabled}
      aria-label={label}
      aria-pressed={isSelected}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all md:h-8 md:w-8 ${
        isSelected
          ? "border-accent bg-accent text-accent-foreground"
          : disabled
            ? "cursor-not-allowed border-border bg-secondary text-muted-foreground opacity-50"
            : "border-border bg-secondary text-muted-foreground hover:border-accent/60 hover:text-accent"
      }`}
    >
      {isSelected ? <Check className="h-4 w-4" /> : <GitCompare className="h-4 w-4" />}
    </button>
  );
};
