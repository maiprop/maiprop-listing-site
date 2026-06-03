import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="bg-card border-t border-border">
      <div className="container py-10 sm:py-16">
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-5 gap-6 sm:gap-8">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-2">
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-4">
              {t("footerFull.tagline")}
            </p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="font-display font-semibold text-sm mb-3">{t("footerFull.platform.title")}</h4>
            <ul className="space-y-2">
              {[
              { label: t("footerFull.platform.buy"), to: "/listings?listing_type=sale" },
              { label: t("footerFull.platform.rent"), to: "/listings?listing_type=rent" },
              { label: t("footerFull.platform.auctions"), to: "/auctions" },
              { label: t("footerFull.platform.quickSale"), to: "/firesale" },
              { label: t("footerFull.platform.professionals"), to: "/professionals" },
              { label: t("footerFull.platform.openHouses"), to: "/open-houses" },
              { label: t("footerFull.platform.pricing"), to: "/pricing" }].
              map((item) =>
              <li key={item.label}>
                  <Link to={item.to} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{item.label}</Link>
                </li>
              )}
            </ul>
          </div>

          {/* Professionals */}
          <div>
            <h4 className="font-display font-semibold text-sm mb-3">{t("footerFull.professionals.title")}</h4>
            <ul className="space-y-2">
              {[
              { label: t("footerFull.professionals.agents"), to: "/professionals?category=real_estate_agent" },
              { label: t("footerFull.professionals.legal"), to: "/professionals?category=lawyer" },
              { label: t("footerFull.professionals.finance"), to: "/professionals?category=financial_advisor" },
              { label: t("footerFull.professionals.design"), to: "/professionals?category=architect" },
              { label: t("footerFull.professionals.construction"), to: "/professionals?category=contractor" },
              { label: t("footerFull.professionals.consultants"), to: "/professionals?category=utility_certification_provider" },
              { label: t("footerFull.professionals.hospitality"), to: "/professionals?category=property_manager" },
              { label: t("footerFull.professionals.advisory"), to: "/professionals?category=relocation_immigration_consultant" },
              { label: t("footerFull.professionals.join"), to: "/signup" }].
              map((item) =>
              <li key={item.label}>
                  <Link to={item.to} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{item.label}</Link>
                </li>
              )}
            </ul>
          </div>

          {/* Legal + Contact */}
          <div>
            <h4 className="font-display font-semibold text-sm mb-3">{t("footerFull.legal.title")}</h4>
            <ul className="space-y-2">
              {[
              { label: t("footerFull.legal.privacy"), to: "/privacy-policy" },
              { label: t("footerFull.legal.terms"), to: "/terms-of-service" },
              { label: t("footerFull.legal.cookies"), to: "/cookie-policy" }].
              map((item) =>
              <li key={item.label}>
                  <Link to={item.to} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{item.label}</Link>
                </li>
              )}
            </ul>
            <div className="mt-4 space-y-1">
              <span className="flex min-h-6 items-center text-xs font-medium text-foreground">mAI prop</span>
              <span className="flex min-h-6 items-center text-xs text-muted-foreground">Data Estate PC</span>
              <span className="flex min-h-6 items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" aria-hidden="true" /> Akadimias 32, 106 72, Athens, Greece
              </span>
            </div>
          </div>
        </div>

        <div className="section-divider my-8" />

        {/* Our Products row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">Our Products</span>
          <div className="flex flex-wrap items-center gap-3">
            {/* maiProp OS */}
            <a
              href="https://os.maiprop.co/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="mAI prop OS"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border hover:border-primary/40 transition-colors"
            >
              <span className="text-base leading-none">🖥️</span>
              <div>
                <div className="text-xs font-semibold text-foreground leading-tight">mAI prop OS</div>
                <div className="text-[10px] text-muted-foreground leading-tight">Operator platform</div>
              </div>
            </a>

            {/* mai Properties */}
            <a
              href="https://properties.maiprop.co/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="mAI properties"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border hover:border-primary/40 transition-colors"
            >
              <span className="text-base leading-none">🏛️</span>
              <div>
                <div className="text-xs font-semibold text-foreground leading-tight">mAI properties</div>
                <div className="text-[10px] text-muted-foreground leading-tight">Investment properties</div>
              </div>
            </a>

            {/* maiProp (current) */}
            <Link
              to="/"
              aria-label="mAI prop home"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 hover:border-primary/40 transition-colors"
            >
              <span className="text-base leading-none">🔍</span>
              <div>
                <div className="text-xs font-semibold text-primary leading-tight">mAI prop</div>
                <div className="text-[10px] text-muted-foreground leading-tight">You are here</div>
              </div>
            </Link>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>{t("footer.copyright", { year: new Date().getFullYear() })}</span>
          <div className="flex items-center gap-1">
            <span>Powered by</span>
            <span className="text-primary">mAI prop OS</span>
          </div>
        </div>
      </div>
    </footer>);

}
