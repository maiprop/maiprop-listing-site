import { Link } from "react-router-dom";
import { useInView } from "@/hooks/useInView";

type BrowseTile = {
  key: string;
  label: string;
  browseLabel: string;
  href: string;
  accent: string;
  surfaceClass: string;
  stripeClass: string;
  textClass: string;
};

const BROWSE_TILES: BrowseTile[] = [
  {
    key: "apartment",
    label: "Apartment",
    browseLabel: "apartments",
    href: "/listings?type=apartment",
    accent: "purple",
    surfaceClass: "border-brand-purple/20 bg-brand-purple/5 hover:border-brand-purple/40 hover:bg-brand-purple/10",
    stripeClass: "bg-brand-purple",
    textClass: "text-brand-purple",
  },
  {
    key: "house",
    label: "Houses",
    browseLabel: "houses",
    href: "/listings?type=house",
    accent: "emerald",
    surfaceClass: "border-brand-emerald/20 bg-brand-emerald/5 hover:border-brand-emerald/40 hover:bg-brand-emerald/10",
    stripeClass: "bg-brand-emerald",
    textClass: "text-brand-emerald",
  },
  {
    key: "land",
    label: "Land",
    browseLabel: "land",
    href: "/listings?type=land",
    accent: "sky",
    surfaceClass: "border-brand-sky/25 bg-brand-sky/10 hover:border-brand-sky/45 hover:bg-brand-sky/15",
    stripeClass: "bg-brand-sky",
    textClass: "text-brand-cyan-deep",
  },
  {
    key: "new_build",
    label: "New Buildings",
    browseLabel: "new buildings",
    href: "/listings?listing_type=new_build",
    accent: "gold",
    surfaceClass: "border-brand-gold/20 bg-brand-gold/5 hover:border-brand-gold/40 hover:bg-brand-gold/10",
    stripeClass: "bg-brand-gold",
    textClass: "text-brand-gold",
  },
  {
    key: "retail_shop",
    label: "Retail Shops",
    browseLabel: "retail shops",
    href: "/listings?type=commercial&subtype=shop",
    accent: "indigo",
    surfaceClass: "border-brand-indigo/20 bg-brand-indigo/5 hover:border-brand-indigo/40 hover:bg-brand-indigo/10",
    stripeClass: "bg-brand-indigo",
    textClass: "text-brand-indigo",
  },
  {
    key: "office",
    label: "Offices",
    browseLabel: "offices",
    href: "/listings?type=office",
    accent: "cyan",
    surfaceClass: "border-brand-cyan/25 bg-brand-cyan/10 hover:border-brand-cyan/45 hover:bg-brand-cyan/15",
    stripeClass: "bg-brand-cyan",
    textClass: "text-brand-cyan-deep",
  },
  {
    key: "stores",
    label: "Stores",
    browseLabel: "stores",
    href: "/listings?type=storage",
    accent: "purple-soft",
    surfaceClass: "border-brand-purple-soft/45 bg-brand-purple-soft/15 hover:border-brand-purple/35 hover:bg-brand-purple-soft/25",
    stripeClass: "bg-brand-purple-soft",
    textClass: "text-brand-purple-dark",
  },
  {
    key: "mixed_use",
    label: "Mixed-use",
    browseLabel: "mixed-use",
    href: "/listings?type=mixed_use",
    accent: "cyan-soft",
    surfaceClass: "border-brand-cyan-soft/60 bg-brand-cyan-soft/20 hover:border-brand-cyan/40 hover:bg-brand-cyan-soft/30",
    stripeClass: "bg-brand-cyan-soft",
    textClass: "text-brand-cyan-deep",
  },
  {
    key: "commercial",
    label: "Commercial",
    browseLabel: "commercial",
    href: "/listings?type=commercial",
    accent: "navy",
    surfaceClass: "border-brand-navy/15 bg-brand-navy/5 hover:border-brand-navy/30 hover:bg-brand-navy/10",
    stripeClass: "bg-brand-navy",
    textClass: "text-brand-navy",
  },
];

export function BrowseByTypeSection() {
  const { ref: browseRef, inView: browseInView } = useInView();

  return (
    <section className="py-8 sm:py-12 bg-secondary">
      <div ref={browseRef} className="container">
        <div className={`flex items-center justify-between mb-4 sm:mb-6 reveal ${browseInView ? "in-view" : ""}`}>
          <h2 className="font-display text-xl sm:text-2xl font-bold">Browse by Type</h2>
          <Link to="/listings" className="text-sm text-primary hover:underline shrink-0">
            All
          </Link>
        </div>

        <div
          data-testid="browse-by-type-grid"
          className={`grid grid-cols-3 gap-2 sm:gap-3 max-w-5xl reveal reveal-delay-1 ${browseInView ? "in-view" : ""}`}
        >
          {BROWSE_TILES.map(({ key, label, browseLabel, href, accent, surfaceClass, stripeClass, textClass }) => {
            return (
              <Link
                key={key}
                to={href}
                aria-label={`Browse ${browseLabel}`}
                data-accent={accent}
                className={`group relative overflow-hidden rounded-xl border bg-card min-h-[58px] sm:min-h-[64px] px-3 py-3 sm:px-4 flex items-center justify-center text-center hover:shadow-soft transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${surfaceClass}`}
              >
                <span className={`absolute inset-x-0 top-0 h-1 opacity-70 transition-opacity group-hover:opacity-100 ${stripeClass}`} />
                <span className={`font-display text-[12px] sm:text-sm font-semibold leading-tight transition-colors ${textClass}`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
