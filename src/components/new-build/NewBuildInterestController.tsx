import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { newBuildLeadSchema, parseMutationInput } from "@/lib/mutationSchemas";
import { RegisterInterestCard } from "@/components/new-build/RegisterInterestCard";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { tFallback } from "@/lib/i18nFallback";

type InterestForm = { name: string; phone: string; message: string };
type SubmissionStatus = "editing" | "sending" | "uncertain" | "confirmed";
type SubmissionOutcome = "confirmed" | "uncertain" | "rejected";

type FrozenAttempt = {
  key: string;
  actorId: string;
  listingId: string;
  rpcArgs: {
    p_submission_key: string;
    p_user_id: string;
    p_new_building_id: string;
    p_email: string;
    p_full_name: string;
    p_phone: string;
    p_notes: string;
  };
  conversationId: string | null;
  uncertain: boolean;
};

const DEFINITE_REJECTION_CODES = new Set(["22023", "23503", "23514", "42501", "PT409"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cleanOptionalText = (value: string | null | undefined) => value?.trim() || undefined;

const isValidReceipt = (
  value: unknown,
  listingId: string,
): value is { id: string; new_building_id: string; created_at: string } => {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && UUID_PATTERN.test(row.id) &&
    row.new_building_id === listingId &&
    typeof row.created_at === "string" && Number.isFinite(Date.parse(row.created_at));
};

export function NewBuildInterestController({
  listing,
  user,
  profile,
  ownerId,
  onLogin,
  startConversation,
  successMessage,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listing: Record<string, any>;
  user: User | null;
  profile: Profile | null;
  ownerId: string;
  onLogin: () => void;
  startConversation: (input: { other_user_id: string; listing_id: string }) => Promise<string>;
  successMessage: string;
}) {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => tFallback(t, key, fallback);
  const [status, setStatus] = useState<SubmissionStatus>("editing");
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef<FrozenAttempt | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const successToastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptRef.current = null;
      inFlightRef.current = false;
      if (successToastIdRef.current != null) {
        toast.dismiss(successToastIdRef.current);
        successToastIdRef.current = null;
      }
    };
  }, []);

  const executeAttempt = async (attempt: FrozenAttempt): Promise<SubmissionOutcome> => {
    if (inFlightRef.current) return attempt.uncertain ? "uncertain" : "rejected";
    inFlightRef.current = true;
    setStatus("sending");
    setError(null);
    try {
      if (!attempt.conversationId) {
        try {
          attempt.conversationId = await startConversation({
            other_user_id: ownerId,
            listing_id: attempt.listingId,
          });
        } catch (conversationError) {
          if (mountedRef.current && attemptRef.current === attempt) {
            attemptRef.current = null;
            setStatus("editing");
            setError(conversationError instanceof Error
              ? conversationError.message
              : tr("newBuildDetail.interestCard.conversationError", "Could not start conversation."));
          }
          return "rejected";
        }
      }

      if (!mountedRef.current || attemptRef.current !== attempt) return "rejected";
      const { data, error: rpcError } = await supabase.rpc("submit_new_build_enquiry", attempt.rpcArgs);
      if (!mountedRef.current || attemptRef.current !== attempt) return "rejected";

      if (rpcError) {
        const code = typeof rpcError.code === "string" ? rpcError.code : "";
        const message = rpcError.message || tr(
          "newBuildDetail.interestCard.submissionError",
          "We couldn't register your interest. Please try again.",
        );
        if (!attempt.uncertain && DEFINITE_REJECTION_CODES.has(code)) {
          attemptRef.current = null;
          setStatus("editing");
          setError(message);
          return "rejected";
        }
        attempt.uncertain = true;
        setStatus("uncertain");
        setError(message);
        return "uncertain";
      }

      const rows = Array.isArray(data) ? data : [];
      if (rows.length !== 1 || !isValidReceipt(rows[0], attempt.listingId)) {
        attempt.uncertain = true;
        setStatus("uncertain");
        setError(tr(
          "newBuildDetail.interestCard.invalidReceipt",
          "The server returned an invalid enquiry receipt.",
        ));
        return "uncertain";
      }

      attemptRef.current = null;
      setStatus("confirmed");
      setError(null);
      if (successToastIdRef.current != null) {
        toast.dismiss(successToastIdRef.current);
      }
      successToastIdRef.current = toast.success(successMessage);
      return "confirmed";
    } catch (rpcFailure) {
      if (!mountedRef.current || attemptRef.current !== attempt) return "rejected";
      attempt.uncertain = true;
      setStatus("uncertain");
      setError(rpcFailure instanceof Error
        ? rpcFailure.message
        : tr("newBuildDetail.interestCard.responseUnavailable", "The enquiry response is unavailable."));
      return "uncertain";
    } finally {
      inFlightRef.current = false;
    }
  };

  const submit = async (form: InterestForm): Promise<SubmissionOutcome> => {
    if (inFlightRef.current || attemptRef.current) {
      return attemptRef.current?.uncertain ? "uncertain" : "rejected";
    }
    if (!user || !ownerId || !listing.id) {
      setError(tr(
        "newBuildDetail.interestCard.recipientUnavailable",
        "This listing cannot accept enquiries.",
      ));
      return "rejected";
    }
    const contactName = cleanOptionalText(form.name)
      ?? cleanOptionalText(profile?.display_name)
      ?? cleanOptionalText(profile?.first_name)
      ?? "Interested buyer";
    const canonical = parseMutationInput(newBuildLeadSchema, {
      new_building_id: listing.id,
      user_id: user.id,
      email: user.email ?? "",
      full_name: contactName,
      phone: cleanOptionalText(form.phone) ?? cleanOptionalText(profile?.phone) ?? null,
      investment_budget: 0,
      notes: cleanOptionalText(form.message) ?? "",
      utm_source: "newbuild_detail_register",
    }, "new build lead");
    const attempt: FrozenAttempt = {
      key: crypto.randomUUID(),
      actorId: user.id,
      listingId: listing.id,
      conversationId: null,
      uncertain: false,
      rpcArgs: {
        p_submission_key: "",
        p_user_id: user.id,
        p_new_building_id: listing.id,
        p_email: canonical.email.trim().toLowerCase(),
        p_full_name: canonical.full_name.trim(),
        p_phone: canonical.phone?.trim() ?? "",
        p_notes: canonical.notes.trim(),
      },
    };
    attempt.rpcArgs.p_submission_key = attempt.key;
    attemptRef.current = attempt;
    return executeAttempt(attempt);
  };

  const retry = async () => {
    const attempt = attemptRef.current;
    if (!attempt || !attempt.uncertain) return;
    await executeAttempt(attempt);
  };

  const startNew = () => {
    if (inFlightRef.current) return;
    attemptRef.current = null;
    setStatus("editing");
    setError(null);
  };

  return (
    <RegisterInterestCard
      listing={listing}
      user={user}
      onLogin={onLogin}
      onContact={submit}
      submissionStatus={status}
      submissionError={error}
      onRetry={retry}
      onStartNew={startNew}
    />
  );
}
