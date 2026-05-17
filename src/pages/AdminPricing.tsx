import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { isPlatformAdmin } from "@/lib/authUtils";
import { SlidersHorizontal, Save, Plus, Loader2, Shield, Euro, Trash2, Sparkles, X as XIcon, CreditCard, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

type PricingConfig = {
  id: string;
  created_at: string;
  updated_at: string;
  key: string;
  label: string;
  description: string | null;
  audience: string;
  module: string;
  unit: string;
  currency: string;
  amount: number;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown> | null;
};

/** Predefined sections so admin can manage all pricings: users, professionals, agents, valuation, investors, ad-hoc */
const PRICING_SECTIONS = [
  { key: "users",        label: "Users (consumers)",         module: "user_subscription",         audience: "participant" },
  { key: "agents",       label: "Agents",                    module: "agent_subscription",        audience: "agent" },
  { key: "developers",   label: "Developers",                module: "developer_subscription",    audience: "developer" },
  { key: "professionals",label: "Professionals",             module: "professional_subscription", audience: "professional" },
  { key: "investors",    label: "Investors",                 module: "investor_subscription",     audience: "investor" },
  { key: "valuation",    label: "Valuation / AI reports",    module: "valuation_reports",         audience: "participant" },
  { key: "adhoc_user",   label: "Ad-hoc — listings / users", module: "adhoc_charges",             audience: "participant" },
  { key: "adhoc_agent",  label: "Add-ons — agents",          module: "adhoc_charges",             audience: "agent" },
  { key: "adhoc_pro",    label: "Add-ons — professionals",   module: "adhoc_charges",             audience: "professional" },
  { key: "os_data",      label: "OS Data Products (B2B)",    module: "os_data_products",          audience: "participant" },
] as const;

const MODULES = [
  "user_subscription",
  "professional_subscription",
  "agent_subscription",
  "developer_subscription",
  "investor_subscription",
  "valuation_reports",
  "firesale_dashboard",
  "adhoc_charges",
  "pro_tools",
  "listings",
  "os_data_products",
] as const;

const AUDIENCES = ["participant", "professional", "agent", "developer", "investor", "institutional"] as const;

/**
 * Default pricing — Greek market rates (aligned with /pricing page).
 * Participant Pro €29/mo · Agent Pro €149/mo · Developer Pro €129/mo
 * Professional Pro €69/mo
 *
 * Investor & Institutional are invitation-only — their `amount` is 0 here
 * and the canonical price is set per application via a one-off Stripe
 * Payment Link. The `metadata.by_application` flag indicates this.
 *
 * Agents and Professionals only have **Free + Pro** plans on the public
 * pricing page. Anything beyond that (extra seats, branding, white-label,
 * API access, referral network) is sold as an add-on under
 * `module: adhoc_charges`. The previous bundled `agency_*` and
 * `professional_premium` tiers are seeded with `is_active: false` for
 * historical reference; they are not displayed anywhere.
 */
const DEFAULT_SEED: Omit<PricingConfig, "id" | "created_at" | "updated_at">[] = [
  // ── Participants (Buyer / Seller) ─────────────────────────────────────────
  { key: "participant_free",          label: "Free",                    description: "Basic search, limited features",                                           audience: "participant",         module: "user_subscription",        unit: "monthly",    currency: "EUR", amount: 0,    is_active: true, sort_order: 1,  metadata: {} },
  { key: "pro",                       label: "Participant Pro",          description: "AI insights, analytics, priority matching & up to 5 listings",             audience: "participant",         module: "user_subscription",        unit: "monthly",    currency: "EUR", amount: 29,   is_active: true, sort_order: 2,  metadata: {} },
  // ── Agents (Free + Pro only — everything else is an add-on) ───────────────
  { key: "agent_free",                label: "Agent Free",              description: "Up to 5 active listings + basic tools",                                    audience: "agent",        module: "agent_subscription",       unit: "monthly",    currency: "EUR", amount: 0,    is_active: true, sort_order: 1,  metadata: {} },
  { key: "agent_basic",               label: "Agent Pro",               description: "Unlimited listings, full CRM, AI tools, analytics & 10 priority ads",      audience: "agent",        module: "agent_subscription",       unit: "monthly",    currency: "EUR", amount: 149,  is_active: true, sort_order: 2,  metadata: {} },
  // Legacy agency bundles — kept inactive for historical reference; replaced by add-ons below.
  { key: "agency_starter",            label: "Agency Starter (legacy)", description: "Replaced by per-seat & branded-profile add-ons.",                          audience: "agent",        module: "agent_subscription",       unit: "monthly",    currency: "EUR", amount: 249,  is_active: false, sort_order: 3,  metadata: { deprecated: true } },
  { key: "agency_growth",             label: "Agency Growth (legacy)",  description: "Replaced by per-seat, priority and dedicated-manager add-ons.",            audience: "agent",        module: "agent_subscription",       unit: "monthly",    currency: "EUR", amount: 449,  is_active: false, sort_order: 4,  metadata: { deprecated: true } },
  { key: "agency_enterprise",         label: "Agency Enterprise (legacy)", description: "Replaced by white-label & dedicated-manager add-ons.",                  audience: "agent",        module: "agent_subscription",       unit: "monthly",    currency: "EUR", amount: 749,  is_active: false, sort_order: 5,  metadata: { deprecated: true } },
  // ── Developers ────────────────────────────────────────────────────────────
  { key: "developer_pro",             label: "Developer Pro",           description: "Unlimited projects, new build showcase, pre-sale & floor plans",            audience: "developer",    module: "developer_subscription",   unit: "monthly",    currency: "EUR", amount: 129,  is_active: true, sort_order: 1,  metadata: {} },
  // ── Professionals (Free + Pro only — everything else is an add-on) ────────
  { key: "professional_basic",        label: "Professional Pro",        description: "Priority leads, booking calendar, verified badge & AI tools",              audience: "professional", module: "professional_subscription", unit: "monthly",    currency: "EUR", amount: 69,   is_active: true, sort_order: 1,  metadata: {} },
  // Legacy Premium tier — replaced by API access, referral network and seat add-ons.
  { key: "professional_premium",      label: "Professional Premium (legacy)", description: "Replaced by API, referral-network and seat add-ons.",                  audience: "professional", module: "professional_subscription", unit: "monthly",    currency: "EUR", amount: 129,  is_active: false, sort_order: 2,  metadata: { deprecated: true } },
  // ── Investors (invitation-only — pricing set per application) ─────────────
  { key: "investor_private",          label: "Private Investor",        description: "Invitation-only — pricing set per application via one-off payment link.",  audience: "investor",     module: "investor_subscription",    unit: "monthly",    currency: "EUR", amount: 0,    is_active: true, sort_order: 1,  metadata: { by_application: true } },
  { key: "investor_institutional",    label: "Institutional Investor",  description: "Invitation-only — pricing set per application via one-off payment link.",  audience: "investor",     module: "investor_subscription",    unit: "monthly",    currency: "EUR", amount: 0,    is_active: true, sort_order: 2,  metadata: { by_application: true } },
  // ── Valuation / AI reports ────────────────────────────────────────────────
  { key: "valuation_single",          label: "AI Valuation (single)",   description: "Full AI valuation: market comp, yield estimate & confidence score",        audience: "participant",         module: "valuation_reports",        unit: "per_report", currency: "EUR", amount: 39,   is_active: true, sort_order: 1,  metadata: {} },
  { key: "valuation_bundle",          label: "AI Valuation × 5",        description: "5 valuation reports — save 24% vs single",                                 audience: "participant",         module: "valuation_reports",        unit: "bundle",     currency: "EUR", amount: 149,  is_active: true, sort_order: 2,  metadata: {} },
  { key: "property_report_single",    label: "Property Report (single)","description": "Full property-level report: ownership history, liens & legal status",    audience: "participant",         module: "valuation_reports",        unit: "per_report", currency: "EUR", amount: 49,   is_active: true, sort_order: 3,  metadata: {} },
  { key: "neighbourhood_report_single",label:"Neighbourhood Report",    description: "Price trends, safety, POIs, development projects & investment outlook",    audience: "participant",         module: "valuation_reports",        unit: "per_report", currency: "EUR", amount: 19,   is_active: true, sort_order: 4,  metadata: {} },
  { key: "neighbourhood_report_bundle",label:"Neighbourhood Bundle × 3",description: "3 neighbourhood reports — save 31% vs single",                             audience: "participant",         module: "valuation_reports",        unit: "bundle",     currency: "EUR", amount: 39,   is_active: true, sort_order: 5,  metadata: {} },
  // ── Ad-hoc / add-on charges (users / sellers) ─────────────────────────────
  { key: "extra_listing",             label: "Extra listing slot",      description: "One additional listing beyond plan quota",                                  audience: "participant",         module: "adhoc_charges",            unit: "per_listing",currency: "EUR", amount: 12,   is_active: true, sort_order: 1,  metadata: {} },
  { key: "featured_listing",          label: "Featured listing",        description: "Homepage carousel + search spotlight for 30 days (avg 3× more views)",     audience: "participant",         module: "adhoc_charges",            unit: "per_listing",currency: "EUR", amount: 39,   is_active: true, sort_order: 2,  metadata: {} },
  { key: "priority_placement",        label: "Priority placement",      description: "Pinned above all non-priority results in area & type for 30 days",          audience: "participant",         module: "adhoc_charges",            unit: "per_listing",currency: "EUR", amount: 59,   is_active: true, sort_order: 3,  metadata: {} },
  { key: "featured_priority_bundle",  label: "Featured + Priority",     description: "Both boosts combined — maximum exposure, bundled rate, 30 days",           audience: "participant",         module: "adhoc_charges",            unit: "per_listing",currency: "EUR", amount: 79,   is_active: true, sort_order: 4,  metadata: {} },
  // ── Add-ons for agents (replaces the deprecated agency_* tiers) ───────────
  { key: "agent_extra_seat",          label: "Extra agent seat",        description: "Add another agent to your agency under a single Pro plan. Shared listing pool.", audience: "agent",        module: "adhoc_charges",            unit: "monthly",    currency: "EUR", amount: 39,   is_active: true, sort_order: 1,  metadata: {} },
  { key: "agency_branded_profile",    label: "Agency-branded profile",  description: "Custom logo, colours and team page on your agency profile",                 audience: "agent",        module: "adhoc_charges",            unit: "monthly",    currency: "EUR", amount: 49,   is_active: true, sort_order: 2,  metadata: {} },
  { key: "agency_dedicated_manager",  label: "Dedicated account manager", description: "A named account manager for onboarding, training & support",              audience: "agent",        module: "adhoc_charges",            unit: "monthly",    currency: "EUR", amount: 199,  is_active: true, sort_order: 3,  metadata: {} },
  { key: "agency_white_label",        label: "White-label domain",      description: "Serve listings on your own domain (yourname.gr)",                            audience: "agent",        module: "adhoc_charges",            unit: "monthly",    currency: "EUR", amount: 149,  is_active: true, sort_order: 4,  metadata: {} },
  // ── Ad-hoc / add-on charges (professionals) ───────────────────────────────
  { key: "featured_professional",     label: "Featured professional",   description: "Top-of-category placement in Professional directory (monthly)",             audience: "professional", module: "adhoc_charges",            unit: "monthly",    currency: "EUR", amount: 59,   is_active: true, sort_order: 1,  metadata: {} },
  { key: "extra_priority_ad",         label: "Extra priority ad",       description: "Push any listing to top of search for its area (per ad)",                  audience: "professional", module: "adhoc_charges",            unit: "per_ad",     currency: "EUR", amount: 8,    is_active: true, sort_order: 2,  metadata: {} },
  // Replaces the deprecated professional_premium tier
  { key: "professional_api_access",   label: "Professional API access", description: "Programmatic access to bookings, leads and AI tools",                       audience: "professional", module: "adhoc_charges",            unit: "monthly",    currency: "EUR", amount: 59,   is_active: true, sort_order: 3,  metadata: {} },
  { key: "professional_referral_network", label: "Referral network slot", description: "Cross-discipline referral network membership",                          audience: "professional", module: "adhoc_charges",            unit: "monthly",    currency: "EUR", amount: 39,   is_active: true, sort_order: 4,  metadata: {} },
  { key: "professional_extra_seat",   label: "Extra client seat",       description: "Add a colleague or paralegal under a single Pro plan",                      audience: "professional", module: "adhoc_charges",            unit: "monthly",    currency: "EUR", amount: 19,   is_active: true, sort_order: 5,  metadata: {} },
  { key: "professional_branded_email", label: "Branded email templates", description: "Send all client communications from your own branded templates",          audience: "professional", module: "adhoc_charges",            unit: "monthly",    currency: "EUR", amount: 15,   is_active: true, sort_order: 6,  metadata: {} },
  // ── OS Data Products (B2B) ────────────────────────────────────────────────
  { key: "market_intelligence",       label: "Market Intelligence",     description: "Greek property price index, transaction comps, trend reports by region",   audience: "participant",         module: "os_data_products",         unit: "monthly",    currency: "EUR", amount: 199,  is_active: true, sort_order: 1,  metadata: {} },
  { key: "avm_api",                   label: "AVM API",                 description: "Automated valuation endpoint for mortgage lenders, advisors & RICS valuers",audience: "participant",         module: "os_data_products",         unit: "monthly",    currency: "EUR", amount: 299,  is_active: true, sort_order: 2,  metadata: {} },
  { key: "auction_intelligence",      label: "Auction Intelligence",    description: "Full court auction schedule, minimum bids & outcome DB for legal pros",    audience: "participant",         module: "os_data_products",         unit: "monthly",    currency: "EUR", amount: 149,  is_active: true, sort_order: 3,  metadata: {} },
];

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
// skipcq: JS-0067 - Local hook is intentionally module-scoped for the admin pricing surface.
function usePricingConfigs() {
  return useQuery<PricingConfig[]>({
    queryKey: ["admin-pricing-configs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_configs")
        .select("id, created_at, updated_at, key, label, description, audience, module, unit, currency, amount, is_active, sort_order, metadata")
        .order("module", { ascending: true })
        .order("audience", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PricingConfig[];
    },
  });
}

/** Embeddable pricing content — use in AdminDashboard tab. Skips Navbar/Footer and access check when embed=true. */
// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
// skipcq: JS-R1005 - Admin pricing keeps table editing, validation, and Stripe sync controls together for one audited surface.
export function AdminPricingContent({ embed = false }: { embed?: boolean }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const isAdmin = isPlatformAdmin(profile);

  const { data: configs = [], isLoading } = usePricingConfigs();
  const mutation = useMutation({
    mutationFn: async (items: PricingConfig[]) => {
      const payload = items.map(({ id, created_at: _created_at, updated_at: _updated_at, ...rest }) => ({
        id,
        ...rest,
        metadata: (rest.metadata ?? {}) as never,
      }));
      const { error } = await supabase.from("pricing_configs").upsert(payload as never, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pricing-configs"] });
      qc.invalidateQueries({ queryKey: ["pricing-configs-public"] });
      toast.success("Pricing configuration saved.");
    },
    onError: (e: unknown) => {
      toast.error((e instanceof Error ? e.message : null) ?? "Failed to save pricing configuration.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pricing_configs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pricing-configs"] });
      qc.invalidateQueries({ queryKey: ["pricing-configs-public"] });
      toast.success("Pricing row deleted.");
    },
    onError: (e: unknown) => toast.error((e instanceof Error ? e.message : null) ?? "Failed to delete pricing row."),
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const rows: PricingConfig[] = DEFAULT_SEED.map((row) => ({
        ...row,
        id: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
      }));
      const { error } = await supabase.from("pricing_configs").upsert(rows as never, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pricing-configs"] });
      qc.invalidateQueries({ queryKey: ["pricing-configs-public"] });
      toast.success("Default pricing seeded. You can adjust amounts and save.");
    },
    onError: (e: unknown) => toast.error((e instanceof Error ? e.message : null) ?? "Failed to seed default pricing."),
  });

  const grouped = configs.reduce<Record<string, PricingConfig[]>>((acc, row) => {
    const key = `${row.module}::${row.audience}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  // Section key for display order: predefined sections always shown (even empty), then any other groups
  const sectionKey = (module: string, audience: string) => `${module}::${audience}`;
  const sectionOrder = PRICING_SECTIONS.map(s => sectionKey(s.module, s.audience));
  const otherKeys = Object.keys(grouped).filter(k => !sectionOrder.includes(k));
  const orderedGroupKeys = [...sectionOrder, ...otherKeys];

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModule, setAddModule] = useState<string>(PRICING_SECTIONS[0].module);
  const [addAudience, setAddAudience] = useState<string>(PRICING_SECTIONS[0].audience);
  const [stripeCreatingId, setStripeCreatingId] = useState<string | null>(null);
  const [stripeSyncing, setStripeSyncing] = useState(false);
  const [stripeSyncResult, setStripeSyncResult] = useState<{ summary: Record<string, number>; errors: string[] } | null>(null);
  const addModalRef = useFocusTrap<HTMLDivElement>({
    active: showAddModal,
    onEscape: () => setShowAddModal(false),
  });

  if (!embed && !isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-20 container max-w-xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border text-xs font-semibold mb-4">
            <Shield className="w-4 h-4" />
            Admin pricing console
          </div>
          <h1 className="font-display text-2xl font-bold mb-2">Access restricted</h1>
          <p className="text-sm text-muted-foreground">
            This page is only available to platform admins. Contact the current admin to request access.
          </p>
        </div>
        <Footer />
      </div>
    );
  }

  const addRow = (module: string, audience: string) => {
    const current = qc.getQueryData<PricingConfig[]>(["admin-pricing-configs"]) || configs;
    const sectionRows = current.filter(r => r.module === module && r.audience === audience);
    const maxSort = sectionRows.length ? Math.max(...sectionRows.map(r => r.sort_order)) : 0;
    const tmp: PricingConfig = {
      id: crypto.randomUUID(),
      key: `custom_${Date.now()}`,
      label: "New pricing item",
      description: "",
      audience,
      module,
      unit: "monthly",
      currency: "EUR",
      amount: 0,
      is_active: true,
      sort_order: maxSort + 1,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    qc.setQueryData<PricingConfig[]>(["admin-pricing-configs"], (prev = []) => [...prev, tmp]);
  };

  const handleAddRow = () => {
    setAddModule(PRICING_SECTIONS[0].module);
    setAddAudience(PRICING_SECTIONS[0].audience);
    setShowAddModal(true);
  };

  const handleAddToSection = (module: string, audience: string) => {
    addRow(module, audience);
    toast.success("Row added. Edit and save.");
  };

  const handleConfirmAddModal = () => {
    addRow(addModule, addAudience);
    setShowAddModal(false);
    toast.success("Row added. Edit and save.");
  };

  const handleSave = () => {
    const current = qc.getQueryData<PricingConfig[]>(["admin-pricing-configs"]) || configs;
    mutation.mutate(current);
  };

  const handleSyncStripe = async () => { // skipcq: JS-R1005 - Admin-only Stripe sync keeps remote result handling and toast feedback together.
    setStripeSyncing(true);
    setStripeSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("sync-stripe-pricing", { body: {} });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "Sync failed");
      const results: Array<{ action: string; error?: string; key: string }> = data.results ?? [];
      const errors = results.filter(r => r.action === "error").map(r => `${r.key}: ${r.error}`);
      setStripeSyncResult({ summary: data.summary ?? {}, errors });
      qc.invalidateQueries({ queryKey: ["admin-pricing-configs"] });
      if (errors.length === 0) toast.success(`Stripe sync complete — ${data.summary?.created ?? 0} created, ${data.summary?.price_updated ?? 0} updated`);
      else toast.error(`Sync finished with ${errors.length} error(s)`);
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : null) ?? "Stripe sync failed");
    } finally {
      setStripeSyncing(false);
    }
  };

  const handleFieldChange = (id: string, field: keyof PricingConfig, value: string | number | boolean | null) => {
    qc.setQueryData<PricingConfig[]>(["admin-pricing-configs"], (prev = []) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  const handleMetadataChange = (id: string, key: string, value: string) => {
    qc.setQueryData<PricingConfig[]>(["admin-pricing-configs"], (prev = []) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const meta = { ...(row.metadata || {}), [key]: value || undefined };
        return { ...row, metadata: meta };
      }),
    );
  };

  const handleCreateStripePrice = async (row: PricingConfig) => { // skipcq: JS-R1005 - Admin-only price creation coordinates validation, edge call, cache refresh, and feedback.
    if (row.amount <= 0) {
      toast.error("Set amount > 0 before creating Stripe price");
      return;
    }
    setStripeCreatingId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("create-stripe-price", {
        body: { config_id: row.id },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "Failed");
      const priceId = data?.price_id;
      if (priceId) {
        handleMetadataChange(row.id, "stripe_price_id", priceId);
        toast.success(`Stripe price created: ${priceId}`);
        qc.invalidateQueries({ queryKey: ["admin-pricing-configs"] });
        qc.invalidateQueries({ queryKey: ["pricing-configs-public"] });
      }
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : null) ?? "Failed to create Stripe price");
    } finally {
      setStripeCreatingId(null);
    }
  };

  const content = (
        <>
        <div className="space-y-8">
          <header className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display text-2xl font-bold flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-primary" />
                Pricing Administration
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Configure pricing for investors, professionals, modules and usage-based components. Changes affect only
                presentation – billing remains managed via Stripe/mAI Prop OS.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                {seedMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Seed defaults
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleAddRow}>
                <Plus className="w-3.5 h-3.5" />
                Add item
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10" onClick={handleSyncStripe} disabled={stripeSyncing || configs.length === 0}>
                {stripeSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Sync to Stripe
              </Button>
              <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save all
              </Button>
            </div>
          </header>

          {/* Stripe sync result banner */}
          {stripeSyncResult && (
            <div className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-3 ${stripeSyncResult.errors.length ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-brand-emerald/40 bg-brand-emerald/5 text-brand-emerald"}`}>
              {stripeSyncResult.errors.length ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
              <div className="flex-1">
                <p className="font-medium">
                  {stripeSyncResult.errors.length === 0
                    ? `Stripe sync complete — ${stripeSyncResult.summary.created ?? 0} created, ${stripeSyncResult.summary.price_updated ?? 0} price updates, ${stripeSyncResult.summary.product_updated ?? 0} product updates, ${stripeSyncResult.summary.no_change ?? 0} unchanged`
                    : `Stripe sync finished with errors`}
                </p>
                {stripeSyncResult.errors.map((e, i) => <p key={i} className="text-xs mt-1 opacity-80">{e}</p>)}
              </div>
              <button className="shrink-0 opacity-60 hover:opacity-100" onClick={() => setStripeSyncResult(null)}>×</button>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading pricing configuration…</span>
            </div>
          ) : configs.length === 0 ? (
            <div className="glass-card rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground space-y-4">
              <p>No pricing rows yet. Seed default pricing for all categories or add items manually.</p>
              <div className="flex justify-center gap-2">
                <Button size="sm" className="gap-1.5" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                  {seedMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Seed default pricing
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleAddRow}>
                  <Plus className="w-3.5 h-3.5" />
                  Add item
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {orderedGroupKeys.map((groupKey) => {
                const rows = grouped[groupKey] || [];
                const [module, audience] = groupKey.split("::");
                const sectionLabel = PRICING_SECTIONS.find(s => s.module === module && s.audience === audience)?.label ?? `${module} · ${audience}`;
                return (
                  <section key={groupKey} className="glass-card rounded-2xl border border-border p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          {sectionLabel}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Module: <span className="font-mono">{module}</span> · Audience:{" "}
                          <span className="font-mono">{audience}</span>
                        </p>
                      </div>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => handleAddToSection(module, audience)}>
                        <Plus className="w-3 h-3" />
                        Add to this section
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      {rows.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-4 text-center">No items in this section. Use &ldquo;Add to this section&rdquo; above.</p>
                      ) : (
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-border text-[11px] text-muted-foreground uppercase tracking-wider">
                            <th className="text-left py-2 pr-3">Label</th>
                            <th className="text-left py-2 pr-3">Key</th>
                            <th className="text-left py-2 pr-3">Amount</th>
                            <th className="text-left py-2 pr-3">Unit</th>
                            <th className="text-left py-2 pr-3">Currency</th>
                            <th className="text-left py-2 pr-3">Active</th>
                            <th className="text-left py-2 pr-3">Sort</th>
                            <th className="text-left py-2 pr-3">Description</th>
                            <th className="text-left py-2 pr-3">Stripe Price ID</th>
                            <th className="text-left py-2 pr-2">Stripe</th>
                            <th className="py-2 pl-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => ( // skipcq: JS-R1005 - Pricing row rendering maps a dense editable schema to one table row.
                            <tr key={row.id} className="border-b border-border/70 last:border-0">
                              <td className="py-2 pr-3">
                                <input
                                  className="w-full bg-transparent border border-border rounded px-2 py-1 text-xs"
                                  value={row.label}
                                  onChange={(e) => handleFieldChange(row.id, "label", e.target.value)}
                                />
                              </td>
                              <td className="py-2 pr-3">
                                <input
                                  className="w-full bg-transparent border border-border rounded px-2 py-1 text-xs font-mono"
                                  value={row.key}
                                  onChange={(e) => handleFieldChange(row.id, "key", e.target.value)}
                                />
                              </td>
                              <td className="py-2 pr-3">
                                <div className="flex items-center gap-1">
                                  <Euro className="w-3 h-3 text-muted-foreground" />
                                  <input
                                    type="number"
                                    className="w-20 bg-transparent border border-border rounded px-2 py-1 text-xs"
                                    value={row.amount}
                                    onChange={(e) =>
                                      handleFieldChange(row.id, "amount", Number(e.target.value || 0))
                                    }
                                  />
                                </div>
                              </td>
                              <td className="py-2 pr-3">
                                <input
                                  className="w-24 bg-transparent border border-border rounded px-2 py-1 text-xs"
                                  value={row.unit}
                                  onChange={(e) => handleFieldChange(row.id, "unit", e.target.value)}
                                />
                              </td>
                              <td className="py-2 pr-3">
                                <input
                                  className="w-16 bg-transparent border border-border rounded px-2 py-1 text-xs"
                                  value={row.currency}
                                  onChange={(e) => handleFieldChange(row.id, "currency", e.target.value)}
                                />
                              </td>
                              <td className="py-2 pr-3">
                                <input
                                  type="checkbox"
                                  checked={row.is_active}
                                  onChange={(e) => handleFieldChange(row.id, "is_active", e.target.checked)}
                                />
                              </td>
                              <td className="py-2 pr-3">
                                <input
                                  type="number"
                                  className="w-14 bg-transparent border border-border rounded px-2 py-1 text-xs"
                                  value={row.sort_order}
                                  onChange={(e) =>
                                    handleFieldChange(row.id, "sort_order", Number(e.target.value || 0))
                                  }
                                />
                              </td>
                              <td className="py-2 pr-3">
                                <input
                                  className="w-full bg-transparent border border-border rounded px-2 py-1 text-xs"
                                  value={row.description ?? ""}
                                  onChange={(e) => handleFieldChange(row.id, "description", e.target.value)}
                                />
                              </td>
                              <td className="py-2 pr-3">
                                <input
                                  className="w-28 bg-transparent border border-border rounded px-2 py-1 text-xs font-mono"
                                  placeholder="price_xxx"
                                  value={(row.metadata as Record<string, string> | undefined)?.stripe_price_id ?? ""}
                                  onChange={(e) => handleMetadataChange(row.id, "stripe_price_id", e.target.value)}
                                />
                              </td>
                              <td className="py-2 pr-2">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  aria-label="Create Stripe price"
                                  title="Create Stripe price from this config (amount must be > 0)"
                                  onClick={() => handleCreateStripePrice(row)}
                                  disabled={row.amount <= 0 || stripeCreatingId === row.id}
                                >
                                  {stripeCreatingId === row.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <CreditCard className="w-3 h-3 text-muted-foreground" />
                                  )}
                                </Button>
                              </td>
                              <td className="py-2 pl-2 text-right">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  aria-label="Delete pricing row"
                                  className="h-7 w-7"
                                  onClick={() => setDeleteTarget(row.id)}
                                >
                                  {deleteMutation.isPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3 h-3 text-destructive" />
                                  )}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {/* Add item modal: choose module + audience */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setShowAddModal(false)}>
          <div
            ref={addModalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Add pricing item"
            tabIndex={-1}
            className="glass-card rounded-2xl border border-border w-full max-w-md p-6 shadow-elevated space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-lg">Add pricing item</h3>
              <button className="p-1 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => setShowAddModal(false)}>
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">Module</label>
              <select
                value={addModule}
                onChange={e => setAddModule(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              >
                {MODULES.map(m => (
                  <option key={m} value={m} className="bg-card">{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">Audience</label>
              <select
                value={addAudience}
                onChange={e => setAddAudience(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              >
                {AUDIENCES.map(a => (
                  <option key={a} value={a} className="bg-card">{a}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button size="sm" className="flex-1 gap-1.5" onClick={handleConfirmAddModal}>
                <Plus className="w-3.5 h-3.5" />
                Add item
              </Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete pricing row"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
        </>
  );

  if (embed) {
    return <div className="space-y-8">{content}</div>;
  }
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        <div className="container max-w-6xl py-10">
          {content}
        </div>
      </div>
      <Footer />
    </div>
  );
}
