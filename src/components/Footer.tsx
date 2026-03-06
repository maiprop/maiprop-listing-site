import { Link } from "react-router-dom";
import { Facebook, Twitter, Instagram, Linkedin, Youtube, Mail, Phone, MapPin, ExternalLink } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-card border-t border-border">
      <div className="container py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                  <span className="font-display font-bold text-sm text-background">m</span>
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-accent flex items-center justify-center">
                  <span className="text-[6px] font-bold text-accent-foreground">AI</span>
                </div>
              </div>
              <span className="font-display font-bold text-lg tracking-tight">
                mai<span className="gradient-text-cyan">prop</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-4">
              Greece's most advanced real estate platform. Data-driven listings, Greek auctions, instant offers, and AI-powered market insights.
            </p>
            <div className="flex items-center gap-2">
              {[Facebook, Twitter, Instagram, Linkedin, Youtube].map((Icon, i) => (
                <button key={i} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div>
            <h4 className="font-display font-semibold text-sm mb-3">Platform</h4>
            <ul className="space-y-2">
              {["Buy Property", "Rent Property", "Sell Property", "Greek Auctions", "Firesale™", "Market Data", "AI Reports"].map(item => (
                <li key={item}>
                  <Link to="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{item}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Professionals */}
          <div>
            <h4 className="font-display font-semibold text-sm mb-3">Professionals</h4>
            <ul className="space-y-2">
              {["Agent Directory", "Legal Experts", "Architects", "Contractors", "Property Managers", "Valuers", "Join as Pro"].map(item => (
                <li key={item}>
                  <Link to="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{item}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-display font-semibold text-sm mb-3">Company</h4>
            <ul className="space-y-2">
              {["About Us", "Careers", "Press", "Blog", "Privacy Policy", "Terms of Service", "Cookie Policy"].map(item => (
                <li key={item}>
                  <Link to="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{item}</Link>
                </li>
              ))}
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
