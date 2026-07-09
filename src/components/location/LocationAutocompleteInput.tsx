import { useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import ReactDOM from "react-dom";
import { Loader2, MapPin } from "lucide-react";
import { useAddressAutocomplete } from "@/hooks/useAddressAutocomplete";
import { GooglePlacesAttribution } from "@/components/location/GooglePlacesAttribution";
import { formatAddressPrediction, type AddressPrediction } from "@/lib/location/addressFormat";
import {
  getAddressInputDisplayValue,
  getListingLocationSearchValue,
  isBroadAdministrativePrediction,
} from "@/lib/location/locationSearchSemantics";
import { cn } from "@/lib/utils";

export type LocationAutocompleteSelection = AddressPrediction & { suggestion?: unknown };

interface LocationAutocompleteInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "value"> {
  value: string;
  onChange: (value: string) => void;
  mode?: "city" | "address";
  wrapperClassName?: string;
  inputClassName?: string;
  dropdownClassName?: string;
  onSuggestionSelect?: (selection: LocationAutocompleteSelection) => void;
}

type SuggestionItem = {
  key: string;
  title: string;
  subtitle: string;
  selection: LocationAutocompleteSelection;
};

export function LocationAutocompleteInput({
  value,
  onChange,
  mode = "city",
  wrapperClassName,
  inputClassName,
  dropdownClassName,
  onSuggestionSelect,
  id,
  disabled,
  onFocus,
  onKeyDown,
  onBlur,
  ...inputProps
}: LocationAutocompleteInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const textValue = value ?? "";
  const query = textValue.trim();
  const activeQuery = !disabled && focused ? query : "";
  const { predictions, loading, clear } = useAddressAutocomplete(activeQuery, {
    mode,
    enabled: !disabled && focused,
    includePopular: mode === "city",
  });

  useEffect(() => {
    if (!focused) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setFocused(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [focused]);

  useEffect(() => {
    if (disabled) setFocused(false);
  }, [disabled]);

  const items = useMemo<SuggestionItem[]>(
    () => predictions.map((prediction) => {
      const formatted = formatAddressPrediction(prediction);
      return {
        key: prediction.id,
        title: formatted.title,
        subtitle: formatted.subtitle,
        selection: prediction,
      };
    }),
    [predictions],
  );
  const showDropdown = focused && !disabled && (items.length > 0 || loading);
  const hasGoogleSuggestions = items.some((item) => item.selection.provider === "google");
  const listboxId = `${inputId}-listbox`;

  const getPos = () => {
    if (!wrapRef.current) return { top: 0, left: 0, width: 300 };
    const rect = wrapRef.current.getBoundingClientRect();
    return { top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width };
  };

  const selectItem = async (item: SuggestionItem) => {
    const selection = item.selection.resolveDetails
      ? await item.selection.resolveDetails().catch(() => item.selection)
      : item.selection;
    if (isBroadAdministrativePrediction(selection)) return;
    const nextValue = mode === "address"
      ? getAddressInputDisplayValue(selection)
      : getListingLocationSearchValue(selection) || selection.city || selection.value;
    if (!nextValue) return;
    onChange(nextValue);
    onSuggestionSelect?.(selection);
    clear();
    setFocused(false);
  };

  const pos = showDropdown ? getPos() : null;
  const dropdown = showDropdown && pos ? (
    <div
      id={listboxId}
      ref={dropdownRef}
      style={{ position: "absolute", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
      className={cn("bg-card border border-border rounded-xl shadow-elevated overflow-hidden", dropdownClassName)}
      role="listbox"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/40">
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
        ) : (
          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {mode === "address" ? "Address Suggestions" : query ? "Location Suggestions" : "Popular Locations"}
        </span>
      </div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="option"
          aria-selected="false"
          aria-label={item.subtitle ? `${item.title}, ${item.subtitle}` : item.title}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            void selectItem(item);
          }}
          className="flex w-full items-center px-3 py-2.5 text-left hover:bg-secondary transition-colors border-b border-border last:border-0"
        >
          <MapPin className="w-3.5 h-3.5 text-muted-foreground mr-2.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
            {item.subtitle && (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.subtitle}</span>
            )}
          </span>
        </button>
      ))}
      {hasGoogleSuggestions && <GooglePlacesAttribution />}
    </div>
  ) : null;

  return (
    <div ref={wrapRef} className={cn("relative w-full", wrapperClassName)}>
      <input
        {...inputProps}
        id={inputId}
        type="text"
        name={inputProps.name ?? `${inputId}-location-autocomplete`}
        value={textValue}
        disabled={disabled}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "Escape") setFocused(false);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          if (event.defaultPrevented) return;
          const nextTarget = event.relatedTarget as Node | null;
          if (nextTarget && dropdownRef.current?.contains(nextTarget)) return;
          if (mode === "address" && items.length > 0) {
            void selectItem(items[0]);
            return;
          }
          setFocused(false);
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={showDropdown ? listboxId : undefined}
        aria-expanded={showDropdown}
        autoComplete={inputProps.autoComplete ?? "off"}
        autoCorrect={inputProps.autoCorrect ?? "off"}
        autoCapitalize={inputProps.autoCapitalize ?? "none"}
        spellCheck={inputProps.spellCheck ?? false}
        enterKeyHint={inputProps.enterKeyHint ?? (mode === "city" ? "search" : "next")}
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-form-type="other"
        className={inputClassName}
      />
      {dropdown && typeof document !== "undefined" ? ReactDOM.createPortal(dropdown, document.body) : null}
    </div>
  );
}
