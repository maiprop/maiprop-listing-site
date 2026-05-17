import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { Link } from "react-router-dom";
import {
  FileText,
  Download,
  Eye,
  X,
  Lock,
  Zap,
  Scale,
  Home,
  TrendingUp,
} from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

// ── Template content ──────────────────────────────────────────────────────────

import { TEMPLATES } from "@/lib/documentTemplateData";


type Category = "sale" | "rental" | "investor";

const CATEGORIES: { id: Category; label: string; labelEl: string; icon: React.ElementType; color: string }[] = [
  { id: "sale",     label: "Sale Templates",     labelEl: "Πωλήσεις",  icon: Home,        color: "text-primary" },
  { id: "rental",   label: "Rental Templates",   labelEl: "Μισθώσεις", icon: Scale,       color: "text-emerald-600 dark:text-emerald-400" },
  { id: "investor", label: "Investor Templates",  labelEl: "Επενδυτές", icon: TrendingUp,  color: "text-amber-600 dark:text-amber-400" },
];

const LANG_COLORS: Record<string, string> = {
  Greek:    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  English:  "bg-secondary text-muted-foreground",
  Bilingual:"bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

// ── Main component ────────────────────────────────────────────────────────────

export default function DocumentTemplates() {
  const { user } = useAuth();
  const { isPro } = useSubscription();
  const [activeCategory, setActiveCategory] = useState<Category>("sale");
  const [previewTemplate, setPreviewTemplate] = useState<typeof TEMPLATES[0] | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const previewDialogRef = useFocusTrap<HTMLDivElement>({
    active: Boolean(previewTemplate),
    onEscape: () => setPreviewTemplate(null),
  });
  const upgradeDialogRef = useFocusTrap<HTMLDivElement>({
    active: showUpgradePrompt,
    onEscape: () => setShowUpgradePrompt(false),
  });

  const filtered = TEMPLATES.filter((t) => t.category === activeCategory);

  function handleDownload(template: typeof TEMPLATES[0]) {
    if (!user) {
      setShowUpgradePrompt(true);
      return;
    }
    if (!isPro) {
      setShowUpgradePrompt(true);
      return;
    }
    const blob = new Blob([template.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${template.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar forceScrolled />
      <div className="pt-16">
        {/* Hero header */}
        <section className="py-12 border-b border-border bg-muted/30">
          <div className="container max-w-5xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Resources</p>
                <h1 className="font-display text-3xl sm:text-4xl font-bold mb-2">Legal Document Templates</h1>
                <p className="text-muted-foreground max-w-2xl">
                  Professional-grade template library for Greek property transactions. Covers sales, rentals, and investor documentation — drafted with Greek property law in context.
                </p>
                {!isPro && (
                  <p className="mt-3 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 inline-flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    Download requires a Pro plan. Previews are free for all users.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Category tabs */}
        <div className="sticky top-16 z-30 bg-background/90 backdrop-blur-md border-b border-border">
          <div className="container max-w-5xl">
            <div className="flex gap-1 py-2 overflow-x-auto">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                      activeCategory === cat.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {cat.label}
                    <span className="text-xs text-muted-foreground font-normal hidden sm:inline">/ {cat.labelEl}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Template cards */}
        <section className="py-8">
          <div className="container max-w-5xl">
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((template) => (
                <div
                  key={template.id}
                  className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Top row */}
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm leading-tight">{template.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{template.nameEl}</p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground leading-relaxed">{template.description}</p>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {template.languages.map((lang) => (
                      <span key={lang} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${LANG_COLORS[lang] ?? LANG_COLORS.English}`}>
                        {lang}
                      </span>
                    ))}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                      {template.format}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-auto pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5 text-xs"
                      onClick={() => setPreviewTemplate(template)}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 gap-1.5 text-xs"
                      onClick={() => handleDownload(template)}
                    >
                      {isPro ? (
                        <Download className="w-3.5 h-3.5" />
                      ) : (
                        <Lock className="w-3.5 h-3.5" />
                      )}
                      {isPro ? "Download" : "Pro Only"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Disclaimer */}
        <div className="container max-w-5xl pb-12">
          <div className="rounded-xl border border-border bg-muted/40 px-5 py-4 text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Disclaimer:</strong> These templates are provided for informational purposes only and do not constitute legal advice. Greek property law is complex and jurisdiction-specific. Always engage a licensed Greek lawyer (δικηγόρος) and notary (συμβολαιογράφος) before signing any property transaction documents. maiProp accepts no liability for use of these templates without professional legal review.
          </div>
        </div>
      </div>

      {/* Preview modal */}
      {previewTemplate && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewTemplate(null)}
        >
          <div
            ref={previewDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Preview ${previewTemplate.name}`}
            tabIndex={-1}
            className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="font-semibold text-sm">{previewTemplate.name}</h2>
                <p className="text-xs text-muted-foreground">{previewTemplate.nameEl}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => handleDownload(previewTemplate)}
                >
                  {isPro ? <Download className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  {isPro ? "Download" : "Pro Only"}
                </Button>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  aria-label="Close preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Modal content */}
            <div className="overflow-y-auto flex-1 p-5">
              <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap text-foreground/85 bg-muted/50 rounded-lg p-4">
                {previewTemplate.content}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade prompt modal */}
      {showUpgradePrompt && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowUpgradePrompt(false)}
        >
          <div
            ref={upgradeDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Pro plan required"
            tabIndex={-1}
            className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <h2 className="font-display text-xl font-bold mb-2">Pro Plan Required</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Downloading legal document templates is a Pro feature. Upgrade to access all templates in full, including DOCX and PDF formats ready for your transactions.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" size="sm" onClick={() => setShowUpgradePrompt(false)}>
                Maybe Later
              </Button>
              <Button size="sm" className="gap-1.5" asChild>
                <Link to="/pricing">
                  <Zap className="w-3.5 h-3.5" /> Upgrade to Pro
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
