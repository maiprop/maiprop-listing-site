import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SlidersHorizontal, Save, Plus, Loader2, Shield, Euro, Trash2, Sparkles, X as XIcon } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type PricingConfig = Tables<"pricing_configs">;

const OWNER_EMAILS = ["kr@maiprop.co", "kr@maiprop.com"].map(e => e.toLowerCase());

/** Predefined sections so admin can manage all pricings: users, professionals, agents, valuation, firesale, ad-hoc */
const PRICING_SECTIONS = [
  { key: "users", label: "Users (consumers)", module: "user_subscription", audience: "user" },
  { key: "professionals", label: "Professionals", module: "professional_subscription", audience: "professional" },
  { key: "agents", label: "Agents", module: "agent_subscription", audience: "agent" },
  { key: "valuation", label: "Valuation reports", module: "valuation_reports", audience: "user" },
  { key: "firesale", label: "Firesale / Investors", module: "firesale_dashboard", audience: "investor" },
  { key: "adhoc_user", label: "Ad-hoc (listings / users)", module: "adhoc_charges", audience: "user" },
  { key: "adhoc_pro", label: "Ad-hoc (professionals)", module: "adhoc_charges", audience: "professional" },
] as const;

const MODULES = [
  "user_subscription",
  "professional_subscription",
  "agent_subscription",
  "valuation_reports",
  "firesale_dashboard",
  "adhoc_charges",
  "pro_tools",
  "listings",
] as const;

const AUDIENCES = ["user", "professional", "agent", "investor"] as const;

/** Default rows to seed when admin clicks "Seed default pricing" */
const DEFAULT_SEED: Omit<PricingConfig, "id" | "created_at" | "updated_at">[] = [
  { key: "free", label: "Free", description: "Basic search & limited features", audience: "user", module: "user_subscription", unit: "monthly", currency: "EUR", amount: 0, is_active: true, sort_order: 1, metadata: {} },
  { key: "pro", label: "Pro", description: "Unlimited listings, AI tools", audience: "user", module: "user_subscription", unit: "monthly", currency: "EUR", amount: 19, is_active: true, sort_order: 2, metadata: {} },
  { key: "professional_basic", label: "Basic", description: "For individual pros", audience: "professional", module: "professional_subscription", unit: "monthly", currency: "EUR", amount: 49, is_active: true, sort_order: 1, metadata: {} },
  { key: "professional_premium", label: "Premium", description: "Full pro tools & API", audience: "professional", module: "professional_subscription", unit: "monthly", currency: "EUR", amount: 149, is_active: true, sort_order: 2, metadata: {} },
  { key: "agent_basic", label: "Agent Basic", description: "Listings & CRM", audience: "agent", module: "agent_subscription", unit: "monthly", currency: "EUR", amount: 79, is_active: true, sort_order: 1, metadata: {} },
  { key: "agent_plus", label: "Agent Plus", description: "Unlimited listings & valuation", audience: "agent", module: "agent_subscription", unit: "monthly", currency: "EUR", amount: 199, is_active: true, sort_order: 2, metadata: {} },
  { key: "valuation_single", label: "Single report", description: "One-off valuation report", audience: "user", module: "valuation_reports", unit: "per_report", currency: "EUR", amount: 29, is_active: true, sort_order: 1, metadata: {} },
  { key: "valuation_bundle", label: "Bundle (5 reports)", description: "5 reports pack", audience: "user", module: "valuation_reports", unit: "bundle", currency: "EUR", amount: 99, is_active: true, sort_order: 2, metadata: {} },
  { key: "investor_analyst", label: "Analyst", description: "Deal flow visibility", audience: "investor", module: "firesale_dashboard", unit: "monthly", currency: "EUR", amount: 490, is_active: true, sort_order: 1, metadata: {} },
  { key: "investor_institutional", label: "Institutional", description: "Full access for funds", audience: "investor", module: "firesale_dashboard", unit: "monthly", currency: "EUR", amount: 1490, is_active: true, sort_order: 2, metadata: {} },
  { key: "investor_sovereign", label: "Sovereign", description: "Custom / white-glove", audience: "investor", module: "firesale_dashboard", unit: "custom", currency: "EUR", amount: 0, is_active: true, sort_order: 3, metadata: {} },
  // Ad-hoc charges (extra listings, featured, premium, etc.)
  { key: "extra_listing", label: "Extra ad listing", description: "Additional listing beyond plan limit", audience: "user", module: "adhoc_charges", unit: "per_listing", currency: "EUR", amount: 9, is_active: true, sort_order: 1, metadata: {} },
  { key: "featured_listing", label: "Featured listing", description: "Highlight listing in search / homepage", audience: "user", module: "adhoc_charges", unit: "per_listing", currency: "EUR", amount: 19, is_active: true, sort_order: 2, metadata: {} },
  { key: "premium_ad", label: "Premium ad", description: "Premium placement for a listing", audience: "user", module: "adhoc_charges", unit: "per_listing", currency: "EUR", amount: 29, is_active: true, sort_order: 3, metadata: {} },
  { key: "featured_professional", label: "Featured professional", description: "Featured profile / badge for professionals", audience: "professional", module: "adhoc_charges", unit: "monthly", currency: "EUR", amount: 49, is_active: true, sort_order: 1, metadata: {} },
];

function usePricingConfigs() {
  return useQuery<PricingConfig[]>({
    queryKey: ["admin-pricing-configs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_configs")
        .select("*")
        .order("module", { ascending: true })
        .order("audience", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function AdminPricing() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const email = (user?.email || "").toLowerCase();
  const isOwner = !!user && OWNER_EMAILS.includes(email);

  const { data: configs = [], isLoading } = usePricingConfigs();
  const mutation = useMutation({
    mutationFn: async (items: PricingConfig[]) => {
      const payload = items.map(({ id, created_at, updated_at, ...rest }) => ({
        id,
        ...rest,
      }));
      const { error } = await supabase.from("pricing_configs").upsert(payload, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pricing-configs"] });
      toast.success("Pricing configuration saved.");
    },
    onError: (e: any) => {
      toast.error(e.message || "Failed to save pricing configuration.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pricing_configs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pricing-configs"] });
      toast.success("Pricing row deleted.");
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete pricing row."),
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
      const { error } = await supabase.from("pricing_configs").upsert(rows, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pricing-configs"] });
      toast.success("Default pricing seeded. You can adjust amounts and save.");
    },
    onError: (e: any) => toast.error(e.message || "Failed to seed default pricing."),
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

  const [showAddModal, setShowAddModal] = useState(false);
  const [addModule, setAddModule] = useState<string>(PRICING_SECTIONS[0].module);
  const [addAudience, setAddAudience] = useState<string>(PRICING_SECTIONS[0].audience);

  if (!isOwner) {
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
            This page is only available to mAI Prop owners. If you believe you should have access, please contact the
            team.
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

  const handleFieldChange = (id: string, field: keyof PricingConfig, value: any) => {
    qc.setQueryData<PricingConfig[]>(["admin-pricing-configs"], (prev = []) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        <div className="container max-w-6xl py-10 space-y-8">
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
                Seed default pricing
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleAddRow}>
                <Plus className="w-3.5 h-3.5" />
                Add item
              </Button>
              <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save all
              </Button>
            </div>
          </header>

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
                            <th className="py-2 pl-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
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
                              <td className="py-2 pl-2 text-right">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7"
                                  onClick={() => deleteMutation.mutate(row.id)}
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
      </div>

      {/* Add item modal: choose module + audience */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setShowAddModal(false)}>
          <div className="glass-card rounded-2xl border border-border w-full max-w-md p-6 shadow-elevated space-y-4" onClick={e => e.stopPropagation()}>
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

      <Footer />
    </div>
  );
}

