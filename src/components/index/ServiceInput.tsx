import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { Briefcase, X } from "lucide-react";
import { getProfessionalSearchSuggestions } from "@/lib/professionalServiceCatalog";

const SUGGESTIONS = getProfessionalSearchSuggestions();

export function ServiceInput({
  value,
  onChange,
  onSearch,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: (category: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const q = value.toLowerCase().trim();
  const filtered = q
    ? SUGGESTIONS.filter(
        (s) => s.label.toLowerCase().includes(q) || s.category.toLowerCase().includes(q),
      ).slice(0, 12)
    : SUGGESTIONS.slice(0, 10);

  const getPos = () => {
    if (!wrapRef.current) return { top: 0, left: 0, width: 300 };
    const r = wrapRef.current.getBoundingClientRect();
    return { top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width };
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const portal = document.getElementById("service-dropdown-portal");
      if (wrapRef.current?.contains(e.target as Node)) return;
      if (portal?.contains(e.target as Node)) return;
      setFocused(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showDropdown = focused && filtered.length > 0;
  const pos = showDropdown ? getPos() : null;

  const dropdown =
    showDropdown && pos ? (
      <div
        id="service-dropdown-portal"
        style={{ position: "absolute", top: pos.top, left: pos.left, width: Math.max(pos.width, 280), zIndex: 9999 }}
        className="bg-card border border-border rounded-2xl shadow-elevated overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary/40">
          <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Professionals & Services
          </span>
        </div>
        {filtered.map((s) => (
          <div
            key={`${s.category}-${s.label}-${s.type}`}
            className="flex items-center px-4 py-2.5 hover:bg-secondary transition-colors cursor-pointer"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(s.label); setFocused(false); onSearch(s.category); }}
          >
            <span className="text-sm text-foreground">{s.label}</span>
            {s.type === "service" && (
              <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[120px]">
                {s.category.replace(/_/g, " ")}
              </span>
            )}
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div ref={wrapRef} className="flex-1 min-w-0 relative">
      <div className="flex items-center gap-2 px-4 py-2.5 h-full min-h-[44px]">
        <Briefcase className="w-4 h-4 text-primary shrink-0" />
        <input
          type="text"
          placeholder="e.g. Architect, Lawyer, Property Valuation..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered[0]) {
              onChange(filtered[0].label);
              setFocused(false);
              onSearch(filtered[0].category);
            }
            if (e.key === "Escape") setFocused(false);
          }}
          className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground outline-none min-w-0"
          autoComplete="off"
        />
        {value && (
          <button onClick={() => onChange("")} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {dropdown && ReactDOM.createPortal(dropdown, document.body)}
    </div>
  );
}
