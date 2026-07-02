import type { NavigateFunction } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isAiUsageLimitError } from "@/lib/aiErrorUtils";
import {
  firesaleRequestCreateBodySchema,
  firesaleRequestRollbackBodySchema,
  parseMutationInput,
} from "@/lib/mutationSchemas";
import { getRemoteValuationEstimate } from "@/lib/valuationResult";
import {
  buildMetaLines,
  getCityFromAddress,
  getFirstError,
  getQuickSaleNumericFields,
  getRequiredPropertyType,
  getSubmitEstimate,
  ui,
  type ErrorSetter,
  type EstimateSetter,
  type QuickSaleErrors,
  type QuickSaleFormValues,
  type QuickSaleUser,
  type RemoteEstimateData,
} from "./quickSaleFormModel";

export const showValidationErrors = (errors: QuickSaleErrors, setErrors: ErrorSetter): boolean => {
  setErrors(errors);
  const firstError = getFirstError(errors);
  if (!firstError) return false;
  toast.error(firstError);
  return true;
};

const saveSellerIntent = () => {
  try {
    localStorage.setItem("signup_participant_type", "seller");
  } catch (_err: unknown) {
    /* ignore */
  }
};

export const navigateToSellerSetup = (navigate: NavigateFunction, hasUser: boolean) => {
  if (!hasUser) {
    navigate("/signup?type=seller");
    return;
  }
  saveSellerIntent();
  navigate("/onboarding");
};

export const getSubmitUserId = (user: QuickSaleUser, navigate: NavigateFunction): string | null => {
  if (user) return user.id;
  navigate("/login");
  return null;
};

export const redirectBlockedSubmitter = (canSubmitQuickSale: boolean, _navigate: NavigateFunction): boolean => {
  if (canSubmitQuickSale) return false;
  saveSellerIntent();
  toast.info("Quick Sale submissions are available only to seller profiles.");
  return true;
};

export const showAuthPendingToast = (authPending: boolean): boolean => {
  if (!authPending) return false;
  toast.info("Checking your seller profile. Please try again in a moment.");
  return true;
};

export const showAiEstimateError = (
  error: unknown,
  data: RemoteEstimateData | null | undefined,
) => {
  if (isAiUsageLimitError(error, data)) {
    toast.error("AI estimate is temporarily unavailable due to usage limits.");
    return;
  }
  if (error || data?.error) {
    toast.error("AI estimate is temporarily unavailable. Using fallback estimate.");
  }
};

export const applyRemoteEstimate = (
  data: RemoteEstimateData | null | undefined,
  fnErr: unknown,
  setAiEstimate: EstimateSetter,
  fallbackMarketValue = 0,
) => {
  const remoteEstimate = getRemoteValuationEstimate(data);
  const fallbackEstimate = !fnErr && !data?.error ? Number(fallbackMarketValue) : 0;
  const marketEstimate = remoteEstimate ?? (Number.isFinite(fallbackEstimate) && fallbackEstimate > 0 ? fallbackEstimate : null);
  if (marketEstimate && marketEstimate > 0) {
    setAiEstimate(Math.round(marketEstimate * 0.95));
    return;
  }
  showAiEstimateError(fnErr, data);
};

const insertFiresaleRequest = (
  form: QuickSaleFormValues,
  _userId: string,
  estimate: number,
  propertyType: ReturnType<typeof getRequiredPropertyType>,
  metaLines: string[],
) => {
  const numericFields = getQuickSaleNumericFields(form);
  const body = parseMutationInput(firesaleRequestCreateBodySchema, {
    action: "create",
    request: {
      address: form.address.trim(),
      city: form.city.trim() || getCityFromAddress(form.address),
      propertyType,
      sqm: numericFields.sqm,
      askingPrice: numericFields.askingPrice,
      contactEmail: form.contactEmail.trim(),
      contactPhone: form.contactPhone.trim() || null,
      notes: metaLines.join("\n") || null,
      aiEstimate: estimate,
    },
  }, "quick sale request");

  return supabase.functions.invoke("submit-firesale-request", { body })
    .then(({ data, error }) => {
      const envelope = data as { data?: { id?: string } | null; error?: { message?: string } | string | null } | null;
      const envelopeError = envelope?.error
        ? new Error(typeof envelope.error === "string" ? envelope.error : envelope.error.message || "Quick Sale request failed")
        : null;
      return {
        data: envelope?.data ?? null,
        error: error ?? envelopeError,
      };
    });
};

const rollbackFiresaleRequest = async (requestId: string) => {
  const body = parseMutationInput(firesaleRequestRollbackBodySchema, {
    action: "rollback",
    requestId,
  }, "quick sale rollback");
  await supabase.functions.invoke("submit-firesale-request", { body });
};

const ensurePhotosUploaded = async (
  requestId: string | null,
  photoCount: number,
  uploadPhotos: (requestId: string) => Promise<string[]>,
) => {
  if (photoCount === 0 || !requestId) return;
  const uploadedUrls = await uploadPhotos(requestId);
  if (uploadedUrls.length === photoCount) return;
  await rollbackFiresaleRequest(requestId);
  throw new Error(ui("Photo upload failed. Your request was not submitted; please retry the upload.", "Η μεταφόρτωση φωτογραφιών απέτυχε. Το αίτημα δεν υποβλήθηκε, δοκιμάστε ξανά."));
};

export const submitValidatedQuickSale = async (
  form: QuickSaleFormValues,
  userId: string,
  aiEstimate: number | null,
  photoCount: number,
  uploadPhotos: (requestId: string) => Promise<string[]>,
): Promise<{ estimate: number; requestId: string | null }> => {
  const estimate = getSubmitEstimate(aiEstimate, form);
  const propertyType = getRequiredPropertyType(form.propertyType);
  const { data, error } = await insertFiresaleRequest(form, userId, estimate, propertyType, buildMetaLines(form, photoCount));
  if (error) throw error;
  const requestId = data?.id || null;
  await ensurePhotosUploaded(requestId, photoCount, uploadPhotos);
  return { estimate, requestId };
};
