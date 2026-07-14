import { Check, Loader2, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  FieldLabel, FieldError, SectionTitle, ToggleChip,
  FormInput as Input, FormSelect,
} from "@/components/listings/FormPrimitives";
import type { ListingFormData, AIPriceSuggestion } from "@/hooks/useListingForm";
import { tFallback, tInterpolate } from "@/lib/i18nFallback";
import { calculatePricePerSqm } from "@/lib/priceCalculations";

interface Props {
  form: ListingFormData;
  set: (key: string, value: unknown) => void;
  toggle: (key: string) => void;
  errors: Record<string, string>;
  setFieldRef: (key: string) => (el: HTMLElement | null) => void;
  aiPriceLoading: boolean;
  aiPriceSuggestion: AIPriceSuggestion | null;
  handleAiPrice: () => Promise<void>;
  participantType: string;
  isPro: boolean;
}

export function StepPricing({
  form, set, toggle, errors, setFieldRef,
  aiPriceLoading, aiPriceSuggestion, handleAiPrice,
  participantType,
}: Props) {
  const { t } = useTranslation();
  const lt = form.listing_type;
  const isRentalPricing = lt === "rent" || (lt === "open_house" && form.open_house_transaction_type === "rent");
  const tr = (key: string, fallback: string) => tFallback(t, key, fallback);
  const trv = (key: string, fallback: string, values: Record<string, string | number>) => tInterpolate(t, key, fallback, values);
  const pricePerSqm = calculatePricePerSqm({ price: form.price, sqm: form.sqm });

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-semibold">{tr("createListing.pricing.heading", "Pricing")}</h2>

      {/* AI Price Suggestion Banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">{tr("createListing.pricing.aiEstimate", "AI Market Estimate")}</span>
          </div>
          <button
            type="button"
            onClick={handleAiPrice}
            disabled={aiPriceLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:opacity-50 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
          >
            {aiPriceLoading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {tr("createListing.pricing.analysing", "Analysing...")}</>
              : aiPriceSuggestion
              ? <><RefreshCw className="w-3.5 h-3.5" /> {tr("createListing.pricing.reestimate", "Re-estimate")}</>
              : <><Sparkles className="w-3.5 h-3.5" /> {tr("createListing.pricing.getEstimate", "Get AI Estimate")}</>
            }
          </button>
        </div>

        {!aiPriceSuggestion && !aiPriceLoading && (
          <p className="text-xs text-muted-foreground">
            {tr("createListing.pricing.aiHint", "Get an AI-powered price estimate based on your property details and current Greek market data.")}
          </p>
        )}

        {aiPriceLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            {trv("createListing.pricing.analysingArea", "Analysing Greek market data for {{area}}...", { area: form.city || tr("createListing.pricing.yourArea", "your area") })}
          </div>
        )}

        {aiPriceSuggestion && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-background/50 px-2 py-2">
                <div className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">{tr("createListing.pricing.min", "Min")}</div>
                <div className="text-sm font-bold text-foreground">€{aiPriceSuggestion.min.toLocaleString()}</div>
              </div>
              <div className="rounded-lg bg-primary/15 border border-primary/30 px-2 py-2">
                <div className="text-[10px] text-primary mb-0.5 uppercase tracking-wide font-bold">{tr("createListing.pricing.suggested", "Suggested")}</div>
                <div className="text-sm font-black text-primary">€{aiPriceSuggestion.suggested.toLocaleString()}</div>
              </div>
              <div className="rounded-lg bg-background/50 px-2 py-2">
                <div className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">{tr("createListing.pricing.max", "Max")}</div>
                <div className="text-sm font-bold text-foreground">€{aiPriceSuggestion.max.toLocaleString()}</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground italic">{aiPriceSuggestion.reasoning}</p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {tr("createListing.pricing.confidence", "Confidence")}: <span className={`font-bold ${aiPriceSuggestion.confidence === "high" ? "text-green-500" : aiPriceSuggestion.confidence === "medium" ? "text-yellow-500" : "text-red-400"}`}>{tr(`createListing.pricing.confidenceLevels.${aiPriceSuggestion.confidence}`, aiPriceSuggestion.confidence)}</span>
              </span>
              <button
                type="button"
                onClick={() => { set("price", String(aiPriceSuggestion.suggested)); }}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> {tr("createListing.pricing.useThisPrice", "Use this price")}
              </button>
            </div>
          </div>
        )}
      </div>

      <div ref={setFieldRef("price") as React.Ref<HTMLDivElement>}>
        <FieldLabel required>{isRentalPricing ? tr("createListing.pricing.monthlyRent", "Monthly Rent (€)") : tr("createListing.pricing.askingPrice", "Asking Price (€)")}</FieldLabel>
        <Input type="number" placeholder={isRentalPricing ? "800" : "250000"} value={form.price} onChange={e => set("price", e.target.value)} hasError={!!errors.price} />
        <FieldError msg={errors.price} />
        {pricePerSqm != null && (
          <p className="text-xs text-muted-foreground mt-1">
            €{pricePerSqm.toLocaleString()}/m²
          </p>
        )}
      </div>

      {isRentalPricing && (
        <>
          <SectionTitle>{tr("createListing.pricing.rentalTerms", "Rental Terms")}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>{tr("createListing.pricing.securityDeposit", "Security Deposit (months)")}</FieldLabel><Input type="number" placeholder="2" value={form.deposit_months} onChange={e => set("deposit_months", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.pricing.sharedExpenses", "Avg Monthly Shared Expenses (€)")}</FieldLabel><Input type="number" placeholder="50" value={form.monthly_expenses} onChange={e => set("monthly_expenses", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.pricing.minRentalPeriod", "Min Rental Period (months)")}</FieldLabel><Input type="number" placeholder="12" value={form.min_rental_months} onChange={e => set("min_rental_months", e.target.value)} /></div>
            <div><FieldLabel>{tr("createListing.pricing.availableFrom", "Available From")}</FieldLabel><Input type="date" value={form.available_from} onChange={e => set("available_from", e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ToggleChip active={form.agent_fee_included} onClick={() => toggle("agent_fee_included")}>{tr("createListing.pricing.noAgentFee", "No Agent Fee")}</ToggleChip>
            <ToggleChip active={form.pets_allowed} onClick={() => toggle("pets_allowed")}>{tr("createListing.pricing.petsAllowed", "Pets Allowed")}</ToggleChip>
            <ToggleChip active={form.short_term_rental} onClick={() => toggle("short_term_rental")}>{tr("createListing.pricing.shortTermRental", "Short-term / Airbnb")}</ToggleChip>
          </div>
        </>
      )}

      {lt === "auction" && (
        <>
          <SectionTitle>{tr("createListing.pricing.auctionDetails", "Auction Details")}</SectionTitle>
          <div ref={setFieldRef("auction_starting_bid") as React.Ref<HTMLDivElement>}>
            <FieldLabel>{tr("createListing.pricing.firstOfferPrice", "First Offer Price (€)")}</FieldLabel>
            <Input type="number" value={form.auction_starting_bid} onChange={e => set("auction_starting_bid", e.target.value)} hasError={!!errors.auction_starting_bid} />
            <FieldError msg={errors.auction_starting_bid} />
          </div>
          <div><FieldLabel>{tr("createListing.pricing.auctionDateTime", "Auction Date & Time")}</FieldLabel><Input type="datetime-local" value={form.auction_date} onChange={e => set("auction_date", e.target.value)} /></div>
          <div><FieldLabel>{tr("createListing.pricing.auctionOfficerPlatform", "Auction Officer / Platform")}</FieldLabel><Input placeholder={tr("createListing.pricing.auctionOfficerPlaceholder", "e.g. eAuction / notary office")} value={form.auction_court} onChange={e => set("auction_court", e.target.value)} /></div>
        </>
      )}

      {lt === "open_house" && (
        <>
          <SectionTitle>{tr("createListing.pricing.openHouseDetails", "Open House Details")}</SectionTitle>
          <div>
            <FieldLabel>{tr("createListing.pricing.openHouseTransaction", "Open house subcategory")}</FieldLabel>
            <FormSelect
              aria-label={tr("createListing.pricing.openHouseTransaction", "Open house subcategory")}
              value={form.open_house_transaction_type}
              onChange={e => set("open_house_transaction_type", e.target.value)}
            >
              <option value="sale">{tr("createListing.pricing.openHouseForSale", "Sale open house")}</option>
              <option value="rent">{tr("createListing.pricing.openHouseForRent", "Rental open house")}</option>
            </FormSelect>
          </div>
          <div ref={setFieldRef("open_house_date") as React.Ref<HTMLDivElement>}>
            <FieldLabel required>{tr("createListing.pricing.dateTime", "Date & Time")}</FieldLabel>
            <Input type="datetime-local" value={form.open_house_date} onChange={e => set("open_house_date", e.target.value)} hasError={!!errors.open_house_date} />
            <FieldError msg={errors.open_house_date} />
          </div>
        </>
      )}

      {participantType === "agent" && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <span className="text-primary">◆</span> {tr("createListing.pricing.agentListing", "Agent Listing")}
          </div>
          <p className="text-xs text-muted-foreground mb-3">{tr("createListing.pricing.exclusiveHint", "Mark this as an exclusive listing (you are the sole agent).")}</p>
          <ToggleChip active={form.is_exclusive} onClick={() => set("is_exclusive", !form.is_exclusive)}>{tr("createListing.pricing.exclusive", "Exclusive")}</ToggleChip>
        </div>
      )}

    </div>
  );
}
