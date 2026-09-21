import { BarChart2, ExternalLink, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInView } from "@/hooks/useInView";
import { OSDashboardMockup } from "@/components/index/OSDashboardMockup";

export function OSSection() {
  const { ref, inView } = useInView();

  return (
    <section className="py-12 sm:py-20 bg-secondary overflow-hidden">
      <div ref={ref} className="container">
        <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 items-center">
          {/* Copy */}
          <div className={`reveal ${inView ? "in-view" : ""}`}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-4 sm:mb-5">
              <BarChart2 className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                Powered by mAI Prop OS
              </span>
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold leading-tight mb-3 sm:mb-4">
              Greece's Real Estate <br />
              <span className="gradient-text-primary">Data Gateway</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              mAI Prop OS brings selected Greek property and auction datasets together with price analysis, mapping,
              reporting, and portfolio tools.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "Property and auction data for supported coverage areas",
                "Price analysis, mapped data, and investment tools",
                "Portfolio workflows and configurable reports",
                "Tools for reviewing judicial and bank auction opportunities",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  {item}
                </li>
              ))}
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
          <div className={`relative reveal reveal-delay-1 ${inView ? "in-view" : ""}`}>
            <div className="absolute inset-0 -m-8 rounded-3xl opacity-20 blur-3xl" style={{ background: "radial-gradient(ellipse, hsl(183 100% 42%), transparent 70%)" }} />
            <div className="relative rounded-2xl overflow-hidden border border-primary/30 shadow-elevated glow-cyan">
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
                <a href="https://os.maiprop.co" target="_blank" rel="noreferrer" aria-label="Open os.maiprop.co in new tab" className="shrink-0 p-1 rounded hover:bg-secondary transition-colors">
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                </a>
              </div>
              <div className="aspect-[16/10] bg-background">
                <OSDashboardMockup />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
