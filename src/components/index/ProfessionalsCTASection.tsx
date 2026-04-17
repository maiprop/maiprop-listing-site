import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInView } from "@/hooks/useInView";

export function ProfessionalsCTASection() {
  const { ref, inView } = useInView();

  return (
    <section className="py-10 sm:py-20 bg-background">
      <div ref={ref} className="container">
        <div className={`relative rounded-3xl overflow-hidden border border-accent/20 bg-foreground dark:bg-[hsl(265_40%_7%)] reveal ${inView ? "in-view" : ""}`}>
          <div className="absolute top-0 left-0 w-80 h-80 rounded-full blur-3xl opacity-20" style={{ background: "radial-gradient(hsl(265 80% 60%), transparent 70%)" }} />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full blur-3xl opacity-15" style={{ background: "radial-gradient(hsl(183 100% 42%), transparent 70%)" }} />

          <div className="relative p-6 sm:p-10 md:p-14 lg:p-16 text-background">
            <div className="grid lg:grid-cols-2 gap-6 sm:gap-12 items-center">
              <div>
                <h2 className="font-display text-2xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-4 text-destructive-foreground">
                  The right expert,
                  <br />
                  <span className="gradient-text-cyan drop-shadow-[0_0_20px_rgba(133,106,255,0.65)]">
                    one click away
                  </span>
                </h2>
                <Button size="lg" className="bg-gradient-accent border-0 text-accent-foreground font-semibold px-8 gap-2 w-full sm:w-auto" asChild>
                  <Link to="/professionals">
                    Explore Directory <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {[
                  { emoji: "🏛️", title: "Architects", category: "architect", bg: "bg-primary/15" },
                  { emoji: "⚖️", title: "Lawyers", category: "lawyer", bg: "bg-brand-gold/15" },
                  { emoji: "📋", title: "Notaries", category: "notary", bg: "bg-brand-purple/15" },
                  { emoji: "🔧", title: "Civil Engineers", category: "civil_engineer", bg: "bg-primary/15" },
                  { emoji: "🏠", title: "Real Estate Agents", category: "real_estate_agent", bg: "bg-brand-emerald/15" },
                  { emoji: "💰", title: "Financial Advisors", category: "financial_advisor", bg: "bg-brand-gold/10" },
                  { emoji: "🏗️", title: "Contractors", category: "contractor", bg: "bg-brand-purple-dark/15" },
                  { emoji: "🏡", title: "Property Managers", category: "property_manager", bg: "bg-brand-purple/10" },
                ].map((pro) => (
                  <Link key={pro.title} to={`/professionals?category=${pro.category}`}>
                    <div className="relative group rounded-xl sm:rounded-2xl overflow-hidden">
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: "radial-gradient(circle at 0 0, hsl(var(--brand-cyan-soft)/0.28), transparent 55%)" }} />
                      <div className="relative flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-background/8 border border-white/12 hover:border-brand-purple/40 backdrop-blur-md transition-all min-h-[56px]">
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl ${pro.bg} flex items-center justify-center text-base sm:text-xl shrink-0 shadow-sm`}>
                          {pro.emoji}
                        </div>
                        <div className="font-semibold text-xs sm:text-sm text-white leading-tight">{pro.title}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
