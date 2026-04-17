/**
 * Small form UI primitives used in CreateListing and CreateNewBuildingListing.
 */
import { Check } from "lucide-react";

export function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs text-muted-foreground block mb-1.5 font-medium">
      {children}{required && <span className="text-destructive ml-1">*</span>}
    </label>
  );
}

export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="text-xs text-destructive mt-1 flex items-center gap-1 animate-in fade-in-0 slide-in-from-top-1">
      ⚠ {msg}
    </p>
  );
}

export function FormInput({
  hasError,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }) {
  return (
    <input
      {...props}
      className={`w-full bg-secondary border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors ${
        hasError ? "border-destructive ring-1 ring-destructive/30 focus:border-destructive" : "border-border"
      } ${props.className ?? ""}`}
    />
  );
}

export function FormSelect({
  hasError,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { hasError?: boolean }) {
  return (
    <select
      {...props}
      className={`w-full bg-secondary border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors appearance-none ${
        hasError ? "border-destructive ring-1 ring-destructive/30" : "border-border"
      } ${props.className ?? ""}`}
    >
      {children}
    </select>
  );
}

export function FormTextarea({
  hasError,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { hasError?: boolean }) {
  return (
    <textarea
      {...props}
      className={`w-full bg-secondary border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none ${
        hasError ? "border-destructive ring-1 ring-destructive/30 focus:border-destructive" : "border-border"
      } ${props.className ?? ""}`}
    />
  );
}

export function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-secondary text-muted-foreground hover:text-foreground"
      }`}
    >
      {active && <Check className="w-3 h-3 inline mr-1" />}{children}
    </button>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 mt-5 first:mt-0">
      {children}
    </h3>
  );
}
