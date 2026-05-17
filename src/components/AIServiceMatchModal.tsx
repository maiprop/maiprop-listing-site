import { useState } from "react";
import { Brain, Loader2, Sparkles, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CATEGORY_LABELS } from "@/lib/professionalServiceCatalog";
import { supabase } from "@/integrations/supabase/client";
import { SERVICE_URGENCY_COLORS } from "@/lib/statusColors";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const CATEGORY_EMOJI: Record<string, string> = {
  real_estate_agent: "🏠", architect: "🏛️", civil_engineer: "⚙️", lawyer: "⚖️", notary: "📜",
  electrician: "⚡", plumber: "🔧", contractor: "🏗️", property_manager: "🏢", valuer: "📊",
  interior_designer: "🎨", financial_advisor: "💼", insurance_broker: "🛡️",
  utility_certification_provider: "📄", esg_sustainability_consultant: "🌱",
  relocation_immigration_consultant: "✈️", facility_manager: "🔑", short_term_rental_operator: "🏡",
  hotel_hospitality_operator: "🏨", marketing_agency: "📸", crm_listing_data_provider: "📊",
  concrete_contractor: "🧱", steel_structure_contractor: "🔩", carpenter: "🪚", tile_installer: "🔲",
  painter: "🖌️", building_permit_consultant: "📝", urban_planning_consultant: "🗺️",
  legalization_specialist: "📜", energy_certificate_inspector: "⚡", building_regulation_consultant: "✔️",
  fire_protection_consultant: "🔥", drywall_installer: "📐", waterproofing_specialist: "💧",
  insulation_contractor: "🧊", roofing_contractor: "🏠", window_aluminum_installer: "🪟",
  elevator_installer: "🛗", smart_home_installer: "📱",
};

interface MatchResult {
  category: string;
  services: string[];
  explanation: string;
  urgency: "low" | "medium" | "high";
  follow_up_question?: string;
}

interface AIServiceMatchModalProps {
  onClose: () => void;
  onNavigate: (category: string) => void;
}

export function AIServiceMatchModal({ onClose, onNavigate }: AIServiceMatchModalProps) {
  const dialogRef = useFocusTrap<HTMLDivElement>({ onEscape: onClose });
  const [need, setNeed] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);

  const handleMatch = async () => {
    if (!need.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-service-match", {
        body: { need },
      });
      if (error) throw new Error(error.message || "Matching failed");
      setResult(data as MatchResult);
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : null) || "Matching failed");
    } finally {
      setLoading(false);
    }
  };

  const EXAMPLES = [
    "I want to buy an apartment in Athens — what do I need?",
    "My electrical panel is outdated and needs replacing",
    "I need a mortgage for a €400K property",
    "I want to convert my property to Airbnb",
    "I need to check if a property has clear title",
  ];

  const categoryLabel = (cat: string) => CATEGORY_LABELS[cat] || cat;
  const categoryEmoji = (cat: string) => CATEGORY_EMOJI[cat] ?? "👤";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4 bg-background/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Find matching professional"
        tabIndex={-1}
        className="w-full sm:max-w-lg bg-card border border-border sm:rounded-2xl shadow-elevated overflow-hidden"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border" style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--accent) / 0.06))" }}>
          <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center shrink-0">
            <Brain className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm">Find Matching Professional</p>
            <p className="text-[11px] text-muted-foreground">Describe your need — we'll match you by criteria, availability & area</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Describe your need</label>
            <textarea
              value={need}
              onChange={(e) => setNeed(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleMatch(); } }}
              placeholder="e.g. I need a lawyer in Athens for property purchase, available next week..."
              rows={3}
              className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none focus:border-primary transition-colors"
            />
          </div>

          {!result && (
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => setNeed(ex)} className="text-[11px] px-2.5 py-1 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors text-left">
                  {ex}
                </button>
              ))}
            </div>
          )}

          <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2" onClick={handleMatch} disabled={!need.trim() || loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? "Finding match…" : "Find my professional"}
          </Button>

          {result && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="text-2xl">{categoryEmoji(result.category)}</div>
                  <div>
                    <div className="font-display font-bold text-sm">{categoryLabel(result.category)}</div>
                    <div className="text-[11px] text-muted-foreground">Best match for your need</div>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-full border font-semibold uppercase tracking-wide ${SERVICE_URGENCY_COLORS[result.urgency]}`}>
                  {result.urgency} urgency
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{result.explanation}</p>
              <div className="flex flex-wrap gap-1.5">
                {result.services.map((s) => (
                  <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-card border border-border text-foreground font-medium">{s}</span>
                ))}
              </div>
              {result.follow_up_question && (
                <div className="flex items-start gap-2 bg-secondary rounded-lg px-3 py-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground italic">{result.follow_up_question}</p>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" className="flex-1 bg-gradient-primary border-0 text-primary-foreground gap-1.5" onClick={() => { onNavigate(result.category); onClose(); }}>
                  Find {categoryLabel(result.category)} <ArrowRight className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="border-border" onClick={() => { setResult(null); setNeed(""); }}>Try Again</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
