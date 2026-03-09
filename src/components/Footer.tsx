import { Link } from "react-router-dom";
import { Facebook, Twitter, Instagram, Linkedin, Youtube, Mail, Phone, MapPin, ExternalLink } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-card border-t border-border">
      <div className="container py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="lg:col-span-2">
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-4">
              Greece's most advanced real estate platform. Data-driven listings, Greek auctions, instant offers, and AI-powered market insights.
            </p>
            <div className="flex items-center gap-2">
              {[Facebook, Twitter, Instagram, Linkedin, Youtube].map((Icon, i) =>
              <button key={i} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <Icon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Platform */}
          <div>
            <h4 className="font-display font-semibold text-sm mb-3">Platform</h4>
            <ul className="space-y-2">
              {[
              { label: "Buy Property", to: "/listings?listing_type=sale" },
              { label: "Rent Property", to: "/listings?listing_type=rent" },
              { label: "Sell Property", to: "/firesale" },
              { label: "Greek Auctions", to: "/auctions" },
              { label: "Quick Sale™", to: "/firesale" },
              { label: "Professionals", to: "/professionals" },
              { label: "AI Reports", to: "/listings" }].
              map((item) =>
              <li key={item.label}>
                  <Link to={item.to} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{item.label}</Link>
                </li>
              )}
            </ul>
          </div>

          {/* Professionals */}
          <div>
            <h4 className="font-display font-semibold text-sm mb-3">Professionals</h4>
            <ul className="space-y-2">
              {[
              { label: "Agent Directory", to: "/professionals" },
              { label: "Legal Experts", to: "/professionals?category=lawyer" },
              { label: "Architects", to: "/professionals?category=architect" },
              { label: "Contractors", to: "/professionals?category=contractor" },
              { label: "Property Managers", to: "/professionals?category=property_manager" },
              { label: "Valuers", to: "/professionals?category=valuer" },
              { label: "Join as Pro", to: "/signup" }].
              map((item) =>
              <li key={item.label}>
                  <Link to={item.to} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{item.label}</Link>
                </li>
              )}
            </ul>
          </div>

          {/* Legal + Contact */}
          <div>
            <h4 className="font-display font-semibold text-sm mb-3">Legal</h4>
            <ul className="space-y-2">
              {[
              { label: "Privacy Policy", to: "/privacy-policy" },
              { label: "Terms of Service", to: "/terms-of-service" },
              { label: "Cookie Policy", to: "/cookie-policy" }].
              map((item) =>
              <li key={item.label}>
                  <Link to={item.to} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{item.label}</Link>
                </li>
              )}
            </ul>
            <div className="mt-4 space-y-1">
              <a href="mailto:hello@maiprop.co" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Mail className="w-3 h-3" /> hello@maiprop.co
              </a>
              <a href="tel:+302101234567" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Phone className="w-3 h-3" /> +30 210 123 4567
              </a>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" /> Athens, Greece
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
              href="https://os.maiprop.co"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border hover:border-primary/40 hover:bg-primary/5 transition-all group">
              <span className="text-base leading-none">🖥️</span>
              <div>
                <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">maiProp OS</div>
                <div className="text-[10px] text-muted-foreground leading-tight">Operator platform</div>
              </div>
              <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors ml-0.5" />
            </a>

            {/* mai Properties */}
            <a
              href="https://properties.maiprop.co"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border hover:border-brand-gold/40 hover:bg-brand-gold/5 transition-all group">
              <span className="text-base leading-none">🏛️</span>
              <div>
                <div className="text-xs font-semibold text-foreground group-hover:text-brand-gold transition-colors leading-tight">mai Properties</div>
                <div className="text-[10px] text-muted-foreground leading-tight">Investment &amp; Golden Visa</div>
              </div>
              <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-brand-gold transition-colors ml-0.5" />
            </a>

            {/* maiProp (current) */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-base leading-none">🔍</span>
              <div>
                <div className="text-xs font-semibold text-primary leading-tight">maiProp</div>
                <div className="text-[10px] text-muted-foreground leading-tight">You are here</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>© 2026 maiProp. All rights reserved. Powered by mAI Prop OS.</span>
          <div className="flex items-center gap-1">
            <span>Powered by</span>
            <a href="https://os.maiprop.co" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
              mAI Prop OS <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
