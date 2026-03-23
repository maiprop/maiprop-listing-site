/**
 * Admin-only: Sync all pricing_configs to Stripe.
 * - For each active config with amount > 0:
 *   - If no stripe_product_id: create product + price, save IDs
 *   - If product exists but label changed: update product name/description
 *   - If price exists but amount changed (prices are immutable): archive old price, create new price, save new price_id
 * - Returns a summary of actions taken per config.
 */
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SyncResult = {
  id: string;
  key: string;
  action: "created" | "price_updated" | "product_updated" | "no_change" | "skipped" | "error";
  price_id?: string;
  product_id?: string;
  error?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!stripeKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Service not configured" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthenticated");

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("user_id", userData.user.id)
      .single();
    if (!(profile as any)?.is_platform_admin) throw new Error("Platform admin only");

    // Optional: sync only specific config IDs, or all active configs
    const body = req.method === "POST" && req.body ? await req.json().catch(() => ({})) : {};
    const configIds: string[] | null = body.config_ids ?? null;

    let query = supabase.from("pricing_configs").select("*").eq("is_active", true).gt("amount", 0);
    if (configIds?.length) query = query.in("id", configIds);
    const { data: configs, error: configsError } = await query;
    if (configsError) throw new Error("Failed to fetch configs: " + configsError.message);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const results: SyncResult[] = [];

    for (const config of (configs ?? [])) {
      const meta = (config.metadata ?? {}) as Record<string, string>;
      const existingProductId = meta.stripe_product_id;
      const existingPriceId = meta.stripe_price_id;
      const existingAmount = Number(meta.stripe_last_amount ?? -1);
      const existingLabel = meta.stripe_last_label ?? "";

      const amount = Math.round(Number(config.amount) * 100); // cents
      const currency = (config.currency ?? "EUR").toLowerCase();
      const unit = config.unit ?? "monthly";
      const isRecurring = ["monthly", "yearly"].includes(unit);
      const interval = unit === "yearly" ? "year" : "month";
      const productName = config.label || config.key;
      const productDesc = config.description ?? undefined;

      const result: SyncResult = { id: config.id, key: config.key, action: "no_change" };

      try {
        let productId = existingProductId;
        let priceId = existingPriceId;
        let newMeta = { ...meta };

        // ── Create product if missing ────────────────────────────────────────
        if (!productId) {
          const product = await stripe.products.create({
            name: productName,
            ...(productDesc && { description: productDesc }),
            metadata: { pricing_config_key: config.key, pricing_config_id: config.id },
          });
          productId = product.id;
          newMeta.stripe_product_id = productId;
          result.action = "created";
        } else if (productName !== existingLabel) {
          // ── Update product name if label changed ─────────────────────────
          await stripe.products.update(productId, {
            name: productName,
            ...(productDesc && { description: productDesc }),
          });
          result.action = "product_updated";
        }

        // ── Create price if missing ──────────────────────────────────────────
        if (!priceId) {
          const priceParams: Stripe.PriceCreateParams = {
            product: productId!,
            currency,
            unit_amount: amount,
            metadata: { pricing_config_key: config.key, pricing_config_id: config.id },
          };
          if (isRecurring) (priceParams as any).recurring = { interval };
          const price = await stripe.prices.create(priceParams);
          priceId = price.id;
          newMeta.stripe_price_id = priceId;
          newMeta.stripe_last_amount = String(config.amount);
          newMeta.stripe_last_label = productName;
          result.action = "created";
        } else if (amount !== existingAmount) {
          // ── Amount changed: archive old price, create new ────────────────
          await stripe.prices.update(priceId, { active: false });

          const priceParams: Stripe.PriceCreateParams = {
            product: productId!,
            currency,
            unit_amount: amount,
            metadata: { pricing_config_key: config.key, pricing_config_id: config.id },
          };
          if (isRecurring) (priceParams as any).recurring = { interval };
          const newPrice = await stripe.prices.create(priceParams);
          priceId = newPrice.id;
          newMeta.stripe_price_id = priceId;
          newMeta.stripe_last_amount = String(config.amount);
          newMeta.stripe_last_label = productName;
          result.action = "price_updated";
        } else if (productName !== existingLabel) {
          newMeta.stripe_last_label = productName;
          result.action = "product_updated";
        }

        // ── Save updated metadata back to DB ────────────────────────────────
        if (result.action !== "no_change") {
          await supabase
            .from("pricing_configs")
            .update({ metadata: newMeta, updated_at: new Date().toISOString() })
            .eq("id", config.id);
        }

        result.price_id = priceId;
        result.product_id = productId;
      } catch (err: any) {
        result.action = "error";
        result.error = err.message;
      }

      results.push(result);
    }

    const summary = {
      total: results.length,
      created: results.filter(r => r.action === "created").length,
      price_updated: results.filter(r => r.action === "price_updated").length,
      product_updated: results.filter(r => r.action === "product_updated").length,
      no_change: results.filter(r => r.action === "no_change").length,
      errors: results.filter(r => r.action === "error").length,
    };

    return new Response(JSON.stringify({ summary, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
