import { useState, useRef, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2, X, ArrowRight, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SignInForAI } from "@/components/SignInForAI";
import { toast } from "sonner";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const SUGGESTIONS = [
  "Quiet apartment near metro in Athens under 200k",
  "3 bed villa with pool for rent in Mykonos",
  "Studio with parking in Thessaloniki under 80k",
  "New build energy A+ apartment in Athens",
  "Pet-friendly furnished flat for rent",
];

interface AIFilters {
  city?: string | null;
  listing_type?: string | null;
  property_type?: string | null;
  price_max?: number | null;
  price_min?: number | null;
  beds_min?: number | null;
  beds_max?: number | null;
  sqm_min?: number | null;
  sqm_max?: number | null;
  features?: string[];
  energy?: string[];
  heating?: string | null;
  summary?: string;
}

interface AISearchBarProps {
  onFiltersApplied: (filters: AIFilters) => void;
}

export function AISearchBar({ onFiltersApplied }: AISearchBarProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>({ active: open, onEscape: () => setOpen(false) });

  const handleSearch = async (q?: string) => {
    if (!user) return;
    const searchQuery = (q ?? query).trim();
    if (!searchQuery) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-search", {
        body: { query: searchQuery },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const filters = data as AIFilters;
      setLastSummary(filters.summary || null);
      if (filters.listing_type === "auction") {
        const params = new URLSearchParams();
        if (filters.city) params.set("city", filters.city);
        if (filters.property_type) params.set("type", filters.property_type);
        if (filters.price_min != null) params.set("price_min", String(filters.price_min));
        if (filters.price_max != null) params.set("price_max", String(filters.price_max));
        if (filters.sqm_min != null) params.set("sqm_min", String(filters.sqm_min));
        if (filters.sqm_max != null) params.set("sqm_max", String(filters.sqm_max));
        if (filters.summary) params.set("ai_summary", filters.summary);
        navigate(`/auctions${params.toString() ? `?${params.toString()}` : ""}`);
        setOpen(false);
        return;
      }
      onFiltersApplied(filters);
      setOpen(false);
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : null) || "AI search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="relative">
      {/* Trigger button / inline bar */}
      {!open ? (
        <div className="flex items-stretch shrink-0 rounded-xl border border-primary/30 bg-primary/5 text-primary overflow-hidden">
          <button
            type="button"
            onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            className="flex items-center gap-2 px-3 py-2.5 hover:bg-primary/10 transition-colors text-sm font-medium"
            aria-label={lastSummary ? `Open AI Search. Current filter: ${lastSummary}` : "Open AI Search"}
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">
              {lastSummary ? (
                <span className="block max-w-[160px] truncate text-xs">{lastSummary}</span>
              ) : (
                "AI Search"
              )}
            </span>
          </button>
          {lastSummary && (
            <button
              type="button"
              aria-label="Clear AI search filters"
              onClick={() => { setLastSummary(null); onFiltersApplied({}); }}
              className="px-2 text-muted-foreground hover:text-foreground hover:bg-primary/10 border-l border-primary/20"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ) : (
        <div className="fixed inset-0 z-[70] flex items-start justify-center pt-20 px-4 bg-background/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="AI property search"
            tabIndex={-1}
            className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-elevated overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-primary/5">
              <Sparkles className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="font-display font-semibold text-sm">AI Property Search</p>
                <p className="text-[11px] text-muted-foreground">Describe what you're looking for in plain language</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Input or sign-in */}
            <div className="p-4">
              {!user ? (
                <SignInForAI feature="AI Search" />
              ) : (
              <>
              <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3 border border-border focus-within:border-primary transition-colors">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="e.g. quiet apartment near metro in Athens under 200k..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  disabled={loading}
                />
                <button
                  onClick={() => handleSearch()}
                  disabled={loading || !query.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  {loading ? "Searching…" : "Search"}
                </button>
              </div>

              {/* Suggestions */}
              <div className="mt-4">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Lightbulb className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-[11px] text-muted-foreground font-medium">Try these examples</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setQuery(s); handleSearch(s); }}
                      disabled={loading}
                      className="px-2.5 py-1.5 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50 text-left"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
