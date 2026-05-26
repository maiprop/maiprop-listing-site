import { Building2, Briefcase, Phone, FileText, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProField } from "@/components/onboarding/ProField";
import { LocationAutocompleteInput } from "@/components/location/LocationAutocompleteInput";

const DEV_TYPES = [
  { value: "residential",          label: "Residential",          desc: "Apartments, houses, villas" },
  { value: "commercial",           label: "Commercial",           desc: "Offices, retail, logistics" },
  { value: "mixed_use",            label: "Mixed-Use",            desc: "Residential + commercial" },
  { value: "tourism_hospitality",  label: "Tourism / Hospitality", desc: "Hotels, resorts, short-stay" },
  { value: "land_development",     label: "Land Development",     desc: "Plots, subdivisions, masterplans" },
];

export interface DeveloperForm {
  companyName: string;
  registrationNumber: string;
  city: string;
  devType: string;
}

interface Props {
  form: DeveloperForm;
  errors: Record<string, string>;
  loading: boolean;
  authLoading: boolean;
  onFieldChange: (key: keyof DeveloperForm, value: string) => void;
  onSubmit: () => void;
}

export function DeveloperSetupStep({ form, errors, loading, authLoading, onFieldChange, onSubmit }: Props) {
  return (
    <div>
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center mx-auto mb-4">
          <Briefcase className="w-7 h-7 text-orange-400" />
        </div>
        <h1 className="font-display font-bold text-2xl text-foreground mb-1">Developer Profile</h1>
        <p className="text-muted-foreground text-sm">Tell us about your company so we can set up your account</p>
      </div>

      <div className="space-y-4 mb-6">
        <ProField label="Company / Developer Name" required error={errors.companyName} icon={<Building2 className="w-4 h-4 text-muted-foreground" />}>
          <input
            type="text"
            placeholder="e.g. Attica Development S.A."
            value={form.companyName}
            onChange={e => onFieldChange("companyName", e.target.value)}
            className={cn(
              "w-full bg-secondary border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors",
              errors.companyName ? "border-destructive" : "border-border"
            )}
          />
        </ProField>

        <ProField label="Primary City / Region" required error={errors.city} icon={<Phone className="w-4 h-4 text-muted-foreground" />}>
          <LocationAutocompleteInput
            mode="city"
            placeholder="e.g. Athens"
            value={form.city}
            onChange={(value) => onFieldChange("city", value)}
            inputClassName={cn(
              "w-full bg-secondary border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors",
              errors.city ? "border-destructive" : "border-border"
            )}
          />
        </ProField>

        <ProField label="Company Registration Number" hint="ΓΕΜΗ or equivalent — optional" icon={<FileText className="w-4 h-4 text-muted-foreground" />}>
          <input
            type="text"
            placeholder="Optional"
            value={form.registrationNumber}
            onChange={e => onFieldChange("registrationNumber", e.target.value)}
            className="w-full bg-secondary border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
          />
        </ProField>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-2">
            Type of Development <span className="text-destructive">*</span>
          </label>
          {errors.devType && <p className="text-xs text-destructive mb-2">{errors.devType}</p>}
          <div className="grid grid-cols-1 gap-2">
            {DEV_TYPES.map(dt => (
              <button
                key={dt.value}
                type="button"
                onClick={() => onFieldChange("devType", dt.value)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                  form.devType === dt.value
                    ? "border-orange-500/50 bg-orange-500/8 text-foreground"
                    : "border-border bg-secondary/60 text-muted-foreground hover:border-border/80 hover:text-foreground"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                  form.devType === dt.value ? "border-orange-400" : "border-muted-foreground/30"
                )}>
                  {form.devType === dt.value && <div className="w-2 h-2 rounded-full bg-orange-400" />}
                </div>
                <div>
                  <div className="text-sm font-semibold">{dt.label}</div>
                  <div className="text-xs text-muted-foreground">{dt.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button
        className="w-full bg-gradient-primary border-0 text-primary-foreground"
        disabled={loading || authLoading}
        onClick={onSubmit}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
        Set Up My Account
      </Button>
    </div>
  );
}
