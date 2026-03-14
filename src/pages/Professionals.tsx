import { useState, useRef, useEffect } from "react";
import { Search, Star, MapPin, CheckCircle, Loader2, Sparkles, TrendingUp, Clock, MessageSquare, ArrowRight, Zap, Brain, FileSearch, BarChart2, X, Send, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useProfessionals } from "@/hooks/useProfessionals";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

// ─── Category Groups ──────────────────────────────────────────────────────────
const categoryGroups = [
{
  id: "legal",
  label: "Legal & Title",
  emoji: "⚖️",
  color: "text-brand-gold",
  bg: "bg-brand-gold/10",
  border: "border-brand-gold/20",
  categories: ["lawyer", "notary"],
  description: "Property title, contracts, conveyancing"
},
{
  id: "design",
  label: "Design & Build",
  emoji: "🏛️",
  color: "text-primary",
  bg: "bg-primary/10",
  border: "border-primary/20",
  categories: ["architect", "civil_engineer", "interior_designer", "contractor"],
  description: "Architecture, engineering, renovation"
},
{
  id: "trades",
  label: "Trades & Maintenance",
  emoji: "🔧",
  color: "text-accent",
  bg: "bg-accent/10",
  border: "border-accent/20",
  categories: ["electrician", "plumber"],
  description: "Electrical, plumbing, building works"
},
{
  id: "finance",
  label: "Finance & Investment",
  emoji: "💼",
  color: "text-brand-emerald",
  bg: "bg-brand-emerald/10",
  border: "border-brand-emerald/20",
  categories: ["financial_advisor", "valuer"],
  description: "Mortgages, investment advice, valuations"
},
{
  id: "management",
  label: "Property Management",
  emoji: "🏢",
  color: "text-brand-sky",
  bg: "bg-brand-sky/10",
  border: "border-brand-sky/20",
  categories: ["property_manager"],
  description: "Lettings, tenants, asset management"
}];


const ALL_CATEGORIES = categoryGroups.flatMap((g) => g.categories);

const categoryInfo: Record<string, {emoji: string;label: string;group: string;}> = {
  architect: { emoji: "🏛️", label: "Architect", group: "design" },
  civil_engineer: { emoji: "⚙️", label: "Civil Engineer", group: "design" },
  lawyer: { emoji: "⚖️", label: "Lawyer", group: "legal" },
  notary: { emoji: "📜", label: "Notary", group: "legal" },
  electrician: { emoji: "⚡", label: "Electrician", group: "trades" },
  plumber: { emoji: "🔧", label: "Plumber", group: "trades" },
  contractor: { emoji: "🏗️", label: "Contractor", group: "design" },
  property_manager: { emoji: "🏢", label: "Property Manager", group: "management" },
  valuer: { emoji: "📊", label: "Valuer", group: "finance" },
  interior_designer: { emoji: "🎨", label: "Interior Designer", group: "design" },
  financial_advisor: { emoji: "💼", label: "Financial Advisor", group: "finance" }
};

// AI capabilities per group
const aiCapabilities: Record<string, {icon: React.ElementType;label: string;}[]> = {
  legal: [
  { icon: FileSearch, label: "AI contract risk scan" },
  { icon: Brain, label: "Title deed anomaly detection" },
  { icon: Zap, label: "Instant due-diligence summary" }],

  design: [
  { icon: Brain, label: "AI permit & regulation check" },
  { icon: BarChart2, label: "Renovation cost estimator" },
  { icon: Sparkles, label: "AI-generated floor plan ideas" }],

  trades: [
  { icon: Zap, label: "Smart job scheduling" },
  { icon: TrendingUp, label: "Material cost forecasting" },
  { icon: Brain, label: "Fault diagnosis assist" }],

  finance: [
  { icon: BarChart2, label: "AI property valuation engine" },
  { icon: TrendingUp, label: "Investment yield projections" },
  { icon: Brain, label: "Portfolio optimisation AI" }],

  management: [
  { icon: Brain, label: "AI tenant screening" },
  { icon: Zap, label: "Automated rent collection" },
  { icon: BarChart2, label: "Occupancy rate optimiser" }]

};

// ── AI Tools Modal ─────────────────────────────────────────────────────────────
const aiToolPrompts: Record<string, {system: string;placeholder: string;}> = {
  legal: {
    system: "You are a Greek real estate legal AI assistant. Help with contract risk analysis, title deed checks, due diligence summaries, and conveyancing questions in the Greek property market. Be concise and highlight key risks.",
    placeholder: "e.g. What should I check in a Greek property purchase contract? Are there risks with cadastre registration?"
  },
  design: {
    system: "You are a Greek real estate architecture and renovation AI assistant. Help with building permits, renovation cost estimates, floor plan ideas, and Greek building regulations. Be practical and cite typical Greek market costs.",
    placeholder: "e.g. What permits do I need to renovate an apartment in Athens? Rough cost to renovate 80m²?"
  },
  trades: {
    system: "You are a Greek property trades AI assistant specialising in electrical, plumbing, and general building works. Help diagnose issues, estimate costs, and explain Greek building standards.",
    placeholder: "e.g. What's the typical cost to rewire a 3-bed apartment in Athens? What are Greek electrical standards?"
  },
  finance: {
    system: "You are a Greek real estate financial AI assistant. Help with property valuations, investment yield calculations, mortgage advice, portfolio optimisation, and the Greek property tax system (ENFIA, transfer tax).",
    placeholder: "e.g. What's a good rental yield in Athens Kolonaki? How is ENFIA calculated for a €300K apartment?"
  },
  management: {
    system: "You are a Greek property management AI assistant. Help with tenant screening, rental contract advice under Greek law, maintenance scheduling, and occupancy optimisation.",
    placeholder: "e.g. What are the legal requirements for a rental agreement in Greece? How do I handle a non-paying tenant?"
  }
};

function AIToolsModal({ groupId, groupLabel, onClose }: {groupId: string;groupLabel: string;onClose: () => void;}) {
  const [messages, setMessages] = useState<{role: "user" | "assistant";content: string;}[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const config = aiToolPrompts[groupId] || aiToolPrompts["legal"];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg = { role: "user" as const, content: text };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);

    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pro-ai-tools`;
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
        },
        body: JSON.stringify({ messages: newMsgs, groupId })
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "AI request failed");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const chunk = JSON.parse(json);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setMessages((prev) => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m));
            }
          } catch {/* partial */}
        }
      }
    } catch (e: any) {
      toast.error(e.message || "AI request failed");
      setMessages((prev) => prev.filter((_, i) => i !== prev.length - 1));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4 bg-background/70 backdrop-blur-sm"
    onClick={(e) => {if (e.target === e.currentTarget) onClose();}}>
      <div className="w-full sm:max-w-xl bg-card border border-border sm:rounded-2xl shadow-elevated flex flex-col overflow-hidden" style={{ maxHeight: "80vh", minHeight: 400 }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-primary/5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Brain className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm">AI Tools — {groupLabel}</p>
            <p className="text-[11px] text-muted-foreground">Powered by maiProp AI · Ask anything about this specialty</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
          {messages.length === 0 &&
          <div className="text-center py-8">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <p className="font-semibold text-foreground mb-1">AI {groupLabel} Assistant</p>
              <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">Ask any question about this professional category — contracts, costs, regulations, processes.</p>
              <p className="text-xs text-muted-foreground/60 italic">{config.placeholder}</p>
            </div>
          }
          {messages.map((m, i) =>
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "chat-bubble-sent" : "chat-bubble-received"}`}>
                {m.role === "assistant" ?
              <div className="prose prose-sm max-w-none prose-invert prose-p:my-1 prose-ul:my-1 prose-headings:my-1">
                    <ReactMarkdown>{m.content || (loading && i === messages.length - 1 ? "▋" : "")}</ReactMarkdown>
                  </div> :
              m.content}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border px-4 py-3 shrink-0">
          <div className="flex items-end gap-2 bg-secondary rounded-xl border border-border focus-within:border-primary transition-colors px-4 py-2.5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {if (e.key === "Enter" && !e.shiftKey) {e.preventDefault();send();}}}
              placeholder={config.placeholder}
              rows={1}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none min-h-[24px] max-h-[96px]"
              style={{ height: "auto" }} />
            
            <button onClick={send} disabled={!input.trim() || loading}
            className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-40 hover:opacity-90 transition-opacity">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>);

}

export default function Professionals() {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [aiModal, setAiModal] = useState<{groupId: string;groupLabel: string;} | null>(null);

  // Derive DB categories from group selection
  const dbCategory = selectedGroup ?
  undefined // fetch all, filter client-side by group
  : undefined;

  const { data: professionals = [], isLoading } = useProfessionals(dbCategory);

  const filtered = professionals.filter((p: any) => {
    // Group filter
    if (selectedGroup) {
      const group = categoryGroups.find((g) => g.id === selectedGroup);
      if (group && !group.categories.includes(p.category)) return false;
    }
    // Text search
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (p.display_name || "").toLowerCase().includes(q) ||
      (p.title || "").toLowerCase().includes(q) ||
      (p.specialties || []).join(" ").toLowerCase().includes(q) ||
      (p.city || "").toLowerCase().includes(q));

  });

  const activeGroup = selectedGroup ? categoryGroups.find((g) => g.id === selectedGroup) : null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {aiModal && <AIToolsModal groupId={aiModal.groupId} groupLabel={aiModal.groupLabel} onClose={() => setAiModal(null)} />}
      <div className="pt-16">

        {/* ── Hero ───────────────────────────────────────────────────── */}
        <div className="relative bg-card border-b border-border overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "linear-gradient(hsl(265 80% 60%) 1px, transparent 1px), linear-gradient(90deg, hsl(265 80% 60%) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-10"
          style={{ background: "radial-gradient(hsl(183 100% 42%), transparent 70%)" }} />

          <div className="container relative py-8 sm:py-14">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent/15 border border-accent/30 mb-4 sm:mb-5">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-bold text-accent uppercase tracking-widest">AI-Powered Pro Network</span>
            </div>
            <div className="grid lg:grid-cols-2 gap-6 sm:gap-8 items-end">
              <div>
                <h1 className="font-display text-3xl sm:text-5xl font-bold mb-3 leading-tight">
                  Every expert you need,<br />
                  <span className="gradient-text-cyan">amplified by AI</span>
                </h1>
                <p className="text-muted-foreground max-w-lg text-base sm:text-lg leading-relaxed mb-4 sm:mb-5">
                  From legal due-diligence to renovation — every professional on maiProp uses AI to deliver faster, smarter, and more transparent results.
                </p>
                <button
                  onClick={() => setAiModal({ groupId: "legal", groupLabel: "Legal & Title" })}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/15 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/25 transition-colors">
                  <Brain className="w-4 h-4" />
                  Try AI Tools Now
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              











              
            </div>
          </div>
        </div>

        {/* ── Category Groups ─────────────────────────────────────────── */}
        <div className="bg-card/40 border-b border-border">
          <div className="container py-4 sm:py-6">
            {/* Horizontally scrollable on mobile */}
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
              <button
                onClick={() => setSelectedGroup(null)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium border transition-all shrink-0 ${
                !selectedGroup ?
                "bg-secondary border-primary/40 text-foreground" :
                "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"}`
                }>
                All Professionals
              </button>
              {categoryGroups.map((group) =>
              <button
                key={group.id}
                onClick={() => setSelectedGroup(selectedGroup === group.id ? null : group.id)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-semibold border transition-all shrink-0 ${
                selectedGroup === group.id ?
                `${group.bg} ${group.border} ${group.color}` :
                "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"}`
                }>
                  <span>{group.emoji}</span>
                  <span>{group.label}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="container py-6 sm:py-8 pb-24 lg:pb-8">

          {/* ── AI Capabilities Banner (context-aware) ───────────────── */}
          {activeGroup &&
          <div className={`mb-8 rounded-2xl border ${activeGroup.border} ${activeGroup.bg} p-5`}>
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex items-center gap-2 shrink-0">
                  <div className={`w-9 h-9 rounded-xl ${activeGroup.bg} border ${activeGroup.border} flex items-center justify-center text-xl`}>
                    {activeGroup.emoji}
                  </div>
                  <div>
                    <div className={`font-display font-bold text-sm ${activeGroup.color}`}>{activeGroup.label}</div>
                    <div className="text-[11px] text-muted-foreground">{activeGroup.description}</div>
                  </div>
                </div>
                <div className="w-px bg-border/60 self-stretch hidden sm:block" />
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  <div className="flex items-center gap-1.5 mr-2">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Tools Available</span>
                  </div>
                  {(aiCapabilities[activeGroup.id] || []).map((cap) =>
                <div key={cap.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-xs font-medium text-foreground">
                      <cap.icon className="w-3 h-3 text-primary shrink-0" />
                      {cap.label}
                    </div>
                )}
                </div>
                <Button
                size="sm"
                className="bg-gradient-primary border-0 text-primary-foreground gap-1.5 shrink-0"
                onClick={() => setAiModal({ groupId: activeGroup.id, groupLabel: activeGroup.label })}>
                
                  <Brain className="w-3.5 h-3.5" />
                  Use AI Tools
                </Button>
              </div>
            </div>
          }

          {/* ── Search ───────────────────────────────────────────────── */}
          <div className="flex gap-3 mb-6 flex-wrap items-center">
            <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-secondary border border-border rounded-xl px-4 py-2.5 focus-within:border-primary transition-colors">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Search by name, specialty, city..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              
            </div>
            {!selectedGroup &&
            <div className="flex gap-2 flex-wrap">
                {categoryGroups.map((g) =>
              <button key={g.id} onClick={() => setSelectedGroup(g.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${g.border} ${g.bg} ${g.color}`}>
                    {g.emoji} {g.label}
                  </button>
              )}
              </div>
            }
          </div>

          {/* ── Results ──────────────────────────────────────────────── */}
          {isLoading ?
          <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div> :
          filtered.length === 0 ?
          <div className="text-center py-20 text-muted-foreground">
              <p className="text-lg font-medium mb-1">No professionals found</p>
              <p className="text-sm">Try adjusting your search or category filter</p>
            </div> :

          <>
              <p className="text-sm text-muted-foreground mb-4">{filtered.length} professionals found{activeGroup ? ` in ${activeGroup.label}` : ""}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((pro: any) => {
                const name = pro.display_name || "Professional";
                const catData = categoryInfo[pro.category] || { emoji: "👤", label: pro.category, group: "" };
                const group = categoryGroups.find((g) => g.id === catData.group);
                const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                const rating = Number(pro.rating) || 0;
                const specialties = pro.specialties || [];

                return (
                  <div key={pro.id} className="glass-card rounded-xl p-5 flex flex-col gap-4 hover:border-primary/20 transition-all group">
                      {/* Category badge */}
                      {group &&
                    <div className={`self-start flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${group.bg} ${group.border} border ${group.color}`}>
                          {group.emoji} {group.label}
                        </div>
                    }

                      {/* Header */}
                      <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-xl bg-gradient-primary flex items-center justify-center font-display font-bold text-xl text-primary-foreground shrink-0 overflow-hidden">
                          {pro.avatar_url ?
                        <img src={pro.avatar_url} alt={name} className="w-full h-full object-cover" /> :
                        initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-display font-semibold text-sm truncate">{name}</span>
                            {pro.verified && <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className="mr-1">{catData.emoji}</span>{pro.title || catData.label}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{pro.city || "Greece"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-brand-gold fill-brand-gold" />
                          <span className="text-sm font-semibold">{rating > 0 ? rating : "—"}</span>
                          <span className="text-xs text-muted-foreground">({pro.reviews_count || 0})</span>
                        </div>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-xs text-muted-foreground">{pro.projects_count || 0} projects</span>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-xs text-muted-foreground">{pro.experience_years || 0} yrs</span>
                      </div>

                      {/* Hourly rate */}
                      {pro.hourly_rate &&
                    <div className="text-xs text-muted-foreground">
                          From <span className="font-semibold text-foreground">€{pro.hourly_rate}/hr</span>
                        </div>
                    }

                      {/* AI badge */}
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/5 border border-primary/15 self-start">
                        <Sparkles className="w-3 h-3 text-primary" />
                        <span className="text-[10px] font-semibold text-primary">AI-enhanced workflow</span>
                      </div>

                      {/* Specialties */}
                      {specialties.length > 0 &&
                    <div className="flex gap-1.5 flex-wrap">
                          {specialties.slice(0, 3).map((s: string) =>
                      <span key={s} className="px-2 py-0.5 rounded-full bg-secondary border border-border text-xs text-muted-foreground">{s}</span>
                      )}
                        </div>
                    }

                      {/* Actions — message links to profile; only Pro professionals show Send Message there */}
                      <div className="flex gap-2 mt-auto">
                        <Button size="sm" className="flex-1 bg-gradient-primary border-0 text-primary-foreground text-xs gap-1.5" asChild>
                          <Link to={`/professionals/${pro.id}`}>View Profile <ArrowRight className="w-3 h-3" /></Link>
                        </Button>
                        <Button size="sm" variant="outline" className="border-border px-3" asChild title="Message">
                          <Link to={`/professionals/${pro.id}`}><MessageSquare className="w-3.5 h-3.5" /></Link>
                        </Button>
                      </div>
                    </div>);

              })}
              </div>
            </>
          }

          {/* ── AI Advantage Section ─────────────────────────────────── */}
          <div className="mt-16 rounded-3xl border border-border overflow-hidden"
          style={{ background: "linear-gradient(135deg, hsl(183 100% 5%), hsl(265 80% 6%), hsl(183 100% 5%))" }}>
            



























            
          </div>

          {/* ── Join CTA ─────────────────────────────────────────────── */}
          <div className="mt-10 glass-card rounded-2xl p-8 text-center border border-accent/20">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 mb-4">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-semibold text-accent">Free to join</span>
            </div>
            <h3 className="font-display text-xl font-bold mb-2">Are you a Professional?</h3>
            <p className="text-muted-foreground mb-5 text-sm max-w-sm mx-auto">Join 2,400+ verified professionals. Get qualified leads from buyers, sellers, and investors — powered by AI.</p>
            <Button className="bg-gradient-accent border-0 text-accent-foreground gap-2" asChild>
              <Link to="/signup?role=professional">
                Create Pro Profile — Free <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <Footer />
    </div>);

}