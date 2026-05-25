import { useState } from "react";
import { X, ArrowRight, Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CompareAIReports } from "@/components/CompareAIReports";
import { ENERGY_CLASS_COLORS } from "@/lib/statusColors";
import { useFocusTrap } from "@/hooks/useFocusTrap";

// Compare drawer renders an arbitrary listing column row at runtime; the
// formatter receives whatever the (heavily projected) listing record holds.
// Narrowing every column would force a 200-line discriminated union and
// no safety win, so we keep `any` here behind explicit, narrow suppressions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listing = Record<string, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ROWS: { label: string; key: string; format?: (v: any) => string }[] = [
  { label: "Price", key: "price", format: v => v ? `€${Number(v).toLocaleString()}` : "—" },
  { label: "Price / m²", key: "price_per_sqm", format: v => v ? `€${Number(v).toLocaleString()}/m²` : "—" },
  { label: "Size", key: "sqm", format: v => v ? `${v} m²` : "—" },
  { label: "City", key: "city" },
  { label: "Bedrooms", key: "bedrooms", format: v => v ?? "—" },
  { label: "Bathrooms", key: "bathrooms", format: v => v ?? "—" },
  { label: "Floor", key: "floor", format: v => v != null ? v : "—" },
  { label: "Year Built", key: "year_built", format: v => v ?? "—" },
  { label: "Energy Class", key: "energy_class" },
  { label: "Heating", key: "heating_system", format: v => v ? v.replace("_", " ") : "—" },
  { label: "Condition", key: "construction_status", format: v => v ? v.replace(/_/g, " ") : "—" },
  { label: "Parking", key: "has_parking" },
  { label: "Elevator", key: "has_elevator" },
  { label: "Pool", key: "has_pool" },
  { label: "Garden", key: "has_garden" },
  { label: "Balcony", key: "has_balcony" },
  { label: "AC", key: "has_ac" },
  { label: "Fireplace", key: "has_fireplace" },
  { label: "Furnished", key: "has_furnished" },
  { label: "Storage", key: "has_storage" },
  { label: "Smart Home", key: "has_smart_home" },
  { label: "Security", key: "has_security" },
  { label: "Pets Allowed", key: "pets_allowed" },
  { label: "Short-term Rental", key: "short_term_rental" },
];

function CellValue({ row, listing }: { row: typeof ROWS[0]; listing: Listing }) {
  const raw = listing._raw ?? listing;
  const val = raw[row.key];

  if (row.key === "energy_class" && val) {
    return (
      <span
        className="inline-block px-2 py-0.5 rounded text-xs font-bold text-white"
        style={{ background: ENERGY_CLASS_COLORS[val] || "#888" }}
      >
        {val}
      </span>
    );
  }

  if (typeof val === "boolean") {
    return val
      ? <Check className="w-4 h-4 text-brand-emerald mx-auto" />
      : <Minus className="w-4 h-4 text-muted-foreground mx-auto" />;
  }

  const display = row.format ? row.format(val) : (val ?? "—");
  return <span className="text-sm">{String(display)}</span>;
}

export function CompareDrawer({
  listings,
  onRemove,
  onClear,
}: {
  listings: Listing[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  if (listings.length === 0) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[45] shadow-elevated"
      style={{ bottom: "calc(var(--bottom-nav-h, 56px) + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* ── collapsed bar ── */}
      <div className="bg-card border-t border-border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold text-sm">
            Compare{" "}
            <span className="text-primary font-bold">{listings.length}</span>/3 properties
          </span>
          <div className="flex gap-2 overflow-x-auto scrollbar-none min-w-0">
            {listings.map(l => (
              <div key={l.id} className="relative group flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary border border-border text-xs font-medium truncate max-w-[140px]">
                <span className="truncate">{l.title}</span>
                <button
                  onClick={() => onRemove(l.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0">
          <button onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Clear all
          </button>
          {listings.length >= 2 && (
            <CompareModal listings={listings} onRemove={onRemove} />
          )}
        </div>
      </div>
    </div>
  );
}

function CompareModal({ listings, onRemove }: { listings: Listing[]; onRemove: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useFocusTrap<HTMLDivElement>({ active: open, onEscape: () => setOpen(false) });

  return (
    <>
      <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground gap-1.5 text-xs" onClick={() => setOpen(true)}>
        Compare <ArrowRight className="w-3.5 h-3.5" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-background/80 backdrop-blur-sm overflow-y-auto pt-8 pb-16 px-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Property comparison"
            tabIndex={-1}
            className="bg-card border border-border rounded-2xl shadow-elevated w-full max-w-5xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-display font-bold text-xl">Property Comparison</h2>
              <button onClick={() => setOpen(false)} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-secondary transition-colors" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-6 py-4 text-xs text-muted-foreground font-medium w-36 shrink-0">Attribute</th>
                    {listings.map(l => (
                      <th key={l.id} className="px-4 py-4 min-w-[200px]">
                        <div className="relative">
                          <button
                            onClick={() => onRemove(l.id)}
                            className="absolute -top-1 -right-1 p-1 rounded-full bg-secondary hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <img
                            src={l.images?.[0] || (l._raw?.cover_image_url) || "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=60"}
                            alt={l.title}
                            className="w-full h-28 object-cover rounded-xl mb-2"
                          />
                          <p className="font-semibold text-sm text-left leading-tight">{l.title}</p>
                          <p className="text-xs text-muted-foreground text-left">{(l._raw ?? l).city}</p>
                          <Button size="sm" variant="outline" className="border-border mt-2 text-xs w-full" asChild>
                            <Link to={`/property/${l.id}`} onClick={() => setOpen(false)}>View →</Link>
                          </Button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* AI Reports section — placed at top of body */}
                  <CompareAIReports listings={listings} />

                  {ROWS.map((row, i) => (
                    <tr key={row.key} className={`border-b border-border/50 ${i % 2 === 0 ? "bg-secondary/20" : ""}`}>
                      <td className="px-6 py-3 text-xs text-muted-foreground font-medium whitespace-nowrap">{row.label}</td>
                      {listings.map(l => (
                        <td key={l.id} className="px-4 py-3 text-center">
                          <CellValue row={row} listing={l} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
