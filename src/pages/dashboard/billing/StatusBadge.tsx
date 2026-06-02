export const StatusBadge = ({ status }: { status: string | null }) => {
  const map: Record<string, { cls: string; label: string }> = {
    paid: { cls: "bg-brand-emerald/15 text-brand-emerald", label: "Paid" },
    open: { cls: "bg-brand-gold/15 text-brand-gold", label: "Due" },
    void: { cls: "bg-muted text-muted-foreground", label: "Void" },
    draft: { cls: "bg-muted text-muted-foreground", label: "Draft" },
    uncollectible: {
      cls: "bg-destructive/15 text-destructive",
      label: "Uncollectible",
    },
  };
  const { cls, label } = map[status ?? ""] ?? {
    cls: "bg-muted text-muted-foreground",
    label: status ?? "—",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {label}
    </span>
  );
};
