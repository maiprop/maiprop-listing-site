import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useInView } from "@/hooks/useInView";
import { PROPERTY_TYPES } from "@/lib/propertyTypes";

interface Props {
  typeCounts: Record<string, number>;
}

export function BrowseByTypeSection({ typeCounts }: Props) {
  const { ref: browseRef, inView: browseInView } = useInView();

  return (
    <section className="py-8 sm:py-14 bg-secondary">
      <div ref={browseRef} className="container">
        <div className={`flex items-center justify-between mb-5 sm:mb-7 reveal ${browseInView ? "in-view" : ""}`}>
          <h2 className="font-display text-xl sm:text-2xl font-bold">Browse by Type</h2>
          <Link to="/listings" className="text-sm text-primary hover:underline flex items-center gap-1 shrink-0">
            All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Row 1: Primary types */}
        <div className={`grid grid-cols-3 gap-2 sm:gap-3 reveal reveal-delay-1 ${browseInView ? "in-view" : ""}`}>
          {PROPERTY_TYPES.filter((t) => ["apartment", "land"].includes(t.value)).map((type) => (
            <Link key={type.value} to={`/listings?type=${type.value}`}>
              <div className="glass-card rounded-xl sm:rounded-2xl border border-border hover:border-primary/40 hover:shadow-elevated transition-all group p-3 sm:p-4 flex flex-col sm:flex-row items-center sm:items-center gap-1 sm:gap-3 cursor-pointer text-center sm:text-left">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg sm:text-xl shrink-0 group-hover:scale-110 transition-transform">
                  {type.emoji}
                </div>
                <div>
                  <div className="font-display font-semibold text-xs sm:text-sm text-foreground group-hover:text-primary transition-colors leading-tight">
                    {type.label}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 hidden sm:block">
                    {typeCounts[type.value] ? `${typeCounts[type.value].toLocaleString()} listings` : "—"}
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {/* New Development */}
          <Link to="/listings?listing_type=new_build">
            <div className="glass-card rounded-xl sm:rounded-2xl border border-border hover:border-primary/40 hover:shadow-elevated transition-all group p-3 sm:p-4 flex flex-col sm:flex-row items-center sm:items-center gap-1 sm:gap-3 cursor-pointer relative text-center sm:text-left">
              <span className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 px-1 sm:px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold bg-primary text-primary-foreground leading-tight tracking-wide">
                NEW
              </span>
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg sm:text-xl shrink-0 group-hover:scale-110 transition-transform">
                🏗️
              </div>
              <div>
                <div className="font-display font-semibold text-xs sm:text-sm text-foreground group-hover:text-primary transition-colors leading-tight">
                  New Dev
                </div>
                <div className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 hidden sm:block">Off-plan &amp; new builds</div>
              </div>
            </div>
          </Link>
        </div>

        {/* Row 2: Commercial subtypes + Open House + Auctions */}
        <div className={`mt-2 sm:mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 reveal reveal-delay-2 ${browseInView ? "in-view" : ""}`}>
          {[
            { label: "Retail Shop", emoji: "🛍️", href: "/listings?type=commercial&subtype=shop" },
            { label: "Mixed-Use", emoji: "🔀", href: "/listings?type=commercial&subtype=mixed_use" },
            { label: "Open House", emoji: "🚪", href: "/open-houses" },
            { label: "Auctions", emoji: "🔨", href: "/auctions" },
          ].map((item) => (
            <Link key={item.label} to={item.href}>
              <div className="glass-card rounded-xl sm:rounded-2xl border border-border hover:border-primary/40 hover:shadow-elevated transition-all group p-3 sm:p-4 flex items-center gap-2 sm:gap-3 cursor-pointer">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary/10 flex items-center justify-center text-base sm:text-xl shrink-0 group-hover:scale-110 transition-transform">
                  {item.emoji}
                </div>
                <div className="font-display font-semibold text-xs sm:text-sm text-foreground group-hover:text-primary transition-colors leading-tight">
                  {item.label}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* More Commercial chips */}
        <div className={`mt-4 reveal reveal-delay-2 ${browseInView ? "in-view" : ""}`}>
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5 sm:mb-3">
            More Commercial
          </p>
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 sm:flex-wrap sm:pb-0">
            {[
              { label: "📦 Warehouse", sub: "warehouse" },
              { label: "🍽️ Restaurant / Café", sub: "restaurant" },
              { label: "🏨 Hotel / B&B", sub: "hotel" },
              { label: "🔬 Clinic / Medical", sub: "clinic" },
              { label: "🏗️ Industrial Space", sub: "industrial" },
              { label: "🖼️ Showroom", sub: "showroom" },
              { label: "🎪 Hall / Event Space", sub: "hall" },
              { label: "🏛️ Business Centre", sub: "office_business" },
            ].map((item) => (
              <Link key={item.sub} to={`/listings?type=commercial&subtype=${item.sub}`}>
                <div className="rounded-full border border-border bg-secondary px-3 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all cursor-pointer whitespace-nowrap">
                  {item.label}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
