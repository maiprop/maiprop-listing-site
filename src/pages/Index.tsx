import { useState, useRef, useEffect, useCallback } from "react";
import { useInView } from "@/hooks/useInView";
import ReactDOM from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  MapPin,
  ChevronDown,
  Users,
  ArrowRight,
  Gavel,
  Flame,
  ExternalLink,
  BarChart2,
  Sparkles,
  Check,
  X,
  Loader2,
  Lightbulb,
  Clock,
  TrendingUp,
  Shield,
  Zap,
  Building2,
  Star,
  Globe,
  Brain,
  Store } from
"lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { MarketTicker } from "@/components/MarketTicker";
import { PropertyCard } from "@/components/PropertyCard";
import { Footer } from "@/components/Footer";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { mockProperties } from "@/data/mockProperties";
import { PROPERTY_TYPES, PROPERTY_GROUPS, PROPERTY_TYPE_MAP, type PropertyTypeKey } from "@/lib/propertyTypes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import heroBg from "@/assets/hero-bg.jpg";

const RECENT_SEARCHES_KEY = "maiprop_recent_searches";
const MAX_RECENT = 6;

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addRecentSearch(query: string) {
  if (!query.trim()) return;
  const existing = getRecentSearches().filter((s) => s !== query);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([query, ...existing].slice(0, MAX_RECENT)));
}

function removeRecentSearch(query: string) {
  const existing = getRecentSearches().filter((s) => s !== query);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(existing));
}

// Live counts are fetched from DB in the Index component

const AI_SUGGESTIONS = [
"Quiet apartment near metro in Athens under 200k",
"3 bed villa with pool for rent in Mykonos",
"Studio with parking in Thessaloniki under 80k",
"New build energy A+ apartment in Athens"];


// ── Property Type Dropdown ─────────────────────────────────────────────────────
function PropertyTypeDropdown({ value, onChange }: {value: string;onChange: (type: string) => void;}) {
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
        openUp
      });
    }
    // Mark that we're in the process of opening so the close handler ignores this event
    isOpeningRef.current = true;
    setOpen((o) => !o);
    setTimeout(() => {
      isOpeningRef.current = false;
    }, 50);
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

  const dropdownList =
  <div
    id="type-dropdown-portal"
    style={{
      position: "absolute",
      top: pos.top,
      left: pos.left,
      minWidth: Math.max(pos.width, 230),
      zIndex: 9999
    }}
    className="bg-card border border-border rounded-xl shadow-elevated max-h-[360px] overflow-y-auto pb-2">
    
      <button
      onClick={() => {
        onChange("");
        setOpen(false);
      }}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors hover:bg-secondary ${!value ? "text-primary bg-primary/10" : "text-foreground"}`}>
      
        <Building2 className="w-4 h-4 shrink-0" />
        <span className="font-medium">All Types</span>
        {!value && <Check className="w-3.5 h-3.5 ml-auto" />}
      </button>
      <div className="h-px bg-border mx-2" />
      {PROPERTY_GROUPS.map((group, gi) =>
    <div key={group.id}>
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</span>
          </div>
          {group.id === "commercial" ?
      <button
        onClick={() => {
          onChange("commercial");
          setOpen(false);
        }}
        className={`w-full flex items-center gap-2.5 pl-5 pr-3 py-2 text-sm text-left transition-colors hover:bg-secondary ${value === "commercial" ? "text-primary bg-primary/10" : "text-foreground"}`}>
        
              <Store
          className={`w-4 h-4 shrink-0 ${value === "commercial" ? "text-primary" : "text-muted-foreground"}`} />
        
              <span className="font-medium">All Commercial & Offices</span>
              {value === "commercial" && <Check className="w-3.5 h-3.5 ml-auto" />}
            </button> :

      group.types.map((typeKey) => {
        const pt = PROPERTY_TYPE_MAP[typeKey];
        const Icon = pt.icon;
        return (
          <button
            key={pt.value}
            onClick={() => {
              onChange(pt.value);
              setOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 pl-5 pr-3 py-2 text-sm text-left transition-colors hover:bg-secondary ${value === pt.value ? "text-primary bg-primary/10" : "text-foreground"}`}>
            
                  <Icon
              className={`w-4 h-4 shrink-0 ${value === pt.value ? "text-primary" : "text-muted-foreground"}`} />
            
                  <span className="font-medium">{pt.label}</span>
                  {value === pt.value && <Check className="w-3.5 h-3.5 ml-auto" />}
                </button>);

      })
      }
          {gi < PROPERTY_GROUPS.length - 1 && <div className="h-px bg-border mx-2 mt-1.5" />}
        </div>
    )}
    </div>;


  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={openDropdown}
        className={`flex items-center gap-2 bg-secondary/60 rounded-xl px-4 py-3 h-full cursor-pointer hover:bg-secondary transition-colors whitespace-nowrap ${value ? "text-primary" : "text-muted-foreground"}`}>
        
        {TypeIcon ? <TypeIcon className="w-4 h-4 shrink-0" /> : <Building2 className="w-4 h-4 shrink-0" />}
        <span className="text-sm font-medium">{currentType?.label ?? "Property type"}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && ReactDOM.createPortal(dropdownList, document.body)}
    </div>);

}

// ── AI Search Modal ────────────────────────────────────────────────────────────
function AISearchModal({
  onFiltersApplied,
  onClose



}: {onFiltersApplied: (f: Record<string, any>) => void;onClose: () => void;}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSearch = async (q?: string) => {
    const searchQuery = (q ?? query).trim();
    if (!searchQuery) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-search", { body: { query: searchQuery } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      onFiltersApplied(data);
      onClose();
    } catch (e: any) {
      toast.error(e.message || "AI search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-20 px-4 bg-background/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}>
      
      <div className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-elevated overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-primary/5">
          <Sparkles className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="font-display font-semibold text-sm">AI Property Search</p>
            <p className="text-[11px] text-muted-foreground">Describe what you're looking for in plain language</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3 border border-border focus-within:border-primary transition-colors">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
                if (e.key === "Escape") onClose();
              }}
              placeholder="e.g. quiet apartment near metro in Athens under 200k..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              disabled={loading} />
            
            <button
              onClick={() => handleSearch()}
              disabled={loading || !query.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 transition-opacity">
              
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Lightbulb className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground font-medium">Try these examples</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {AI_SUGGESTIONS.map((s) =>
              <button
                key={s}
                onClick={() => {
                  setQuery(s);
                  handleSearch(s);
                }}
                disabled={loading}
                className="px-2.5 py-1.5 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50 text-left">
                
                  {s}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>);

}

// ── Location Input ─────────────────────────────────────────────────────────────
function LocationInput({
  value,
  onChange,
  onSearch




}: {value: string;onChange: (v: string) => void;onSearch: () => void;}) {
  const [focused, setFocused] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const refresh = useCallback(() => setRecents(getRecentSearches()), []);

  // Compute portal position live from the DOM ref each render — no stale-state race
  const getPos = () => {
    if (!wrapRef.current) return { top: 0, left: 0, width: 300 };
    const r = wrapRef.current.getBoundingClientRect();
    return { top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width };
  };

  useEffect(() => {
    refresh();
    const handler = (e: MouseEvent) => {
      const portal = document.getElementById("location-dropdown-portal");
      if (wrapRef.current?.contains(e.target as Node)) return;
      if (portal?.contains(e.target as Node)) return;
      setFocused(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [refresh]);

  const showDropdown = focused && recents.length > 0 && !value;
  const pos = showDropdown ? getPos() : null;

  const dropdown =
  showDropdown && pos ?
  <div
    id="location-dropdown-portal"
    style={{ position: "absolute", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
    className="bg-card border border-border rounded-2xl shadow-elevated overflow-hidden">
    
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary/40">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Searches</span>
        </div>
        {recents.map((r) =>
    <div
      key={r}
      className="flex items-center group px-4 py-2.5 hover:bg-secondary transition-colors cursor-pointer"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onChange(r);
        setFocused(false);
        onSearch();
      }}>
      
            <Clock className="w-3.5 h-3.5 text-muted-foreground mr-3 shrink-0" />
            <span className="flex-1 text-sm text-foreground truncate">{r}</span>
            <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={(ev) => {
          ev.stopPropagation();
          removeRecentSearch(r);
          refresh();
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-border transition-all text-muted-foreground hover:text-foreground">
        
              <X className="w-3 h-3" />
            </button>
          </div>
    )}
      </div> :
  null;

  return (
    <div ref={wrapRef} className="flex-1 min-w-0 relative">
      <div className="flex items-center gap-2 px-4 py-2.5 h-full min-h-[44px]">
        <MapPin className="w-4 h-4 text-primary shrink-0" />
        <input
          type="text"
          placeholder="City, area, or neighbourhood..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            refresh();
            setFocused(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setFocused(false);
              onSearch();
            }
            if (e.key === "Escape") setFocused(false);
          }}
          className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground outline-none min-w-0" />
        
        {value &&
        <button
          onClick={() => onChange("")}
          className="text-muted-foreground hover:text-foreground transition-colors">
          
            <X className="w-3.5 h-3.5" />
          </button>
        }
      </div>
      {dropdown && ReactDOM.createPortal(dropdown, document.body)}
    </div>);

}

// ── OS Dashboard Mockup (faithful to os.maiprop.co) ──────────────────────────
function OSDashboardMockup() {
  const [flickeringIdx, setFlickeringIdx] = useState<number | null>(null);
  const [prices, setPrices] = useState([2860, 1920, 6450, 3772, 2290, 5120, 4180]);

  useEffect(() => {
    const basePrices = [2860, 1920, 6450, 3772, 2290, 5120, 4180];
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const idx = Math.floor(Math.random() * basePrices.length);
      const base = basePrices[idx];
      const delta = Math.round(base * (0.001 + Math.random() * 0.003) * (Math.random() > 0.35 ? 1 : -1));
      setPrices((prev) => prev.map((p, i) => i === idx ? p + delta : p));
      setFlickeringIdx(idx);
      setTimeout(() => setFlickeringIdx(null), 700);
      timer = setTimeout(tick, 2800 + Math.random() * 600);
    };
    timer = setTimeout(tick, 1500);
    return () => clearTimeout(timer);
  }, []);

  const marketData = [
  { city: "Athens", delta: "▲1.3%" },
  { city: "Thessaloniki", delta: "▲0.8%" },
  { city: "Mykonos", delta: "▲2.3%" },
  { city: "Glyfada", delta: "▲1.7%" },
  { city: "Rhodes", delta: "▲3.1%" },
  { city: "Santorini", delta: "▲1.9%" },
  { city: "Kifisia", delta: "▲0.6%" }];

  const sparklines = [
  "M0,10 C5,8 10,6 15,4 C20,2 25,5 30,2",
  "M0,8 C5,10 10,7 15,9 C20,5 25,3 30,4",
  "M0,10 C5,9 10,6 15,7 C20,4 25,2 30,1",
  "M0,9 C5,7 10,8 15,5 C20,6 25,4 30,3",
  "M0,10 C5,8 10,11 15,7 C20,5 25,6 30,3",
  "M0,9 C5,6 10,7 15,5 C20,8 25,4 30,2",
  "M0,10 C5,9 10,8 15,9 C20,7 25,8 30,9"];

  return (
    <div className="w-full h-full overflow-hidden select-none font-sans" style={{ background: "hsl(220 30% 7%)" }}>
      {/* Navbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.08)", background: "hsl(220 30% 5%)" }}>
        <div className="flex items-center gap-3">
          <div className="text-[10px] font-black tracking-tight flex items-center gap-1" style={{ color: "hsl(183 100% 50%)" }}>
            mAI Prop
            <span className="text-[7px] font-black ml-0.5 px-1 rounded-sm" style={{ background: "hsl(183 100% 50% / 0.15)", color: "hsl(183 100% 70%)" }}>OS</span>
          </div>
          <div className="flex gap-1.5">
            {["Modules", "Benefits", "Pricing", "Resources"].map((t) =>
            <span key={t} className="text-[7px] px-1.5 py-0.5 rounded" style={{ color: "rgba(255,255,255,0.4)" }}>{t}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[7px] px-2 py-1 rounded-full font-bold" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>START FOR FREE</div>
          <div className="text-[7px] px-2 py-1 rounded-full font-bold" style={{ background: "hsl(183 100% 50% / 0.15)", color: "hsl(183 100% 50%)", border: "1px solid hsl(183 100% 50% / 0.3)" }}>SIGN IN</div>
        </div>
      </div>
      {/* Hero + Market Widget */}
      <div className="flex h-[calc(100%-36px)]">
        {/* Left: Hero text */}
        <div className="flex-1 px-5 pt-5 pb-3 flex flex-col justify-center">
          <div className="text-[13px] font-black leading-snug mb-2" style={{ color: "rgba(255,255,255,0.9)" }}>
            Real Estate<br />
            <span style={{ color: "hsl(183 100% 50%)" }}>Investment Platform</span>
          </div>
          <p className="text-[7px] mb-2.5" style={{ color: "hsl(183 100% 70%)" }}>Gain The Edge In Greek Real Estate Market With:</p>
          <div className="space-y-1.5 mb-4">
            {["Data Accessibility", "Predictive Analytics", "Mapped Data & Automated Reports", "Portfolio & Asset Management", "Auctions Analysis & Automations"].map((f) =>
            <div key={f} className="flex items-center gap-1.5 text-[7px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                <div className="w-2.5 h-2.5 rounded-full border flex items-center justify-center shrink-0" style={{ borderColor: "hsl(183 100% 50% / 0.5)" }}>
                  <div className="w-1 h-1 rounded-full" style={{ background: "hsl(183 100% 50%)" }} />
                </div>
                {f}
              </div>
            )}
          </div>
          <div className="inline-flex items-center gap-1.5 text-[7px] font-bold px-3 py-1.5 rounded-full w-fit" style={{ background: "hsl(183 100% 50% / 0.12)", border: "1px solid hsl(183 100% 50% / 0.35)", color: "hsl(183 100% 60%)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "hsl(183 100% 50%)" }} />
            SEE IT IN ACTION
          </div>
        </div>
        {/* Right: Live Market widget */}
        <div className="w-44 shrink-0 mr-4 mt-4 mb-4 rounded-xl overflow-hidden border flex flex-col" style={{ background: "hsl(220 30% 10%)", borderColor: "rgba(255,255,255,0.1)" }}>
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "hsl(183 100% 50%)" }} />
              <span className="text-[7px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>Live Market</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "hsl(183 100% 50%)" }} />
              <span className="text-[6px] font-bold" style={{ color: "hsl(183 100% 60%)" }}>LIVE</span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {marketData.map((row, i) => {
              const isFlick = flickeringIdx === i;
              return (
                <div key={row.city} className="flex items-center gap-1 px-2.5 py-[3px] border-b last:border-0 transition-all duration-300"
                style={{ borderColor: "rgba(255,255,255,0.04)", background: isFlick ? "rgba(0,255,240,0.07)" : "transparent" }}>
                  <span className="text-[7px] w-16 truncate transition-colors duration-300" style={{ color: isFlick ? "hsl(183 100% 75%)" : "rgba(255,255,255,0.7)" }}>{row.city}</span>
                  <svg viewBox="0 0 30 12" className="w-7 h-2.5 shrink-0" preserveAspectRatio="none">
                    <path d={sparklines[i]} fill="none" stroke="hsl(183 100% 50%)" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <span className="text-[7px] font-bold ml-auto transition-colors duration-300" style={{ color: isFlick ? "hsl(183 100% 70%)" : "rgba(255,255,255,0.9)" }}>
                    {prices[i].toLocaleString()}
                  </span>
                  <span className="text-[6px] font-bold w-8 text-right" style={{ color: "hsl(142 70% 55%)" }}>{row.delta}</span>
                </div>);

            })}
          </div>
          <div className="mx-2 my-1.5 rounded-lg px-2 py-1.5 border" style={{ background: "hsl(183 100% 50% / 0.06)", borderColor: "hsl(183 100% 50% / 0.15)" }}>
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1">
                <span className="text-[8px]">⚡</span>
                <span className="text-[6px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>New Auctions Today</span>
              </div>
              <span className="text-[11px] font-black" style={{ color: "hsl(183 100% 60%)" }}>47</span>
            </div>
            <div className="text-[6px]" style={{ color: "rgba(255,255,255,0.35)" }}>Latest: <span style={{ color: "rgba(255,255,255,0.6)" }}>Apartment · Athens</span></div>
            <div className="text-[7px] font-bold mt-0.5" style={{ color: "hsl(183 100% 50%)" }}>€128,000</div>
          </div>
          <div className="text-center pb-1.5">
            <span className="text-[5.5px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>€/m² · Greek Real Estate Index</span>
          </div>
        </div>
      </div>
    </div>);

}

// ── Properties Portal Mockup (faithful to properties.maiprop.co) ──────────────
function PropertiesMockup() {
  const stats = [
  { value: "€250K", label: "Minimum Investment" },
  { value: "6-9 Months", label: "To Visa Approval" },
  { value: "27 Countries", label: "Schengen Access" }];

  return (
    <div className="w-full h-full overflow-hidden select-none font-sans relative" style={{ background: "hsl(210 30% 8%)" }}>
      {/* Hero bg: Acropolis */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1555993539-1732b0258235?w=600&q=50&fm=webp"
          alt=""
          className="w-full h-full object-cover opacity-30" />
        
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, hsl(200 40% 12% / 0.75) 0%, hsl(200 40% 6% / 0.95) 100%)" }} />
      </div>
      {/* Navbar */}
      <div className="relative z-10 flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded overflow-hidden flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
            <span className="text-[6px] font-black" style={{ color: "hsl(183 100% 60%)" }}>mP</span>
          </div>
          <span className="text-[9px] font-black text-white">mAI prop</span>
        </div>
        <div className="flex items-center gap-2">
          {["Benefits", "Opportunities", "Track Record", "mAI Prop OS"].map((l) =>
          <span key={l} className="text-[6px]" style={{ color: "rgba(255,255,255,0.5)" }}>{l}</span>
          )}
        </div>
        <div className="text-[7px] font-bold px-2.5 py-1 rounded-full" style={{ background: "hsl(183 100% 50%)", color: "hsl(220 30% 8%)" }}>
          Get Started
        </div>
      </div>
      {/* Hero content */}
      <div className="relative z-10 px-5 pt-3">
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full mb-3 border text-[5.5px] font-bold uppercase tracking-wider" style={{ borderColor: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.06)" }}>
          Greek Golden Visa Program | EU Residency Through Real Estate
        </div>
        <h2 className="text-[14px] font-black leading-snug mb-2">
          <span className="text-white">Secure Your European</span><br />
          <span style={{ color: "hsl(183 100% 60%)" }}>Golden </span>
          <span style={{ color: "hsl(265 80% 72%)" }}>Visa in Greece</span>
        </h2>
        <p className="text-[7.5px] mb-1" style={{ color: "rgba(255,255,255,0.65)" }}>EU residency through €250K+ Greek real estate investments.</p>
        <p className="text-[7px] italic mb-3.5" style={{ color: "rgba(255,255,255,0.4)" }}>Live freely, invest wisely, and protect your global future.</p>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="inline-flex items-center gap-1 text-[7.5px] font-bold px-3 py-1.5 rounded-full" style={{ background: "hsl(183 100% 50%)", color: "hsl(220 30% 8%)" }}>
            Start Your Golden Visa →
          </div>
          <div className="text-[7px] font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>View Properties</div>
        </div>
        <div className="flex gap-6">
          {stats.map((s) =>
          <div key={s.value}>
              <div className="text-[12px] font-black text-white">{s.value}</div>
              <div className="text-[6px]" style={{ color: "rgba(255,255,255,0.4)" }}>{s.label}</div>
            </div>
          )}
        </div>
      </div>
    </div>);

}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Index() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("Buy");
  const [selectedPropertyType, setSelectedPropertyType] = useState("");
  const [showAI, setShowAI] = useState(false);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});

  // Fetch live listing counts grouped by property_type
  useEffect(() => {
    supabase.
    from("listings").
    select("property_type").
    eq("status", "active").
    then(({ data }) => {
      if (!data) return;
      const counts: Record<string, number> = {};
      data.forEach((row) => {
        const k = row.property_type as string;
        counts[k] = (counts[k] || 0) + 1;
      });
      setTypeCounts(counts);
    });
  }, []);

  // Scroll-reveal refs
  const { ref: browseRef, inView: browseInView } = useInView();
  const { ref: featuredRef, inView: featuredInView } = useInView();
  const { ref: auctionsRef, inView: auctionsInView } = useInView();
  const { ref: firesaleRef, inView: firesaleInView } = useInView();
  const { ref: locationsRef, inView: locationsInView } = useInView();
  const { ref: prosRef, inView: prosInView } = useInView();
  const { ref: osRef, inView: osInView } = useInView();
  const { ref: goldenRef, inView: goldenInView } = useInView();
  const { ref: trustRef, inView: trustInView } = useInView();

  const listingTypeMap: Record<string, string> = {
    Buy: "sale",
    Rent: "rent",
    Auctions: "auction",
    "Quick Sale": "firesale"
  };

  const handleSearch = () => {
    const lt = listingTypeMap[searchType];
    if (lt === "firesale") {
      navigate("/firesale");
      return;
    }
    if (lt === "auction") {
      navigate("/auctions");
      return;
    }
    if (searchQuery.trim()) addRecentSearch(searchQuery.trim());
    const params = new URLSearchParams();
    if (searchQuery) params.set("city", searchQuery);
    if (selectedPropertyType) params.set("type", selectedPropertyType);
    if (lt) params.set("listing_type", lt);
    navigate(`/listings?${params.toString()}`);
  };

  const handleAIFilters = (filters: Record<string, any>) => {
    const params = new URLSearchParams();
    if (filters.city) params.set("city", filters.city);
    if (filters.listing_type) params.set("listing_type", filters.listing_type);
    if (filters.property_type) params.set("type", filters.property_type);
    if (filters.price_min != null || filters.price_max != null)
    params.set("price", `${filters.price_min ?? 0}-${filters.price_max ?? 9999999}`);
    if (filters.beds_min) params.set("beds_min", String(filters.beds_min));
    if (filters.sqm_min) params.set("sqm_min", String(filters.sqm_min));
    if (filters.features?.length) params.set("features", filters.features.join(","));
    navigate(`/listings?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {showAI && <AISearchModal onFiltersApplied={handleAIFilters} onClose={() => setShowAI(false)} />}
      <CookieConsentBanner />

      {/* ══ HERO ══════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[100svh] sm:min-h-[92vh] flex items-center overflow-hidden pt-16">
        {/* Background */}
        <div className="absolute inset-0">
          {/* Light mode: show more of the actual photo — lower opacity overlay */}
          <img src={heroBg} alt="Athens skyline" className="w-full h-full object-cover opacity-100 dark:opacity-70" />
          {/* Both modes: strong dark-left gradient so white text is always readable */}
          <div
            className="absolute inset-0"
            style={{
              background:
              "linear-gradient(120deg, hsl(25 20% 6% / 0.82) 0%, hsl(25 15% 8% / 0.55) 55%, hsl(30 10% 10% / 0.12) 100%)"
            }} />
          
          <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
        </div>
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
            "linear-gradient(hsl(192 100% 50%) 1px, transparent 1px), linear-gradient(90deg, hsl(192 100% 50%) 1px, transparent 1px)",
            backgroundSize: "60px 60px"
          }} />
        
        {/* Glow orb */}
        <div
          className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full blur-[120px] opacity-10"
          style={{ background: "radial-gradient(hsl(192 100% 50%), hsl(270 75% 62%), transparent 70%)" }} />
        

        <div className="container relative z-10 py-10 sm:py-16 lg:pl-16 xl:pl-24">
          <div className="grid lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-8 lg:gap-12 items-center">
            {/* ── LEFT: Copy + Search ── */}
            <div className="text-white">
              {/* Eyebrow */}
              <div className="relative inline-flex mb-5 sm:mb-7 animate-fade-in-up" style={{ animationDelay: "0s" }}>
                {/* Glow ring */}
                <span className="absolute inset-0 rounded-full animate-pulse" style={{ boxShadow: "0 0 0 4px hsl(192 100% 50% / 0.18), 0 0 18px 4px hsl(192 100% 50% / 0.12)" }} />
                <div className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 border border-white/30 backdrop-blur-sm">
                  <span className="relative flex w-2 h-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-300 opacity-60" />
                    <span className="relative inline-flex rounded-full w-2 h-2 bg-cyan-300" />
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-white">
                    Greece's #1 AI-Powered Property Platform
                  </span>
                </div>
              </div>

              {/* Headline */}
              <h1
                className="font-display font-black leading-[1.05] mb-4 sm:mb-6 animate-fade-in-up text-white text-5xl"
                style={{ fontSize: "clamp(2rem, 8vw, 4.5rem)", animationDelay: "0.08s" }}>
                
                Find your perfect
                <br className="hidden sm:block" /> property in Greece
                <br />
                <span className="gradient-text-primary">with AI precision</span>
              </h1>

              





              

              {/* ── Search Card ── */}
              <div className="animate-fade-in-up" style={{ animationDelay: "0.28s" }}>
                <div
                  className="bg-card/85 backdrop-blur-2xl border border-border/70 rounded-2xl shadow-elevated overflow-visible"
                  style={{
                    boxShadow:
                    "0 12px 48px -8px hsl(var(--primary) / 0.2), 0 2px 0 0 hsl(var(--primary) / 0.08), inset 0 1px 0 0 hsl(var(--foreground) / 0.04)"
                  }}>
                  
                  {/* Tabs — scrollable on mobile */}
                  <div className="flex gap-0.5 px-2 pt-2.5 overflow-x-auto scrollbar-none">
                    {[
                    { label: "Buy", emoji: "🏠", color: "" },
                    { label: "Rent", emoji: "🔑", color: "" },
                    { label: "Auctions", emoji: "⚖️", color: "" },
                    { label: "Quick Sale", emoji: "⚡", color: "text-destructive" }].
                    map(({ label, emoji, color }) =>
                    <button
                      key={label}
                      onClick={() => setSearchType(label)}
                      className={`flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                      searchType === label ?
                      "bg-primary text-primary-foreground shadow-sm" :
                      `${color || "text-muted-foreground"} hover:text-foreground hover:bg-secondary/80`}`
                      }>
                      
                        <span className="text-sm sm:text-base leading-none">{emoji}</span>
                        <span>{label}</span>
                      </button>
                    )}
                  </div>

                  <div className="mx-3 mt-2 h-px bg-border/50" />

                  {/* Search row — stacks on mobile */}
                  <div className="p-2 flex flex-col sm:flex-row gap-2 sm:gap-0 sm:items-stretch">
                    <div className="flex-1 min-w-0">
                      <LocationInput value={searchQuery} onChange={setSearchQuery} onSearch={handleSearch} />
                    </div>
                    <div className="hidden sm:block w-px bg-border/50 mx-1 self-stretch my-1" />
                    <PropertyTypeDropdown value={selectedPropertyType} onChange={setSelectedPropertyType} />
                    <div className="hidden sm:block w-px bg-border/50 mx-1 self-stretch my-1" />
                    {/* AI + Search on same row on mobile */}
                    <div className="flex gap-2 sm:contents">
                      <button
                        onClick={() => setShowAI(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all text-primary hover:bg-primary/10 shrink-0 whitespace-nowrap border border-border sm:border-0">
                        
                        <Sparkles className="w-4 h-4" />
                        <span>AI Search</span>
                      </button>
                      <Button
                        size="lg"
                        onClick={handleSearch}
                        className="flex-1 sm:flex-none bg-primary hover:opacity-90 border-0 text-primary-foreground rounded-xl px-6 font-semibold shrink-0 sm:ml-1">
                        
                        <Search className="w-4 h-4 mr-2" />
                        Search
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats — 2-col grid on mobile */}
            </div>

            {/* ── RIGHT: Live Market Ticker Card ── */}
            <div className="hidden lg:block animate-fade-in-up relative" style={{ animationDelay: "0.25s" }}>
              <div
                className="absolute -inset-6 rounded-3xl blur-3xl opacity-15"
                style={{ background: "radial-gradient(ellipse, hsl(192 100% 50%), hsl(270 75% 62%), transparent 70%)" }} />
              
              <div className="relative">
                <MarketTicker />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ BROWSE BY TYPE ══════════════════════════════════════════════════ */}
      <section className="py-14 bg-secondary">
        <div ref={browseRef} className="container">
          <div className={`flex items-center justify-between mb-7 reveal ${browseInView ? "in-view" : ""}`}>
            <div>
              <h2 className="font-display text-2xl font-bold">Browse by Type</h2>
              <p className="text-sm text-muted-foreground mt-1">Find exactly what you're looking for</p>
            </div>
            <Link to="/listings" className="text-sm text-primary hover:underline flex items-center gap-1">
              All listings <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {/* ── ROW 1: Primary types — Apartment, Land, New Development (big) */}
          <div className={`grid grid-cols-3 gap-3 reveal reveal-delay-1 ${browseInView ? "in-view" : ""}`}>
            {/* Apartment */}
            {PROPERTY_TYPES.filter((t) => ["apartment", "land"].includes(t.value)).map((type) =>
            <Link key={type.value} to={`/listings?type=${type.value}`}>
                <div className="relative glass-card rounded-xl p-4 flex flex-col items-center text-center hover:border-primary/40 hover:bg-primary/5 transition-all group gap-2 cursor-pointer overflow-hidden">
                  <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-primary/30 animate-pulse" />
                  <div className={`w-12 h-12 rounded-xl ${type.bgClass} flex items-center justify-center text-2xl group-hover:scale-110 transition-transform`}>
                    {type.emoji}
                  </div>
                  <div className="font-display font-semibold text-xs group-hover:text-primary transition-colors">{type.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {typeCounts[type.value] ? `${typeCounts[type.value].toLocaleString()} listings` : "—"}
                  </div>
                </div>
              </Link>
            )}

            {/* New Development — featured card */}
            <Link to="/listings?construction_status=new_build">
              <div className="relative glass-card rounded-xl p-4 flex flex-col items-center text-center hover:border-primary/50 hover:bg-primary/8 transition-all group gap-2 cursor-pointer overflow-hidden border-primary/20">
                <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-primary/40 animate-pulse" />
                {/* NEW badge */}
                <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-primary text-primary-foreground leading-tight tracking-wide">NEW</span>
                <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  🏗️
                </div>
                <div className="font-display font-semibold text-xs group-hover:text-primary transition-colors">New Development</div>
                <div className="text-[10px] text-muted-foreground">Off-plan &amp; new builds</div>
              </div>
            </Link>
          </div>


          {/* ── ROW 3: Commercial subtypes — Retail Shop, Office, Mixed-Use (big icons) */}
          <div className={`mt-5 grid grid-cols-3 gap-3 reveal reveal-delay-2 ${browseInView ? "in-view" : ""}`}>
            {[
            { label: "Retail Shop", emoji: "🛍️", sub: "shop", bg: "bg-accent/10", animated: true },
            { label: "Mixed-Use", emoji: "🔀", sub: "mixed_use", bg: "bg-primary/10", animated: true },
            { label: "Coworking", emoji: "🤝", sub: "office_coworking", bg: "bg-brand-cyan/10", animated: false }].
            map((item) =>
            <Link key={item.sub} to={`/listings?type=commercial&subtype=${item.sub}`}>
                <div className={`relative glass-card rounded-xl p-4 flex flex-col items-center text-center hover:border-accent/40 hover:bg-accent/5 transition-all group gap-2 cursor-pointer${item.animated ? " overflow-hidden" : ""}`}>
                  {item.animated &&
                <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-accent/40 animate-pulse" />
                }
                  <div className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center text-2xl group-hover:scale-110 transition-transform`}>
                    {item.emoji}
                  </div>
                  <div className="font-display font-semibold text-xs group-hover:text-accent transition-colors">{item.label}</div>
                </div>
              </Link>
            )}
          </div>

          {/* ── More Commercial chips */}
          <div className={`mt-4 reveal reveal-delay-2 ${browseInView ? "in-view" : ""}`}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">More Commercial</p>
            <div className="flex flex-wrap gap-2">
              {[
              { label: "📦 Warehouse", sub: "warehouse" },
              { label: "🍽️ Restaurant / Café", sub: "restaurant" },
              { label: "🏨 Hotel / B&B", sub: "hotel" },
              { label: "🔬 Clinic / Medical", sub: "clinic" },
              { label: "🏗️ Industrial Space", sub: "industrial" },
              { label: "🖼️ Showroom", sub: "showroom" },
              { label: "🎪 Hall / Event Space", sub: "hall" },
              { label: "🏛️ Business Centre", sub: "office_business" }].
              map((item) =>
              <Link key={item.sub} to={`/listings?type=commercial&subtype=${item.sub}`}>
                  <div className="glass-card rounded-xl px-3.5 py-2 text-xs font-medium hover:border-accent/40 hover:bg-accent/5 hover:text-accent transition-all cursor-pointer whitespace-nowrap">
                    {item.label}
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ══ FEATURED PROPERTIES ══════════════════════════════════════════════ */}
      <section className="py-16 bg-background">
        <div ref={featuredRef} className="container">
          <div className={`flex items-center justify-between mb-8 reveal ${featuredInView ? "in-view" : ""}`}>
            <div>
              <h2 className="font-display text-2xl font-bold">Featured Properties</h2>
              <p className="text-sm text-muted-foreground mt-1">Premium & verified listings</p>
            </div>
            <Button variant="outline" className="border-border" asChild>
              <Link to="/listings">View All</Link>
            </Button>
          </div>
          <div
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 reveal reveal-delay-1 ${featuredInView ? "in-view" : ""}`}>
            
            {mockProperties.
            filter((p) => p.isFeatured || p.isPremium).
            slice(0, 4).
            map((property) =>
            <PropertyCard key={property.id} property={property} />
            )}
          </div>
        </div>
      </section>

      {/* ══ AUCTIONS ════════════════════════════════════════════════════════ */}
      <section className="py-16 bg-secondary">
        <div ref={auctionsRef} className="container">
          <div className={`flex items-center justify-between mb-8 reveal ${auctionsInView ? "in-view" : ""}`}>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Gavel className="w-5 h-5 text-brand-gold" />
                <span className="text-xs font-semibold text-brand-gold uppercase tracking-widest">Greek Auctions</span>
              </div>
              <h2 className="font-display text-2xl font-bold">This Week's Auctions</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Judicial & bank repo auctions — live from Greek courts
              </p>
            </div>
            <Button variant="outline" className="border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10" asChild>
              <Link to="/auctions">
                All Auctions <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
            </Button>
          </div>
          <div
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 reveal reveal-delay-1 ${auctionsInView ? "in-view" : ""}`}>
            
            {mockProperties.
            filter((p) => p.listingType === "auction").
            map((property) =>
            <PropertyCard key={property.id} property={property} />
            )}
          </div>
        </div>
      </section>

      {/* ══ QUICK SALE CTA ══════════════════════════════════════════════════ */}
      <section className="py-10 sm:py-16 bg-background">
        <div ref={firesaleRef} className="container">
          <div
            className={`relative rounded-3xl overflow-hidden bg-card border border-border reveal ${firesaleInView ? "in-view" : ""}`}>
            
            <div
              className="absolute inset-0"
              style={{ background: "radial-gradient(ellipse at 80% 50%, hsl(0 72% 55% / 0.12) 0%, transparent 60%)" }} />
            
            <div
              className="absolute inset-0"
              style={{ background: "radial-gradient(ellipse at 20% 50%, hsl(192 100% 50% / 0.05) 0%, transparent 50%)" }} />
            
            <div className="relative p-6 sm:p-10 md:p-16 grid md:grid-cols-2 gap-6 sm:gap-8 items-center">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Flame className="w-5 h-5 text-destructive flame-flicker" />
                  <span className="text-xs font-bold text-destructive uppercase tracking-widest">
                    Quick Sale™ Instant Offer
                  </span>
                </div>
                <h2 className="font-display text-2xl sm:text-4xl font-bold mb-4">
                  Sell Your Property <br />
                  <span className="gradient-text-primary">in 96 Hours</span>
                </h2>
                <p className="text-muted-foreground mb-6 text-sm sm:text-base">
                  Get a guaranteed cash offer for your property powered by our AI valuation engine. No waiting, no
                  stress.
                </p>
                <Button
                  size="lg"
                  className="w-full sm:w-auto bg-gradient-primary border-0 text-primary-foreground"
                  asChild>
                  
                  <Link to="/firesale">
                    Get Instant Offer <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {[
                { value: "96h", label: "Average Closing" },
                { value: "100%", label: "Cash Offers" },
                { value: "Active", label: "Buyers" },
                { value: "AI", label: "Valuation Engine" }].
                map((item) =>
                <div key={item.label} className="glass-card rounded-xl p-3 sm:p-4 text-center">
                    <div className="font-display text-xl sm:text-2xl font-bold gradient-text-cyan">{item.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ POPULAR LOCATIONS ════════════════════════════════════════════════ */}
      <section className="py-16 bg-secondary">
        <div ref={locationsRef} className="container">
          <div className={`flex items-center justify-between mb-8 reveal ${locationsInView ? "in-view" : ""}`}>
            <h2 className="font-display text-2xl font-bold">Popular Locations</h2>
            <Link to="/listings" className="text-sm text-primary hover:underline flex items-center gap-1">
              Explore All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div
            className={`grid grid-cols-2 lg:grid-cols-4 gap-4 reveal reveal-delay-1 ${locationsInView ? "in-view" : ""}`}>
            
            {[
            {
              name: "Athens",
              listings: 24860,
              trend: "+1.2%",
              image: "https://images.unsplash.com/photo-1555993539-1732b0258235?w=600&q=80"
            },
            {
              name: "Thessaloniki",
              listings: 8240,
              trend: "+0.8%",
              image: "https://images.unsplash.com/photo-1570939274717-7eda259b50ed?w=600&q=80"
            },
            {
              name: "Mykonos",
              listings: 1820,
              trend: "+2.3%",
              image: "https://images.unsplash.com/photo-1533104816931-20fa691ff6ca?w=600&q=80"
            },
            {
              name: "Santorini",
              listings: 1240,
              trend: "+1.9%",
              image: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=600&q=80"
            }].
            map((city) =>
            <Link key={city.name} to={`/listings?city=${city.name}`}>
                <div className="relative rounded-xl overflow-hidden aspect-[3/4] group">
                  <img
                  src={city.image}
                  alt={city.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                  <div className="absolute bottom-4 left-4">
                    <div className="font-display font-bold text-lg">{city.name}</div>
                    <div className="text-xs text-muted-foreground">{city.listings.toLocaleString()} listings</div>
                    <div className="text-xs text-brand-emerald font-semibold">{city.trend}</div>
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ══ PROFESSIONALS CTA ════════════════════════════════════════════════ */}
      <section className="py-20 bg-background">
        <div ref={prosRef} className="container">
          <div
            className={`relative rounded-3xl overflow-hidden border border-accent/20 bg-foreground dark:bg-[hsl(265_40%_7%)] reveal ${prosInView ? "in-view" : ""}`}>
            
            <div
              className="absolute top-0 left-0 w-80 h-80 rounded-full blur-3xl opacity-20"
              style={{ background: "radial-gradient(hsl(265 80% 60%), transparent 70%)" }} />
            
            <div
              className="absolute bottom-0 right-0 w-80 h-80 rounded-full blur-3xl opacity-15"
              style={{ background: "radial-gradient(hsl(183 100% 42%), transparent 70%)" }} />
            
            <div className="relative p-10 md:p-14 lg:p-16 text-background">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 className="font-display text-4xl lg:text-5xl font-bold leading-tight mb-4 text-destructive-foreground">
                    The right expert,
                    <br />
                    <span className="gradient-text-cyan">one click away</span>
                  </h2>

                  <Button
                    size="lg"
                    className="bg-gradient-accent border-0 text-accent-foreground font-semibold px-8 gap-2"
                    asChild>
                    
                    <Link to="/professionals">
                      Explore Directory <ArrowRight className="w-4 h-4" />
                    </Link>
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                  {
                    emoji: "🏛️",
                    title: "Architects",
                    count: "340+",
                    color: "text-primary",
                    border: "border-primary/30",
                    bg: "bg-primary/15"
                  },
                  {
                    emoji: "⚖️",
                    title: "Lawyers",
                    count: "180+",
                    color: "text-brand-gold",
                    border: "border-brand-gold/30",
                    bg: "bg-brand-gold/15"
                  },
                  {
                    emoji: "📋",
                    title: "Notaries",
                    count: "95+",
                    color: "text-brand-emerald",
                    border: "border-brand-emerald/30",
                    bg: "bg-brand-emerald/15"
                  },
                  {
                    emoji: "🔧",
                    title: "Engineers",
                    count: "520+",
                    color: "text-accent",
                    border: "border-accent/30",
                    bg: "bg-accent/15"
                  },
                  {
                    emoji: "🏗️",
                    title: "Contractors",
                    count: "410+",
                    color: "text-brand-purple",
                    border: "border-brand-purple/30",
                    bg: "bg-brand-purple/15"
                  },
                  {
                    emoji: "🏡",
                    title: "Property Mgrs",
                    count: "230+",
                    color: "text-brand-sky",
                    border: "border-brand-sky/30",
                    bg: "bg-brand-sky/15"
                  }].
                  map((pro) =>
                  <Link key={pro.title} to="/professionals">
                      <div
                      className={`group flex items-center gap-3 p-4 rounded-2xl bg-background/10 border ${pro.border} hover:bg-background/20 transition-all`}>
                      
                        <div
                        className={`w-10 h-10 rounded-xl ${pro.bg} flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform`}>
                        
                          {pro.emoji}
                        </div>
                        <div>
                          <div className={`font-bold text-sm ${pro.color}`}>{pro.title}</div>
                          <div className="text-xs text-background/60">{pro.count} verified</div>
                        </div>
                      </div>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ mAI PROP OS ═════════════════════════════════════════════════════ */}
      <section className="py-20 bg-secondary overflow-hidden">
        <div ref={osRef} className="container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Copy */}
            <div className={`reveal ${osInView ? "in-view" : ""}`}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-5">
                <BarChart2 className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                  Powered by mAI Prop OS
                </span>
              </div>
              <h2 className="font-display text-4xl font-bold leading-tight mb-4">
                Greece's Real Estate <br />
                <span className="gradient-text-primary">Data Gateway</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Every data on mAI prop is powered by mAI prop OS — our proprietary data platform aggregating Greek
                cadastre records, judicial auctions, price indices, and predictive analytics into one live dashboard.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                "Real-time €/m² indices for every Greek region",
                "3,200+ monthly judicial & bank auctions",
                "AI-powered investment scoring & portfolio tools",
                "Automated property reports in minutes"].
                map((item) =>
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    {item}
                  </li>
                )}
              </ul>
              <div className="flex gap-3">
                <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2 glow-cyan" asChild>
                  <a href="https://os.maiprop.co" target="_blank" rel="noreferrer">
                    Open mAI Prop OS <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              </div>
            </div>

            {/* App Mockup */}
            <div className={`relative reveal reveal-delay-1 ${osInView ? "in-view" : ""}`}>
              <div
                className="absolute inset-0 -m-8 rounded-3xl opacity-20 blur-3xl"
                style={{ background: "radial-gradient(ellipse, hsl(183 100% 42%), transparent 70%)" }} />
              
              <div className="relative rounded-2xl overflow-hidden border border-primary/30 shadow-elevated glow-cyan">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-card border-b border-border">
                  <div className="flex gap-1.5 shrink-0">
                    <span className="w-3 h-3 rounded-full bg-destructive/60" />
                    <span className="w-3 h-3 rounded-full bg-brand-gold/60" />
                    <span className="w-3 h-3 rounded-full bg-brand-emerald/60" />
                  </div>
                  <div className="flex-1 flex items-center gap-2 bg-secondary rounded-lg px-3 py-1.5 mx-2">
                    <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground font-mono">os.maiprop.co</span>
                  </div>
                  <a
                    href="https://os.maiprop.co"
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 p-1 rounded hover:bg-secondary transition-colors">
                    
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                  </a>
                </div>
                {/* Mockup content */}
                <div className="aspect-[16/10] bg-background">
                  <OSDashboardMockup />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ PROPERTIES PORTAL / GOLDEN VISA ══════════════════════════════════ */}
      <section className="py-20 bg-background overflow-hidden">
        <div ref={goldenRef} className="container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* App Mockup */}
            <div className={`relative order-last lg:order-first reveal ${goldenInView ? "in-view" : ""}`}>
              <div
                className="absolute inset-0 -m-8 rounded-3xl opacity-20 blur-3xl"
                style={{ background: "radial-gradient(ellipse, hsl(42 95% 55%), transparent 70%)" }} />
              
              <div
                className="relative rounded-2xl overflow-hidden border border-brand-gold/30 shadow-elevated"
                style={{ boxShadow: "0 0 30px -5px hsl(42 95% 55% / 0.3)" }}>
                
                {/* Browser chrome */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-card border-b border-border">
                  <div className="flex gap-1.5 shrink-0">
                    <span className="w-3 h-3 rounded-full bg-destructive/60" />
                    <span className="w-3 h-3 rounded-full bg-brand-gold/60" />
                    <span className="w-3 h-3 rounded-full bg-brand-emerald/60" />
                  </div>
                  <div className="flex-1 flex items-center gap-2 bg-secondary rounded-lg px-3 py-1.5 mx-2">
                    <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground font-mono">properties.maiprop.co</span>
                  </div>
                  <a
                    href="https://properties.maiprop.co"
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 p-1 rounded hover:bg-secondary transition-colors">
                    
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                  </a>
                </div>
                {/* Mockup */}
                <div className="aspect-[16/10] bg-background">
                  <PropertiesMockup />
                </div>
              </div>
            </div>

            {/* Copy */}
            <div className={`reveal reveal-delay-1 ${goldenInView ? "in-view" : ""}`}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-gold/10 border border-brand-gold/20 mb-5">
                <Star className="w-3.5 h-3.5 text-brand-gold" />
                <span className="text-xs font-semibold text-brand-gold uppercase tracking-wide">Greek Golden Visa</span>
              </div>
              <h2 className="font-display text-4xl font-bold leading-tight mb-4">
                Secure EU Residency <br />
                <span className="gradient-text-gold">Through Greek Property</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Our dedicated investment properties portal showcases curated €250K+ properties eligible for the Greek
                Golden Visa program — your gateway to EU residency, freedom of movement, and long-term capital growth.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                "Minimum €250K investment for EU residency",
                "6–9 months to visa approval",
                "Access for family including spouse & children",
                "Strongest real estate yields in Southern Europe"].
                map((item) =>
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-gold mt-1.5 shrink-0" />
                    {item}
                  </li>
                )}
              </ul>
              <div className="flex gap-3">
                <Button className="bg-gradient-gold border-0 text-background font-semibold gap-2" asChild>
                  <a href="https://properties.maiprop.co" target="_blank" rel="noreferrer">
                    Explore Properties 
                  </a>
                </Button>
                <Button
                  variant="outline"
                  className="border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10"
                  asChild>
                  
                  <a href="https://properties.maiprop.co" target="_blank" rel="noreferrer">
                    Golden Visa Guide
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      {/* bottom spacing for mobile nav */}
      <div className="h-16 lg:hidden" />
    </div>);

}