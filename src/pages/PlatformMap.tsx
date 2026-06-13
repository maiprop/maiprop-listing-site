/**
 * /platform-map — Internal visual overview of the platform structure.
 * Shows user types, module access (free vs pro), dashboard nav, and flows.
 * Admin only.
 */
import { Check, X, Lock, Crown, Home, Gavel, Flame, Calendar, Briefcase, ChevronRight, Users, BarChart2, MessageSquare, Heart, Bookmark, Settings, User, Building2, Globe2, TrendingUp, Wrench, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import { Navbar } from "@/components/Navbar";

// ── Data ──────────────────────────────────────────────────────────────────────

const MODULES = [
  { id: "buy-rent",      label: "Buy / Rent",    icon: Home,      color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/30" },
  { id: "auctions",      label: "Auctions",      icon: Gavel,     color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/30" },
  { id: "quick-sale",    label: "Quick Sale",    icon: Flame,     color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30" },
  { id: "open-houses",   label: "Open Houses",   icon: Calendar,  color: "text-emerald-400",bg: "bg-emerald-500/10",border: "border-emerald-500/30" },
  { id: "professionals", label: "Professionals", icon: Briefcase, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
];

type Access = true | false | string;
interface ModuleFeature { label: string; free: Access; pro: Access }

const MODULE_FEATURES: Record<string, ModuleFeature[]> = {
  "buy-rent": [
    { label: "Browse & search listings",         free: true,              pro: true },
    { label: "View listing detail",              free: true,              pro: true },
    { label: "Basic filters",                    free: true,              pro: true },
    { label: "Contact agent",                    free: "1 / month",      pro: "Unlimited" },
    { label: "Advanced filters",                 free: false,            pro: true },
    { label: "Saved searches + alerts",          free: "1 each",         pro: "Unlimited / 5" },
    { label: "Price history & index",            free: false,            pro: true },
    { label: "AI property valuation",            free: false,            pro: "5/month" },
    { label: "Compare tool",                     free: false,            pro: true },
  ],
  "auctions": [
    { label: "Browse court auctions",            free: "60 listings",    pro: "600 listings" },
    { label: "Opening bid & property type",      free: true,             pro: true },
    { label: "Auction officer/platform & date",  free: true,             pro: true },
    { label: "Full auction dossier",             free: false,            pro: true },
    { label: "Auction alerts",                   free: "1 alert",        pro: "5 alerts" },
    { label: "Historical bid data",              free: false,            pro: true },
    { label: "AI discount estimator",            free: false,            pro: true },
  ],
  "quick-sale": [
    { label: "Browse quick-sale listings",       free: true,             pro: true },
    { label: "View price & location",            free: true,             pro: true },
    { label: "Submit property for quick sale",   free: false,            pro: "Seller" },
    { label: "Instant AI valuation",             free: false,            pro: true },
    { label: "Priority placement",               free: false,            pro: true },
    { label: "Investor deal flow pipeline",      free: false,            pro: "Investor" },
  ],
  "open-houses": [
    { label: "Browse upcoming open houses",      free: true,             pro: true },
    { label: "RSVP attendance",                  free: "3/month",        pro: "Unlimited" },
    { label: "View address & host",              free: true,             pro: true },
    { label: "Private / video viewing",          free: false,            pro: true },
    { label: "Branded video room (host)",        free: false,            pro: true },
    { label: "Attendance analytics (host)",      free: false,            pro: true },
    { label: "Lead capture from open house",     free: false,            pro: true },
  ],
  "professionals": [
    { label: "Browse directory",                 free: true,             pro: true },
    { label: "View public profile",              free: true,             pro: true },
    { label: "Send enquiry",                     free: "5/category",     pro: "Unlimited" },
    { label: "Book consultation",                free: false,            pro: true },
    { label: "AI service matching",              free: false,            pro: true },
    { label: "Direct messaging",                 free: false,            pro: true },
    { label: "Create professional profile",      free: false,            pro: "Pro account" },
    { label: "CRM tools (professional)",         free: false,            pro: "Pro account" },
  ],
};

const USER_TYPES = [
  { id: "buyer",        label: "Buyer / Renter",  color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/30",   role: "buyer" },
  { id: "seller",       label: "Seller",           color: "text-emerald-400",bg: "bg-emerald-500/10",border: "border-emerald-500/30", role: "seller" },
  { id: "agent",        label: "Agent",            color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/30",  role: "agent" },
  { id: "developer",    label: "Developer",        color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", role: "developer" },
  { id: "professional", label: "Professional",     color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30", role: "professional" },
];

const NAV_ICONS: Record<string, React.ElementType> = {
  overview: Home, listings: Building2, analytics: BarChart2, saved: Heart,
  "saved-searches": Bookmark, messages: MessageSquare, viewings: Calendar,
  auctions: Gavel, "open-houses": Calendar, services: Wrench, booking: FolderKanban,
  leads: Briefcase, contacts: Users, projects: Globe2, portfolios: TrendingUp,
  profile: User, settings: Settings, "deal-flow": FolderKanban,
};

const NAV_PRO: Record<string, string[]> = {
  buyer:        ["overview", "saved", "saved-searches", "open-houses", "messages", "viewings", "auctions", "profile", "settings"],
  seller:       ["overview", "listings", "saved", "messages", "viewings", "open-houses", "profile", "settings"],
  agent:        ["overview", "listings", "analytics", "saved", "saved-searches", "messages", "viewings", "auctions", "open-houses", "leads", "contacts", "profile", "settings"],
  developer:    ["overview", "listings", "analytics", "saved", "saved-searches", "messages", "viewings", "leads", "contacts", "projects", "portfolios", "profile", "settings"],
  professional: ["overview", "services", "booking", "leads", "contacts", "analytics", "messages", "viewings", "profile", "settings"],
};

const NAV_FREE: Record<string, string[]> = {
  buyer:        ["overview", "saved", "saved-searches", "open-houses", "messages", "viewings", "auctions", "profile", "settings"],
  seller:       ["overview", "listings", "saved", "messages", "viewings", "open-houses", "profile", "settings"],
  agent:        ["overview", "listings", "saved", "messages", "viewings", "auctions", "open-houses", "leads", "profile", "settings"],
  developer:    ["overview", "listings", "messages", "leads", "profile", "settings"],
  professional: ["overview", "services", "leads", "messages", "profile", "settings"],
};

const PRO_GATED = ["analytics", "contacts", "leads", "booking", "projects", "portfolios", "saved-searches"];

const PRICING: Record<string, { free: string; pro: string; proPrice: string }> = {
  buyer:        { free: "€0",  pro: "Participant Pro", proPrice: "€19/mo" },
  seller:       { free: "€0",  pro: "Participant Pro", proPrice: "€19/mo" },
  agent:        { free: "€0",  pro: "Agent Pro",       proPrice: "€149/mo" },
  developer:    { free: "—",   pro: "Developer Pro",   proPrice: "€89/mo" },
  professional: { free: "€0",  pro: "Pro Plan",        proPrice: "€49/mo" },
};

const FLOWS: Record<string, string[]> = {
  buyer:        ["Signup", "Onboarding (__type:buyer)", "Dashboard", "Browse Listings / Auctions / Open Houses", "Save & Alert", "Book Viewing", "Contact Agent", "Upgrade to Pro"],
  seller:       ["Signup", "Onboarding (__type:seller)", "Dashboard", "Create Listing", "Manage Viewings", "Open House Hosting", "Quick Sale Submit (Pro)", "Analytics (Pro)"],
  agent:        ["Signup", "Onboarding (__type:agent)", "Dashboard", "Manage Listings (5 free / ∞ Pro)", "CRM — Leads & Contacts (Pro)", "Analytics (Pro)", "Priority Ads (Pro)", "Professional Profile"],
  developer:    ["Signup", "Onboarding (__type:developer)", "Dashboard", "Create New Buildings (Pro only)", "Portfolio Tracking (Pro)", "Featured Placement (Pro)", "Project Ads (Pro)"],
  professional: ["Signup", "Onboarding (__type:professional)", "Dashboard", "Professional Directory Listing", "Receive Leads", "Booking Calendar (Pro)", "AI Service Match (Pro)", "Branded Video Room (Pro)"],
};

// ── Sub-components ────────────────────────────────────────────────────────────

function AccessCell({ value }: { value: Access }) {
  if (value === true)  return <Check className="w-4 h-4 text-emerald-400 mx-auto" />;
  if (value === false) return <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />;
  return <span className="text-[11px] text-primary font-medium leading-tight text-center block">{value}</span>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2 mb-4">
      {children}
    </h2>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlatformMap() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16 pb-24">
        <div className="container max-w-7xl px-4 py-10 space-y-14">

          {/* Header */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-4">
              Internal
            </div>
            <h1 className="font-display text-4xl font-black mb-2">Platform Map</h1>
            <p className="text-muted-foreground">User types, module access, dashboard nav, and flows at a glance.</p>
          </div>

          {/* ── 1. User Types & Pricing ─────────────────────────────────────── */}
          <section>
            <SectionTitle><Users className="w-5 h-5 text-primary" /> User Types & Pricing</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {USER_TYPES.map(u => {
                const p = PRICING[u.id];
                return (
                  <div key={u.id} className={cn("glass-card rounded-xl border p-4 flex flex-col gap-2", u.border)}>
                    <div className={cn("text-xs font-bold uppercase tracking-widest", u.color)}>{u.label}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{u.role}</div>
                    <div className="mt-auto pt-2 border-t border-border space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Free</span>
                        <span className="font-semibold">{p.free}</span>
                      </div>
                      <div className={cn("flex items-center justify-between text-xs", u.color)}>
                        <Crown className="w-3 h-3" />
                        <span className="font-bold">{p.proPrice}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── 2. Module Access Matrix ─────────────────────────────────────── */}
          <section>
            <SectionTitle><Lock className="w-5 h-5 text-primary" /> Module Access (Free vs Pro)</SectionTitle>
            <div className="space-y-6">
              {MODULES.map(mod => {
                const features = MODULE_FEATURES[mod.id] ?? [];
                const Icon = mod.icon;
                return (
                  <div key={mod.id} className={cn("glass-card rounded-xl border overflow-hidden", mod.border)}>
                    <div className={cn("flex items-center gap-2 px-4 py-3 border-b", mod.bg, mod.border)}>
                      <Icon className={cn("w-4 h-4", mod.color)} />
                      <span className={cn("font-bold text-sm", mod.color)}>{mod.label}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-secondary/40">
                            <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground w-1/2">Feature</th>
                            <th className="text-center px-4 py-2 text-xs font-semibold text-muted-foreground w-1/4">Free</th>
                            <th className={cn("text-center px-4 py-2 text-xs font-bold w-1/4", mod.color)}>
                              <Crown className="w-3 h-3 inline mr-1" />Pro
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {features.map((f, i) => (
                            <tr key={f.label} className={cn("border-b border-border/50 last:border-0", i % 2 === 0 ? "" : "bg-secondary/20")}>
                              <td className="px-4 py-2 text-xs text-foreground">{f.label}</td>
                              <td className="px-4 py-2 text-center"><AccessCell value={f.free} /></td>
                              <td className="px-4 py-2 text-center"><AccessCell value={f.pro} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── 3. Dashboard Nav per User Type ──────────────────────────────── */}
          <section>
            <SectionTitle><Home className="w-5 h-5 text-primary" /> Dashboard Navigation</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {USER_TYPES.map(u => {
                const proNav   = NAV_PRO[u.id] ?? [];
                const freeNav  = NAV_FREE[u.id] ?? [];
                const proOnly  = proNav.filter(k => !freeNav.includes(k));
                return (
                  <div key={u.id} className={cn("glass-card rounded-xl border overflow-hidden", u.border)}>
                    <div className={cn("px-3 py-2.5 border-b text-xs font-bold uppercase tracking-widest", u.bg, u.border, u.color)}>
                      {u.label}
                    </div>
                    <div className="p-3 space-y-1">
                      {proNav.map(key => {
                        const Icon = NAV_ICONS[key] ?? Home;
                        const isProOnly = proOnly.includes(key);
                        const isGated  = PRO_GATED.includes(key);
                        return (
                          <div key={key} className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs",
                            isGated ? "bg-primary/5 border border-primary/20" : "bg-secondary/40"
                          )}>
                            <Icon className={cn("w-3 h-3 shrink-0", isGated ? "text-primary" : "text-muted-foreground")} />
                            <span className={cn("flex-1 capitalize", isGated ? "text-foreground font-medium" : "text-muted-foreground")}>
                              {key.replace(/-/g, " ")}
                            </span>
                            {isGated && <Lock className="w-2.5 h-2.5 text-primary shrink-0" />}
                            {isProOnly && !isGated && <Crown className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-primary/5 border border-primary/20 inline-block" /><Lock className="w-3 h-3 text-primary" /> Pro-gated (blurred for free)</span>
              <span className="flex items-center gap-1.5"><Crown className="w-3 h-3 text-amber-400" /> Pro nav only</span>
            </div>
          </section>

          {/* ── 4. User Flows ───────────────────────────────────────────────── */}
          <section>
            <SectionTitle><ChevronRight className="w-5 h-5 text-primary" /> User Flows</SectionTitle>
            <div className="space-y-3">
              {USER_TYPES.map(u => (
                <div key={u.id} className={cn("glass-card rounded-xl border p-4", u.border)}>
                  <div className={cn("text-xs font-bold uppercase tracking-widest mb-3", u.color)}>{u.label}</div>
                  <div className="flex items-start gap-0 flex-wrap">
                    {FLOWS[u.id].map((step, i) => (
                      <div key={step} className="flex items-center gap-0">
                        <div className={cn(
                          "text-xs px-2.5 py-1 rounded-full border whitespace-nowrap",
                          step.includes("Pro") ? cn(u.bg, u.border, u.color, "font-semibold") : "bg-secondary/60 border-border text-muted-foreground"
                        )}>
                          {step}
                        </div>
                        {i < FLOWS[u.id].length - 1 && (
                          <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0 mx-0.5" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── 5. Gating Summary ───────────────────────────────────────────── */}
          <section>
            <SectionTitle><Lock className="w-5 h-5 text-primary" /> Gating Strategy</SectionTitle>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { title: "Actions (buttons/forms)", desc: "Disabled with inline upgrade tooltip. Never redirect mid-flow.", icon: "🔘" },
                { title: "Data (charts/dossiers)", desc: "Rendered with blur overlay + ProGate lock. Content exists in DOM for SEO.", icon: "📊" },
                { title: "Nav items", desc: "All sections visible to all users. Gating is inside the section, not on the nav item.", icon: "🗂️" },
              ].map(g => (
                <div key={g.title} className="glass-card rounded-xl border border-border p-4">
                  <div className="text-2xl mb-2">{g.icon}</div>
                  <div className="font-semibold text-sm mb-1">{g.title}</div>
                  <div className="text-xs text-muted-foreground">{g.desc}</div>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
