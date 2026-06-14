import { supabase } from "@/integrations/supabase/client";
import {
  enterpriseSsoSignInSchema,
  parseMutationInput,
  type EnterpriseSsoSignIn,
  type EnterpriseSsoSignInInput,
} from "@/lib/mutationSchemas";

export const parseEnterpriseSsoSignIn = (input: EnterpriseSsoSignInInput): EnterpriseSsoSignIn =>
  parseMutationInput(enterpriseSsoSignInSchema, input, "enterprise SSO");

export async function signInWithEnterpriseSso(input: EnterpriseSsoSignInInput) {
  const parsed = parseEnterpriseSsoSignIn(input);
  const options = parsed.redirectTo ? { redirectTo: parsed.redirectTo } : undefined;

  if (parsed.domain) {
    const { data, error } = await supabase.auth.signInWithSSO({
      domain: parsed.domain,
      ...(options ? { options } : {}),
    });
    if (error) throw error;
    return data;
  }

  if (parsed.providerId) {
    const { data, error } = await supabase.auth.signInWithSSO({
      providerId: parsed.providerId,
      ...(options ? { options } : {}),
    });
    if (error) throw error;
    return data;
  }

  throw new Error("Invalid enterprise SSO");
}
