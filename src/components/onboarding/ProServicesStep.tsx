/**
 * Step: service catalog selection for service professionals.
 * All data manipulation is self-contained; parent receives updates via onChange.
 */

import { Check, Plus, Minus, Euro, Clock, Video, Lock, Loader2, ArrowRight, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  getServicesForCategory,
  PRICING_LABELS,
  CATEGORY_LABELS,
  type ServiceTemplate,
  type PricingModel,
} from "@/lib/professionalServiceCatalog";
import type { SelectedService } from "@/lib/onboardingConfig";

interface Props {
  proCategory: string;
  selectedServices: Record<string, SelectedService>;
  onChange: (services: Record<string, SelectedService>) => void;
  loading: boolean;
  onSave: () => void;
}

export function ProServicesStep({ proCategory, selectedServices, onChange, loading, onSave }: Props) {
  const catalog = getServicesForCategory(proCategory);
  const selectedCount = Object.keys(selectedServices).length;
  const allSelected = selectedCount === catalog.length;

  const selectAll = () => {
    const next: Record<string, SelectedService> = {};
    catalog.forEach((svc: ServiceTemplate) => {
      next[svc.key] = {
        template: svc,
        pricingModel: svc.defaultPricing,
        rate: String(svc.suggestedRate),
        videoEnabled: svc.videoAvailable,
      };
    });
    onChange(next);
  };

  const deselectAll = () => onChange({});

  const toggleService = (svc: ServiceTemplate) => {
    if (selectedServices[svc.key]) {
      const next = { ...selectedServices };
      delete next[svc.key];
      onChange(next);
    } else {
      onChange({
        ...selectedServices,
        [svc.key]: {
          template: svc,
          pricingModel: svc.defaultPricing,
          rate: String(svc.suggestedRate),
          videoEnabled: svc.videoAvailable,
        },
      });
    }
  };

  const updateServicePricing = (
    key: string,
    field: "pricingModel" | "rate" | "videoEnabled",
    value: string | boolean | PricingModel,
  ) => {
    onChange({ ...selectedServices, [key]: { ...selectedServices[key], [field]: value } });
  };

  return (
    <div>
      <div className="text-center mb-5">
        <h1 className="font-display font-bold text-2xl text-foreground mb-1">Your Services</h1>
        <p className="text-muted-foreground text-sm">
          Select the services you offer as a{" "}
          <span className="font-medium text-foreground">{CATEGORY_LABELS[proCategory]}</span>.
          Set your pricing model and rate for each.
        </p>
      </div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-primary font-medium flex items-center gap-1.5">
          {selectedCount > 0 ? (
            <><Check className="w-3.5 h-3.5" />{selectedCount} of {catalog.length} selected</>
          ) : (
            <span className="text-muted-foreground">None selected yet</span>
          )}
        </div>
        <button
          onClick={allSelected ? deselectAll : selectAll}
          className="text-xs font-medium text-primary hover:text-primary/80 border border-primary/30 hover:border-primary/60 rounded-full px-3 py-1 transition-all"
        >
          {allSelected ? "Deselect All" : "Select All"}
        </button>
      </div>
      <div className="space-y-3 mb-6">
        {catalog.map((svc: ServiceTemplate) => {
          const active = !!selectedServices[svc.key];
          const sel = selectedServices[svc.key];
          return (
            <div
              key={svc.key}
              className={cn(
                "rounded-2xl border transition-all duration-200 overflow-hidden",
                active ? "border-primary/50 bg-primary/5" : "border-border bg-secondary/40",
              )}
            >
              <div className="flex items-start gap-3 p-4 cursor-pointer" onClick={() => toggleService(svc)}>
                <div
                  className={cn(
                    "mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                    active ? "bg-primary border-primary" : "border-border bg-background",
                  )}
                >
                  {active && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-foreground">{svc.name}</span>
                    {svc.isPremiumFeature && (
                      <span className="inline-flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5 text-[10px] text-amber-400 font-medium">
                        <Crown className="w-2.5 h-2.5" /> Pro
                      </span>
                    )}
                    {svc.videoAvailable && (
                      <span className="inline-flex items-center gap-1 bg-brand-purple/10 border border-brand-purple/20 rounded-full px-2 py-0.5 text-[10px] text-brand-purple">
                        <Video className="w-2.5 h-2.5" /> Video
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{svc.description}</p>
                  {!active && (
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground/70">
                      <span className="flex items-center gap-1">
                        <Euro className="w-3 h-3" />Suggested: €{svc.suggestedRate.toLocaleString()} /{" "}
                        {PRICING_LABELS[svc.defaultPricing]}
                      </span>
                      {svc.estimatedHours && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />~{svc.estimatedHours}h
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className={cn("shrink-0 mt-0.5 transition-transform", active ? "rotate-45" : "")}>
                  {active ? <Minus className="w-4 h-4 text-muted-foreground" /> : <Plus className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>

              {active && sel && (
                <div className="px-4 pb-4 border-t border-primary/15 pt-3 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-2">Pricing Model</label>
                    <div className="flex gap-2">
                      {(["hourly", "daily", "fixed"] as PricingModel[]).map((pm) => (
                        <button
                          key={pm}
                          onClick={() => updateServicePricing(svc.key, "pricingModel", pm)}
                          className={cn(
                            "flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all",
                            sel.pricingModel === pm
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-secondary text-muted-foreground hover:border-primary/40",
                          )}
                        >
                          {PRICING_LABELS[pm]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                        Your Rate (€)
                        {sel.pricingModel === "hourly" ? " / hour" : sel.pricingModel === "daily" ? " / day" : " fixed"}
                      </label>
                      <div className="relative">
                        <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                          type="number"
                          min={0}
                          value={sel.rate}
                          onChange={(e) => updateServicePricing(svc.key, "rate", e.target.value)}
                          className="w-full bg-background border border-border rounded-xl pl-8 pr-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors"
                        />
                      </div>
                    </div>
                    {svc.estimatedHours && (
                      <div className="text-xs text-muted-foreground pt-5">~{svc.estimatedHours}h typical</div>
                    )}
                  </div>
                  {svc.videoAvailable && (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div
                        onClick={() => {
                          if (svc.isPremiumFeature && !sel.videoEnabled) {
                            toast("Video consultations require the Pro plan", { icon: "🔒" });
                            return;
                          }
                          updateServicePricing(svc.key, "videoEnabled", !sel.videoEnabled);
                        }}
                        className={cn(
                          "w-9 h-5 rounded-full border relative transition-colors cursor-pointer",
                          sel.videoEnabled ? "bg-primary border-primary" : "bg-secondary border-border",
                        )}
                      >
                        <div
                          className={cn(
                            "absolute top-0.5 w-4 h-4 rounded-full bg-background shadow transition-transform",
                            sel.videoEnabled ? "translate-x-4" : "translate-x-0.5",
                          )}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5 text-brand-purple" />
                        Available via video consultation
                        {svc.isPremiumFeature && <Lock className="w-3 h-3 text-amber-400" />}
                      </span>
                    </label>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Button
        className="w-full bg-gradient-primary border-0 text-primary-foreground"
        disabled={loading || selectedCount === 0}
        onClick={onSave}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Save {selectedCount > 0 ? `${selectedCount} Service${selectedCount > 1 ? "s" : ""}` : "Services"} &amp; Continue
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}
