export function ProField({
  label,
  required,
  error,
  hint,
  icon,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1.5">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">{icon}</span>}
        {children}
      </div>
      {error && <p className="text-xs text-destructive mt-1">⚠ {error}</p>}
      {hint && !error && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
