import { Link } from "react-router-dom";
import { Flame, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInView } from "@/hooks/useInView";

export function QuickSaleCTASection() {
  const { ref, inView } = useInView();

  return (
    <section className="py-10 sm:py-16 bg-background">
      <div ref={ref} className="container">
        <div className={`relative rounded-3xl overflow-hidden bg-card border border-border reveal ${inView ? "in-view" : ""}`}>
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 80% 50%, hsl(0 72% 55% / 0.12) 0%, transparent 60%)" }} />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 20% 50%, hsl(var(--brand-purple) / 0.06) 0%, transparent 50%)" }} />

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
                Get a guaranteed cash offer for your property powered by our AI valuation engine. No waiting, no stress.
              </p>
              <Button size="lg" className="w-full sm:w-auto bg-gradient-primary border-0 text-primary-foreground" asChild>
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
                { value: "AI", label: "Valuation Engine" },
              ].map((item) => (
                <div key={item.label} className="glass-card rounded-xl p-3 sm:p-4 text-center">
                  <div className="font-display text-xl sm:text-2xl font-bold gradient-text-cyan">{item.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
