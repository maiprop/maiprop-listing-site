import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { listingReportSchema, parseMutationInput } from "@/lib/mutationSchemas";

type ListingReportVariables = {
  entityType: "listing" | "firesale_request";
  entityId: string | null;
};

type ListingReportOperation = Omit<ListingReportVariables, "entityId"> & {
  entityId: string;
  reporterId: string;
};

type ListingReportMessages = {
  signIn: string;
  error: string;
  success: string;
  unavailable?: string;
};

type UseListingReportOptions = {
  messages: ListingReportMessages;
  onSignInRequired: () => void;
};

/** Owns the single authenticated listing moderation insert used by listing surfaces. */
export function useListingReport({ messages, onSignInRequired }: UseListingReportOptions) {
  const { user } = useAuth();
  const mutation = useMutation<void, unknown, ListingReportOperation>({
    mutationFn: async ({ entityType, entityId, reporterId }) => {
      const payload = parseMutationInput(listingReportSchema, {
        entity_type: entityType,
        entity_id: entityId,
        reporter_id: reporterId,
      }, "listing report");
      const { error } = await supabase.from("listing_reports").insert(payload);
      if (error) throw error;
    },
    onError: () => toast.error(messages.error),
    onSuccess: () => toast.success(messages.success),
  });

  const submit = (variables: ListingReportVariables): void => {
    const reporterId = user?.id;
    if (!reporterId) {
      toast.error(messages.signIn);
      onSignInRequired();
      return;
    }
    const entityId = variables.entityId;
    if (!entityId) {
      toast.error(messages.unavailable ?? messages.error);
      return;
    }
    mutation.mutate({ entityType: variables.entityType, entityId, reporterId });
  };

  return { ...mutation, submit };
}
