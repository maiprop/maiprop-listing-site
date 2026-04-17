import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePortalDropdown } from "@/hooks/usePortalDropdown";
import { listingTypeOptions } from "@/lib/listingsConfig";

export function ListingTypeButton({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const { open, setOpen, pos, triggerRef, portalRef, toggle } = usePortalDropdown();
  const current = listingTypeOptions.find(o => o.value === value) || listingTypeOptions[0];

  return (
    <div ref={triggerRef} className="relative shrink-0">
      <button
        onClick={toggle}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all whitespace-nowrap ${
          value
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-secondary text-foreground hover:border-primary/40"
        }`}
      >
        <span>{current.icon}</span>
        <span>{t(current.labelKey)}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && createPortal(
        <div
          ref={portalRef}
          style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[160px]"
        >
          {listingTypeOptions.map(o => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors hover:bg-secondary ${
                value === o.value ? "text-primary bg-primary/10" : "text-foreground"
              }`}
            >
              <span>{o.icon}</span>
              <span>{t(o.labelKey)}</span>
              {value === o.value && <Check className="w-3.5 h-3.5 ml-auto" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
