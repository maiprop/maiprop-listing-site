import { createPortal } from "react-dom";
import { ChevronDown, Check, Building2, Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePortalDropdown } from "@/hooks/usePortalDropdown";
import { PROPERTY_GROUPS, PROPERTY_TYPE_MAP, type PropertyTypeKey } from "@/lib/propertyTypes";
import { PROPERTY_GROUP_TRANSLATION_KEYS } from "@/lib/listingsConfig";

export function PropertyTypeButton({
  value, subtype, onChange,
}: {
  value: string; subtype: string;
  onChange: (type: string, subtype: string) => void;
}) {
  const { t } = useTranslation();
  const { open, setOpen, pos, triggerRef, portalRef, toggle } = usePortalDropdown();
  const commercialType = PROPERTY_TYPE_MAP["commercial"];
  const currentType = value ? PROPERTY_TYPE_MAP[value as PropertyTypeKey] : null;
  const currentSubtype = currentType?.subtypes.find(s => s.value === subtype);
  const label = currentType && currentSubtype
    ? `${currentType.emoji} ${currentSubtype.label}`
    : currentType
    ? `${currentType.emoji} ${currentType.label}`
    : `🏘️ ${t("listings.filters.allTypes")}`;

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
        <span>{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && createPortal(
        <div
          ref={portalRef}
          style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-card border border-border rounded-xl shadow-lg min-w-[220px] max-h-[480px] overflow-y-auto"
        >
          <button
            onClick={() => { onChange("", ""); setOpen(false); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors hover:bg-secondary ${
              !value ? "text-primary bg-primary/10" : "text-foreground"
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span className="font-medium">{t("listings.filters.allTypes")}</span>
            {!value && <Check className="w-3.5 h-3.5 ml-auto" />}
          </button>
          <div className="h-px bg-border mx-2" />
          {PROPERTY_GROUPS.map((group, gi) => (
            <div key={group.id}>
              <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(PROPERTY_GROUP_TRANSLATION_KEYS[group.id] || group.label)}
                </span>
              </div>
              {group.id === "commercial" ? (
                commercialType.subtypes.map(st => {
                  const Icon = st.icon ?? Store;
                  return (
                    <button
                      key={st.value}
                      onClick={() => { onChange("commercial", st.value); setOpen(false); }}
                      title={st.description}
                      className={`w-full flex items-center gap-2.5 pl-5 pr-3 py-2 text-sm text-left transition-colors hover:bg-secondary ${
                        value === "commercial" && subtype === st.value ? "text-primary bg-primary/10" : "text-foreground"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span>{st.label}</span>
                      {value === "commercial" && subtype === st.value && <Check className="w-3.5 h-3.5 ml-auto" />}
                    </button>
                  );
                })
              ) : (
                group.types.map(typeKey => {
                  const pt = PROPERTY_TYPE_MAP[typeKey];
                  const Icon = pt.icon;
                  return (
                    <button
                      key={pt.value}
                      onClick={() => { onChange(pt.value, ""); setOpen(false); }}
                      className={`w-full flex items-center gap-2.5 pl-5 pr-3 py-2 text-sm text-left transition-colors hover:bg-secondary ${
                        value === pt.value && !subtype ? "text-primary bg-primary/10" : "text-foreground"
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${value === pt.value && !subtype ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="font-medium">{pt.label}</span>
                      {value === pt.value && !subtype && <Check className="w-3.5 h-3.5 ml-auto" />}
                    </button>
                  );
                })
              )}
              {gi < PROPERTY_GROUPS.length - 1 && <div className="h-px bg-border mx-2 mt-1.5" />}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
