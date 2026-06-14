import type { NavigateFunction } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isAiUsageLimitError } from "@/lib/aiErrorUtils";
import {
  firesaleRequestSchema,
  firesaleRollbackSchema,
  parseMutationInput,
} from "@/lib/mutationSchemas";
import { getRemoteValuationEstimate } from "@/lib/valuationResult";
import {
  buildMetaLines,
  getCityFromAddress,
  getFirstError,
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
  userId: string,
  estimate: number,
  propertyType: ReturnType<typeof getRequiredPropertyType>,
  metaLines: string[],
) =>
  supabase
    .from("firesale_requests")
    .insert(parseMutationInput(firesaleRequestSchema, {
      address: form.address.trim(),
      city: form.city.trim() || getCityFromAddress(form.address),
      property_type: propertyType,
      sqm: Number(form.sqm),
      condition: null,
      asking_price: Number(form.askingPrice),
      contact_email: form.contactEmail.trim(),
      contact_phone: form.contactPhone.trim() || null,
      notes: metaLines.join("\n") || null,
      ai_estimate: estimate,
      user_id: userId,
      status: "pending",
    }, "quick sale request"))
    .select("id")
    .single();

const rollbackFiresaleRequest = async (requestId: string, userId: string) => {
  const payload = parseMutationInput(firesaleRollbackSchema, { requestId, userId }, "quick sale rollback");
  await supabase.from("firesale_requests").delete().eq("id", payload.requestId).eq("user_id", payload.userId);
};

const ensurePhotosUploaded = async (
  requestId: string | null,
  userId: string,
  photoCount: number,
  uploadPhotos: (requestId: string) => Promise<string[]>,
) => {
  if (photoCount === 0 || !requestId) return;
  const uploadedUrls = await uploadPhotos(requestId);
  if (uploadedUrls.length === photoCount) return;
  await rollbackFiresaleRequest(requestId, userId);
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
  await ensurePhotosUploaded(requestId, userId, photoCount, uploadPhotos);
  return { estimate, requestId };
};
