import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { Building2, Check, ChevronDown, Store } from "lucide-react";
import { PROPERTY_GROUPS, PROPERTY_TYPE_MAP, type PropertyTypeKey } from "@/lib/propertyTypes";

export function PropertyTypeDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (type: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, openUp: false });
  const btnRef = useRef<HTMLButtonElement>(null);
  const isOpeningRef = useRef(false);

  const openDropdown = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceBelow < 360;
      setPos({
        top: openUp ? r.top + window.scrollY - 360 - 4 : r.bottom + window.scrollY + 4,
        left: r.left + window.scrollX,
        width: r.width,
        openUp,
      });
    }
    isOpeningRef.current = true;
    setOpen((o) => !o);
    setTimeout(() => { isOpeningRef.current = false; }, 50);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (isOpeningRef.current) return;
      const portal = document.getElementById("type-dropdown-portal");
      if (btnRef.current?.contains(e.target as Node)) return;
      if (portal?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const currentType = value ? PROPERTY_TYPE_MAP[value as PropertyTypeKey] : null;
  const TypeIcon = currentType?.icon;

  const dropdownList = (
    <div
      id="type-dropdown-portal"
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        minWidth: Math.max(pos.width, 230),
        zIndex: 9999,
      }}
      className="bg-card border border-border rounded-xl shadow-elevated max-h-[360px] overflow-y-auto pb-2"
    >
      <button
        onClick={() => { onChange(""); setOpen(false); }}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors hover:bg-secondary ${!value ? "text-primary bg-primary/10" : "text-foreground"}`}
      >
        <Building2 className="w-4 h-4 shrink-0" />
        <span className="font-medium">All Types</span>
        {!value && <Check className="w-3.5 h-3.5 ml-auto" />}
      </button>
      <div className="h-px bg-border mx-2" />
      {PROPERTY_GROUPS.map((group, gi) => (
        <div key={group.id}>
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</span>
          </div>
          {group.id === "commercial" ? (
            <button
              onClick={() => { onChange("commercial"); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 pl-5 pr-3 py-2 text-sm text-left transition-colors hover:bg-secondary ${value === "commercial" ? "text-primary bg-primary/10" : "text-foreground"}`}
            >
              <Store className={`w-4 h-4 shrink-0 ${value === "commercial" ? "text-primary" : "text-muted-foreground"}`} />
              <span className="font-medium">All Commercial & Offices</span>
              {value === "commercial" && <Check className="w-3.5 h-3.5 ml-auto" />}
            </button>
          ) : (
            group.types.map((typeKey) => {
              const pt = PROPERTY_TYPE_MAP[typeKey];
              const Icon = pt.icon;
              return (
                <button
                  key={pt.value}
                  onClick={() => { onChange(pt.value); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 pl-5 pr-3 py-2 text-sm text-left transition-colors hover:bg-secondary ${value === pt.value ? "text-primary bg-primary/10" : "text-foreground"}`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${value === pt.value ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="font-medium">{pt.label}</span>
                  {value === pt.value && <Check className="w-3.5 h-3.5 ml-auto" />}
                </button>
              );
            })
          )}
          {gi < PROPERTY_GROUPS.length - 1 && <div className="h-px bg-border mx-2 mt-1.5" />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={openDropdown}
        className={`flex items-center gap-2 bg-secondary/60 rounded-xl px-4 py-3 h-full cursor-pointer hover:bg-secondary transition-colors whitespace-nowrap ${value ? "text-primary" : "text-muted-foreground"}`}
      >
        {TypeIcon ? <TypeIcon className="w-4 h-4 shrink-0" /> : <Building2 className="w-4 h-4 shrink-0" />}
        <span className="text-sm font-medium">{currentType?.label ?? "Property type"}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && ReactDOM.createPortal(dropdownList, document.body)}
    </div>
  );
}
