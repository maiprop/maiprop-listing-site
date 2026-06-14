import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { contactSubmissionInputSchema, parseMutationInput } from "@/lib/mutationSchemas";
import type { TablesInsert } from "@/integrations/supabase/types";

export type ContactSubmissionInput = Pick<
  TablesInsert<"contact_submissions">,
  "type" | "name" | "email" | "company" | "message"
>;

/**
 * Public contact-form submission. Backed by the `contact_submissions` table
 * (RLS allows anonymous insert with `type` ∈ {'contact', 'enterprise', ...}).
 * Used by `/contact` and any enterprise/inquiry form on the marketing site.
 */
export function useSubmitContactForm() {
  return useMutation({
    mutationFn: async (input: ContactSubmissionInput) => {
      const payload = parseMutationInput(
        contactSubmissionInputSchema,
        input,
        "contact submission",
      );
      const { error } = await supabase.from("contact_submissions").insert(payload);
      if (error) throw error;
    },
  });
}
