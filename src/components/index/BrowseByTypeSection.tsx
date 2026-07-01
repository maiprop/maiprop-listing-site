import { Link } from "react-router-dom";
import { useInView } from "@/hooks/useInView";

type BrowseTile = {
  key: string;
  label: string;
  displayLabel?: string;
  browseLabel: string;
  href: string;
  icon: BrowseTypeIconName;
  accent: string;
  surfaceClass: string;
  stripeClass: string;
  textClass: string;
};

type BrowseTypeIconName =
  | "apartment"
  | "house"
  | "land"
  | "newBuild"
  | "retail"
  | "office"
  | "stores"
  | "mixedUse"
  | "commercial";

const BROWSE_TILES: BrowseTile[] = [
  {
    key: "apartment",
    label: "Apartment",
    browseLabel: "apartments",
    href: "/listings?type=apartment",
    icon: "apartment",
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
    icon: "house",
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
    icon: "land",
    accent: "sky",
    surfaceClass: "border-brand-sky/25 bg-brand-sky/10 hover:border-brand-sky/45 hover:bg-brand-sky/15",
    stripeClass: "bg-brand-sky",
    textClass: "text-brand-cyan-deep",
  },
  {
    key: "new_build",
    label: "New Buildings",
    displayLabel: "New Build",
    browseLabel: "new buildings",
    href: "/listings?listing_type=new_build",
    icon: "newBuild",
    accent: "gold",
    surfaceClass: "border-brand-gold/20 bg-brand-gold/5 hover:border-brand-gold/40 hover:bg-brand-gold/10",
    stripeClass: "bg-brand-gold",
    textClass: "text-brand-gold",
  },
  {
    key: "retail_shop",
    label: "Retail Shops",
    displayLabel: "Retail",
    browseLabel: "retail shops",
    href: "/listings?type=commercial&subtype=shop",
    icon: "retail",
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
    icon: "office",
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
    icon: "stores",
    accent: "purple-soft",
    surfaceClass: "border-brand-purple-soft/45 bg-brand-purple-soft/15 hover:border-brand-purple/35 hover:bg-brand-purple-soft/25",
    stripeClass: "bg-brand-purple-soft",
    textClass: "text-brand-purple-dark",
  },
  {
    key: "mixed_use",
    label: "Mixed-use",
    displayLabel: "Mixed Use",
    browseLabel: "mixed-use",
    href: "/listings?type=mixed_use",
    icon: "mixedUse",
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
    icon: "commercial",
    accent: "navy",
    surfaceClass: "border-brand-navy/15 bg-brand-navy/5 hover:border-brand-navy/30 hover:bg-brand-navy/10",
    stripeClass: "bg-brand-navy",
    textClass: "text-brand-navy",
  },
];

function BrowseTypeIcon({ icon }: { icon: BrowseTypeIconName }) {
  const common = {
    className: "browse-type-icon h-4 w-4",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (icon) {
    case "apartment":
      return (
        <svg {...common}>
          <path d="M7 20V5.5L12 3l5 2.5V20" />
          <path d="M9.5 8h5M9.5 11h5M9.5 14h5" />
          <path d="M10 20v-3h4v3M6 20h12" />
        </svg>
      );
    case "house":
      return (
        <svg {...common}>
          <path d="M4 12.5 10 7l4 3.5 2-1.8 4 3.8" />
          <path d="M6.5 12v7h11v-7" />
          <path d="M10 19v-4h4v4M4 19h16" />
        </svg>
      );
    case "land":
      return (
        <svg {...common}>
          <path d="M4 17.5 8.5 7l4.5 3 2.5-4 4.5 11.5H4Z" />
          <path d="M7 15h10M9 12h2.5M14 12h2" />
        </svg>
      );
    case "newBuild":
      return (
        <svg {...common}>
          <path d="M6 20V9h7v11M9 12h1M9 15h1M6 9l7-4h5" />
          <path d="M18 5v4M16 9h4M14 20h5v-7h-5" />
        </svg>
      );
    case "retail":
      return (
        <svg {...common}>
          <path d="M5 10h14l-1.2-4H6.2L5 10Z" />
          <path d="M7 10v9h10v-9M9 19v-4h3v4" />
          <path d="M6 10c1 2 3 2 4 0 1 2 3 2 4 0 1 2 3 2 4 0" />
        </svg>
      );
    case "office":
      return (
        <svg {...common}>
          <path d="M7 20V5l10-2v17" />
          <path d="M10 8h1M14 7h1M10 11h1M14 10h1M10 14h1M14 13h1" />
          <path d="M5 20h14M12 20v-3" />
        </svg>
      );
    case "stores":
      return (
        <svg {...common}>
          <path d="M5 8h14v12H5z" />
          <path d="M7.5 8V5.5h9V8M8 12h8M8 15h8M8 18h8" />
        </svg>
      );
    case "mixedUse":
      return (
        <svg {...common}>
          <path d="M5 20V8l5-3 4 3v12" />
          <path d="M14 20h5V10h-5M8 11h2M8 14h2M16 13h1M16 16h1" />
          <path d="M4 20h16" />
        </svg>
      );
    case "commercial":
      return (
        <svg {...common}>
          <path d="M4 20h16M6 20V9l6-4 6 4v11" />
          <path d="M9 20v-5h6v5M8 11h8M10 8h4" />
        </svg>
      );
  }
}

export function BrowseByTypeSection() {
  const { ref: browseRef, inView: browseInView } = useInView();

  return (
    <section className="py-8 sm:py-12 bg-secondary">
      <div ref={browseRef} className="container">
        <div className={`flex items-center justify-between mb-3 sm:mb-4 reveal ${browseInView ? "in-view" : ""}`}>
          <h2 className="font-display text-xl sm:text-2xl font-bold">Browse by Type</h2>
          <Link to="/listings" className="text-sm text-primary hover:underline shrink-0">
            All
          </Link>
        </div>

        <div
          data-testid="browse-by-type-grid"
          className={`grid grid-cols-3 gap-1.5 sm:gap-2 max-w-3xl reveal reveal-delay-1 ${browseInView ? "in-view" : ""}`}
        >
          {BROWSE_TILES.map(({ key, label, displayLabel, browseLabel, href, icon, accent, surfaceClass, stripeClass, textClass }) => {
            return (
              <Link
                key={key}
                to={href}
                aria-label={`Browse ${browseLabel}`}
                data-accent={accent}
                className={`group relative overflow-hidden rounded-xl border bg-card min-h-[54px] sm:min-h-[58px] px-1 py-1.5 sm:px-2.5 flex flex-row items-center justify-center gap-1 sm:gap-2 text-left hover:shadow-soft transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${surfaceClass}`}
              >
                <span className={`absolute inset-x-0 top-0 h-0.5 opacity-70 transition-opacity group-hover:opacity-100 ${stripeClass}`} />
                <span className={`browse-type-icon-shell flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-current/20 bg-background/65 ${textClass}`}>
                  <BrowseTypeIcon icon={icon} />
                </span>
                <span className={`browse-type-label min-w-0 whitespace-nowrap font-display text-[10px] sm:text-xs font-semibold leading-tight transition-colors ${textClass}`}>
                  {displayLabel ?? label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
