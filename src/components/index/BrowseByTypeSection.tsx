import { ArrowUpRight, Blocks, BriefcaseBusiness, Building2, Hammer, House, Layers3, Map, Store, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useInView } from "@/hooks/useInView";

type BrowseTile = {
  key: string;
  label: string;
  displayLabel?: string;
  browseLabel: string;
  href: string;
  icon: LucideIcon;
  summary: string;
  surfaceClass: string;
  iconShellClass: string;
  iconClass: string;
};

const HOME_TILES: BrowseTile[] = [
  {
    key: "apartment",
    label: "Apartment",
    browseLabel: "apartments",
    href: "/listings?type=apartment",
    icon: Building2,
    summary: "City apartments and everyday demand",
    surfaceClass: "border-brand-purple/20 bg-[radial-gradient(circle_at_top_left,rgba(123,63,242,0.16),transparent_58%),linear-gradient(180deg,rgba(123,63,242,0.08),rgba(255,255,255,0.98))] hover:border-brand-purple/35",
    iconShellClass: "border-brand-purple/20 bg-background/85 text-brand-purple shadow-[0_10px_30px_rgba(123,63,242,0.12)]",
    iconClass: "text-brand-purple",
  },
  {
    key: "house",
    label: "Houses",
    browseLabel: "houses",
    href: "/listings?type=house",
    icon: House,
    summary: "Townhouses, detached homes and gardens",
    surfaceClass: "border-brand-emerald/20 bg-[linear-gradient(180deg,rgba(11,132,92,0.08),rgba(255,255,255,0.98))] hover:border-brand-emerald/35",
    iconShellClass: "border-brand-emerald/20 bg-background/85 text-brand-emerald",
    iconClass: "text-brand-emerald",
  },
  {
    key: "land",
    label: "Land",
    browseLabel: "land",
    href: "/listings?type=land",
    icon: Map,
    summary: "Fields, plots and development land",
    surfaceClass: "border-brand-sky/25 bg-[linear-gradient(180deg,rgba(109,235,255,0.14),rgba(255,255,255,0.98))] hover:border-brand-sky/45",
    iconShellClass: "border-brand-sky/25 bg-background/85 text-brand-cyan-deep",
    iconClass: "text-brand-cyan-deep",
  },
];

const PROJECT_TILES: BrowseTile[] = [
  {
    key: "new_build",
    label: "New Buildings",
    displayLabel: "New Build",
    browseLabel: "new buildings",
    href: "/listings?listing_type=new_build",
    icon: Hammer,
    summary: "Off-plan launches, projects and unit releases",
    surfaceClass: "border-brand-gold/20 bg-[radial-gradient(circle_at_top_right,rgba(255,184,0,0.18),transparent_54%),linear-gradient(180deg,rgba(255,184,0,0.08),rgba(255,255,255,0.98))] hover:border-brand-gold/40",
    iconShellClass: "border-brand-gold/20 bg-background/85 text-brand-gold shadow-[0_10px_30px_rgba(255,184,0,0.14)]",
    iconClass: "text-brand-gold",
  },
  {
    key: "mixed_use",
    label: "Mixed-use",
    displayLabel: "Mixed Use",
    browseLabel: "mixed-use",
    href: "/listings?type=mixed_use",
    icon: Layers3,
    summary: "Projects mixing living, retail and income floors",
    surfaceClass: "border-brand-cyan-soft/60 bg-[linear-gradient(180deg,rgba(149,250,245,0.18),rgba(255,255,255,0.98))] hover:border-brand-cyan/35",
    iconShellClass: "border-brand-cyan-soft/60 bg-background/85 text-brand-cyan-deep",
    iconClass: "text-brand-cyan-deep",
  },
];

const BUSINESS_TILES: BrowseTile[] = [
  {
    key: "office",
    label: "Offices",
    browseLabel: "offices",
    href: "/listings?type=office",
    icon: BriefcaseBusiness,
    summary: "Studios, headquarters and work hubs",
    surfaceClass: "border-brand-cyan/25 bg-[linear-gradient(180deg,rgba(63,211,198,0.12),rgba(255,255,255,0.98))] hover:border-brand-cyan/40",
    iconShellClass: "border-brand-cyan/25 bg-background/85 text-brand-cyan-deep",
    iconClass: "text-brand-cyan-deep",
  },
  {
    key: "retail_shop",
    label: "Retail Shops",
    displayLabel: "Retail",
    browseLabel: "retail shops",
    href: "/listings?type=commercial&subtype=shop",
    icon: Store,
    summary: "Footfall-driven shops and corner units",
    surfaceClass: "border-brand-indigo/20 bg-[linear-gradient(180deg,rgba(85,94,255,0.08),rgba(255,255,255,0.98))] hover:border-brand-indigo/35",
    iconShellClass: "border-brand-indigo/20 bg-background/85 text-brand-indigo",
    iconClass: "text-brand-indigo",
  },
  {
    key: "stores",
    label: "Stores",
    browseLabel: "stores",
    href: "/listings?type=storage",
    icon: Warehouse,
    summary: "Storage units and distribution space",
    surfaceClass: "border-brand-purple-soft/45 bg-[linear-gradient(180deg,rgba(192,167,255,0.16),rgba(255,255,255,0.98))] hover:border-brand-purple/30",
    iconShellClass: "border-brand-purple-soft/45 bg-background/85 text-brand-purple-dark",
    iconClass: "text-brand-purple-dark",
  },
  {
    key: "commercial",
    label: "Commercial",
    browseLabel: "commercial",
    href: "/listings?type=commercial",
    icon: Blocks,
    summary: "Broader income-producing inventory",
    surfaceClass: "border-brand-navy/15 bg-[linear-gradient(180deg,rgba(12,26,62,0.06),rgba(255,255,255,0.98))] hover:border-brand-navy/30",
    iconShellClass: "border-brand-navy/15 bg-background/85 text-brand-navy",
    iconClass: "text-brand-navy",
  },
];

type BrowseCardVariant = "hero" | "spotlight" | "compact";

const MOBILE_SHELF_CLASS = "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%_-_28px),transparent)] [mask-image:linear-gradient(to_right,black_calc(100%_-_28px),transparent)] sm:grid sm:overflow-visible sm:pb-0 sm:[-webkit-mask-image:none] sm:[mask-image:none] [&::-webkit-scrollbar]:hidden";

function BrowseTypeCard({
  tile,
  variant,
  className = "",
}: {
  tile: BrowseTile;
  variant: BrowseCardVariant;
  className?: string;
}) {
  const Icon = tile.icon;

  const variantClassName =
    variant === "hero"
      ? "min-h-[168px] w-[82vw] max-w-[320px] p-4 sm:min-h-[264px] sm:w-auto sm:max-w-none sm:p-5"
      : variant === "spotlight"
        ? "min-h-[168px] w-[82vw] max-w-[320px] p-4 sm:min-h-[132px] sm:w-auto sm:max-w-none xl:min-h-[170px]"
        : "min-h-[156px] w-[82vw] max-w-[320px] p-4 sm:min-h-[132px] sm:w-auto sm:max-w-none";

  const titleClassName =
    variant === "hero"
      ? "text-xl sm:text-[1.65rem]"
      : variant === "spotlight"
        ? "text-lg sm:text-xl"
        : "text-base sm:text-lg";

  const summaryClassName = variant === "compact" ? "text-sm leading-relaxed" : "text-sm leading-relaxed sm:text-[15px]";
  const iconShellSize = variant === "compact" ? "h-10 w-10 rounded-lg" : "h-12 w-12 rounded-lg";
  const arrowSize = variant === "compact" ? "h-4 w-4" : "h-5 w-5";

  return (
    <Link
      key={tile.key}
      to={tile.href}
      aria-label={`Browse ${tile.browseLabel}`}
      data-card-variant={variant}
      className={`group relative flex h-full flex-none snap-start flex-col overflow-hidden rounded-lg border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:flex-auto ${variantClassName} ${tile.surfaceClass} ${className}`}
    >
      <span className="absolute inset-x-0 top-0 h-px bg-white/70" />
      <span className="absolute right-0 top-0 h-24 w-24 rounded-full bg-white/45 blur-2xl transition-opacity group-hover:opacity-80" aria-hidden />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <span className={`flex shrink-0 items-center justify-center border ${iconShellSize} ${tile.iconShellClass}`}>
            <Icon className={`h-5 w-5 ${tile.iconClass}`} aria-hidden />
          </span>
        </div>

        <div className={`${variant === "compact" ? "mt-6" : "mt-auto"} space-y-2`}>
          <div className="flex items-end justify-between gap-3">
            <div className="space-y-1.5">
              <p className={`font-display font-semibold leading-tight text-foreground ${titleClassName}`}>
                {tile.displayLabel ?? tile.label}
              </p>
              <p className={`max-w-[24ch] text-muted-foreground ${summaryClassName}`}>
                {tile.summary}
              </p>
            </div>
            <ArrowUpRight className={`${arrowSize} shrink-0 opacity-55 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100 ${tile.iconClass}`} aria-hidden />
          </div>
        </div>
      </div>
    </Link>
  );
}

export function BrowseByTypeSection() {
  const { ref: browseRef, inView: browseInView } = useInView();

  return (
    <section className="bg-secondary py-8 sm:py-12">
      <div ref={browseRef} className="container">
        <div className={`mb-5 flex items-center justify-between gap-3 reveal ${browseInView ? "in-view" : ""}`}>
          <div className="space-y-1.5">
            <h2 className="font-display text-xl font-bold sm:text-2xl">Browse by Type</h2>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Choose a lane and jump straight into the inventory that matches how people actually shop: living spaces, new-build projects, and business stock.
            </p>
          </div>
          <Link
            to="/listings"
            className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:border-primary/30 hover:bg-primary/5"
          >
            All
          </Link>
        </div>

        <div
          data-testid="browse-by-type-board"
          className={`grid grid-cols-1 items-start gap-6 xl:grid-cols-12 reveal reveal-delay-1 ${browseInView ? "in-view" : ""}`}
        >
          <section
            data-testid="browse-by-type-group-homes"
            className="space-y-4 xl:col-span-5"
          >
            <div className="flex items-start justify-between gap-4 border-b border-brand-purple/15 pb-3 xl:min-h-[96px]">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase text-brand-purple">Living Spaces</p>
                <p className="text-sm leading-relaxed text-muted-foreground">Apartments, houses and land with strong day-to-day demand.</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-brand-purple/15 bg-brand-purple/8 text-brand-purple">
                <Building2 className="h-5 w-5" aria-hidden />
              </span>
            </div>

            <div data-testid="browse-by-type-group-homes-cards" className={`${MOBILE_SHELF_CLASS} sm:grid-cols-2`}>
              <BrowseTypeCard tile={HOME_TILES[0]} variant="hero" className="sm:row-span-2" />
              <BrowseTypeCard tile={HOME_TILES[1]} variant="compact" />
              <BrowseTypeCard tile={HOME_TILES[2]} variant="compact" />
            </div>
          </section>

          <section
            data-testid="browse-by-type-group-projects"
            className="space-y-4 xl:col-span-3"
          >
            <div className="flex items-start justify-between gap-4 border-b border-brand-gold/20 pb-3 xl:min-h-[96px]">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase text-brand-gold">Projects &amp; Hybrid</p>
                <p className="text-sm leading-relaxed text-muted-foreground">Project-led inventory for buyers comparing launches, phases and hybrid schemes.</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-brand-gold/20 bg-brand-gold/8 text-brand-gold">
                <Hammer className="h-5 w-5" aria-hidden />
              </span>
            </div>

            <div data-testid="browse-by-type-group-projects-cards" className={MOBILE_SHELF_CLASS}>
              <BrowseTypeCard tile={PROJECT_TILES[0]} variant="spotlight" />
              <BrowseTypeCard tile={PROJECT_TILES[1]} variant="compact" />
            </div>
          </section>

          <section
            data-testid="browse-by-type-group-commercial"
            className="space-y-4 xl:col-span-4"
          >
            <div className="flex items-start justify-between gap-4 border-b border-brand-navy/10 pb-3 xl:min-h-[96px]">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase text-brand-navy">Business Space</p>
                <p className="text-sm leading-relaxed text-muted-foreground">Workspace, retail and logistics inventory across investment-ready formats.</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-brand-navy/10 bg-brand-navy/5 text-brand-navy">
                <BriefcaseBusiness className="h-5 w-5" aria-hidden />
              </span>
            </div>

            <div data-testid="browse-by-type-group-commercial-cards" className={`${MOBILE_SHELF_CLASS} sm:grid-cols-2`}>
              {BUSINESS_TILES.map((tile) => (
                <BrowseTypeCard key={tile.key} tile={tile} variant="compact" />
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
