/**
 * delete-account
 * ─────────────────────────────────────────────────────────────────────────────
 * Permanently deletes the authenticated user's account from Supabase Auth.
 * Requires a valid Bearer token (verify_jwt = true in config.toml).
 *
 * On-delete cascades in the DB handle:
 *   profiles, favorites, contacts, listings (soft-deleted), viewings, leads, etc.
 *
 * GDPR Article 17 (right to erasure) — fulfils the ToS and Privacy Policy promise.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { verifyBearerToken, AuthError } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const user = await verifyBearerToken(req, supabase);

    // Use service role to delete from auth.users — cascades to all user data
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw error;

    console.log(`[DELETE-ACCOUNT] User deleted: ${user.id}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const status = err instanceof AuthError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[DELETE-ACCOUNT] Error:`, message);
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
