import { Shield, Phone, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProField } from "@/components/onboarding/ProField";
import { CATEGORY_LABELS } from "@/lib/professionalServiceCatalog";

export interface ProVerifyForm {
  businessName: string;
  taxId: string;
  phone: string;
  licenseNumber: string;
}

interface Props {
  proCategory: string;
  form: ProVerifyForm;
  errors: Record<string, string>;
  loading: boolean;
  authLoading: boolean;
  onFieldChange: (key: keyof ProVerifyForm, value: string) => void;
  onSubmit: () => void;
}

export function ProVerifyStep({ proCategory, form, errors, loading, authLoading, onFieldChange, onSubmit }: Props) {
  return (
    <div>
      <div className="text-center mb-5">
        <h1 className="font-display font-bold text-2xl text-foreground mb-1">Business Verification</h1>
        <p className="text-muted-foreground text-sm">
          As a {CATEGORY_LABELS[proCategory] ?? "professional"}, we need to verify your identity
        </p>
      </div>
      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-3 mb-5">
        <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300/90">
          Details used only for verification. Approval takes 24–48h. You'll receive a verified badge upon approval.
        </p>
      </div>
      <div className="space-y-4">
        <ProField label="Business / Company Name" required error={errors.businessName} icon={<FileText className="w-4 h-4 text-muted-foreground" />}>
          <input
            type="text"
            placeholder="e.g. Papadopoulos Architecture Ltd."
            value={form.businessName}
            onChange={e => onFieldChange("businessName", e.target.value)}
            className={cn(
              "w-full bg-secondary border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors",
              errors.businessName ? "border-destructive" : "border-border"
            )}
          />
        </ProField>
        <ProField label="Tax ID (ΑΦΜ)" required hint="9-digit Greek tax ID" error={errors.taxId} icon={<Shield className="w-4 h-4 text-muted-foreground" />}>
          <input
            type="text"
            placeholder="123456789"
            value={form.taxId}
            onChange={e => onFieldChange("taxId", e.target.value.replace(/\D/g, "").slice(0, 9))}
            maxLength={9}
            className={cn(
              "w-full bg-secondary border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground font-mono tracking-widest outline-none focus:border-primary transition-colors",
              errors.taxId ? "border-destructive" : "border-border"
            )}
          />
        </ProField>
        <ProField label="Phone Number" required error={errors.phone} icon={<Phone className="w-4 h-4 text-muted-foreground" />}>
          <input
            type="tel"
            placeholder="+30 69X XXX XXXX"
            value={form.phone}
            onChange={e => onFieldChange("phone", e.target.value)}
            className={cn(
              "w-full bg-secondary border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors",
              errors.phone ? "border-destructive" : "border-border"
            )}
          />
        </ProField>
        <ProField label="License / Registration Number" hint="Optional — e.g. ΤΕΕ-12345" icon={<FileText className="w-4 h-4 text-muted-foreground" />}>
          <input
            type="text"
            placeholder="Optional"
            value={form.licenseNumber}
            onChange={e => onFieldChange("licenseNumber", e.target.value)}
            className="w-full bg-secondary border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
          />
        </ProField>
        <Button
          className="w-full bg-gradient-primary border-0 text-primary-foreground"
          disabled={loading || authLoading}
          onClick={onSubmit}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
          Verify & Continue
        </Button>
      </div>
    </div>
  );
}
