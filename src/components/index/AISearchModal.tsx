/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from "react";
import { Sparkles, X, Lightbulb, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SignInForAI } from "@/components/SignInForAI";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const AI_SUGGESTIONS = [
  "Quiet apartment near metro in Athens under 200k",
  "3 bed villa with pool for rent in Mykonos",
  "Studio with parking in Thessaloniki under 80k",
  "New build energy A+ apartment in Athens",
];

export function AISearchModal({
  onFiltersApplied,
  onClose,
}: {
  onFiltersApplied: (f: Record<string, any>) => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>({ onEscape: onClose });

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSearch = async (q?: string) => {
    if (!user) return;
    const searchQuery = (q ?? query).trim();
    if (!searchQuery) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-search", { body: { query: searchQuery } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      onFiltersApplied(data);
      onClose();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : null) || "AI search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-20 px-4 bg-background/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="AI property search"
        tabIndex={-1}
        className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-elevated overflow-hidden"
      >
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                    if (e.key === "Escape") onClose();
                  }}
                  placeholder="e.g. quiet apartment near metro in Athens under 200k..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  disabled={loading}
                />
                <button
                  onClick={() => handleSearch()}
                  disabled={loading || !query.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 transition-opacity"
                >
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
                  {AI_SUGGESTIONS.map((s) => (
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
  );
}
