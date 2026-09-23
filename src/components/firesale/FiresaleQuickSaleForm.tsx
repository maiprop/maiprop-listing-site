/**
 * Self-contained multi-step Quick Sale form.
 * Manages form state, validation, photo upload, and AI estimate orchestration.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useNominatimAddressSuggestions, type NominatimAddressSuggestion } from "@/hooks/useNominatimAddressSuggestions";
import { useFiresalePhotoUploader } from "@/hooks/useFiresalePhotoUploader";
import { getNominatimCity } from "@/lib/locationSuggestions";
import { parseMutationInput, propertyValuationBodySchema } from "@/lib/mutationSchemas";
import {
  mapNominatimSuggestionToAddressPrediction,
  type AddressPrediction,
} from "@/lib/location/addressFormat";
import {
  filterAddressPredictionsForQuery,
  getAddressInputDisplayValue,
} from "@/lib/location/locationSearchSemantics";
import { QuickSaleSubmittedView } from "@/components/firesale/QuickSaleSubmittedView";
import { QuickSaleFormView } from "./QuickSaleFormView";
import {
  buildInitialForm,
  canSubmitQuickSaleRequest,
  getCityFromAddress,
  getQuickSaleNumericFields,
  getRequiredPropertyType,
  syncContactFields,
  validateStep1Form,
  validateStep2Form,
  validateSubmissionForm,
  type QuickSaleErrors,
  type QuickSaleFieldUpdater,
} from "./quickSaleFormModel";
import {
  applyRemoteEstimate,
  getSubmitUserId,
  navigateToSellerSetup,
  redirectBlockedSubmitter,
  showAiEstimateError,
  showAuthPendingToast,
  showValidationErrors,
  submitValidatedQuickSale,
} from "./quickSaleSubmission";

export const FiresaleQuickSaleForm = () => {
  useTranslation();
  const { user, profile, loading: authLoading, profileLoading } = useAuth();
  const { isPro: _isPro } = useSubscription();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [aiEstimate, setAiEstimate] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const estimateGeneration = useRef(0);

  const photoUploader = useFiresalePhotoUploader();
  const {
    files: photoFiles,
    previews: photoPreviews,
    uploading: uploadingPhotos,
    fileInputRef,
    addFiles: handlePhotoSelect,
    removeAt: removePhoto,
    reset: resetPhotos,
    upload: uploadPhotos,
  } = photoUploader;

  const authPending = Boolean(authLoading || profileLoading);
  const canSubmitQuickSale = canSubmitQuickSaleRequest(user, profile, authPending);
  const formLocked = authPending || !canSubmitQuickSale;

  const [form, setForm] = useState(() => buildInitialForm(profile, user?.email));
  const [errors, setErrors] = useState<QuickSaleErrors>({});

  useEffect(() => {
    setForm((prev) => syncContactFields(prev, profile, user?.email));
  }, [profile, user]);

  useEffect(() => {
    estimateGeneration.current += 1;
    setAiEstimate(null);
    setAiLoading(false);
  }, [
    form.address,
    form.city,
    form.propertyType,
    form.sqm,
    form.askingPrice,
    form.constructionYear,
    form.notes,
    user?.id,
  ]);

  const upd: QuickSaleFieldUpdater = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const handleSellerCta = () => navigateToSellerSetup(navigate, Boolean(user));
  const handleBack = () => setStep(1);

  const {
    rawSuggestions: addressSuggestions,
    loading: addressLoading,
    clear: clearAddressSuggestions,
  } = useNominatimAddressSuggestions(form.address);

  const filteredAddressSuggestions = addressSuggestions.filter((suggestion) => {
    const prediction = mapNominatimSuggestionToAddressPrediction(suggestion);
    return filterAddressPredictionsForQuery([prediction], form.address).length > 0;
  });

  const predictionForSuggestion = (suggestion: NominatimAddressSuggestion): AddressPrediction =>
    mapNominatimSuggestionToAddressPrediction(suggestion);

  const handleAddressSuggestionSelect = (suggestion: NominatimAddressSuggestion) => {
    const prediction = predictionForSuggestion(suggestion);
    setForm((prev) => ({
      ...prev,
      address: getAddressInputDisplayValue(prediction) || suggestion.display_name,
      city: prediction.city || getNominatimCity(suggestion) || prev.city,
    }));
  };

  const step2Valid = Object.keys(validateStep2Form(form)).length === 0;

  const generateEstimate = async () => {
    const generation = ++estimateGeneration.current;
    setAiEstimate(null);
    if (!user) { setAiLoading(false); return; }
    setAiLoading(true);
    try {
      const numericFields = getQuickSaleNumericFields(form);
      const valuationBody = parseMutationInput(propertyValuationBodySchema, {
          title: "Quick Sale estimate",
          city: form.city.trim() || getCityFromAddress(form.address),
          address: form.address.trim(),
          price: numericFields.askingPrice,
          sqm: numericFields.sqm,
          propertyType: getRequiredPropertyType(form.propertyType),
          listingType: "sale",
          yearBuilt: numericFields.constructionYear,
          condition: form.notes.trim() || undefined,
          responseVersion: 2,
        }, "property valuation");
      const { data, error: fnErr } = await supabase.functions.invoke("property-valuation", {
        body: valuationBody,
      });
      if (generation === estimateGeneration.current) {
        applyRemoteEstimate(data, fnErr, setAiEstimate);
      }
    } catch (e: unknown) {
      if (generation === estimateGeneration.current) showAiEstimateError(e, null);
    } finally {
      if (generation === estimateGeneration.current) setAiLoading(false);
    }
  };

  const handleContinue = async () => {
    if (showAuthPendingToast(authPending)) return;
    if (redirectBlockedSubmitter(canSubmitQuickSale, navigate)) return;
    if (showValidationErrors(validateStep1Form(form, photoFiles.length), setErrors)) return;
    await generateEstimate();
    setStep(2);
  };

  const persistQuickSaleSubmission = async (userId: string) => {
    setSubmitting(true);
    try {
      const { estimate, requestId: submittedRequestId } = await submitValidatedQuickSale(form, userId, aiEstimate, photoFiles.length, uploadPhotos);
      setAiEstimate(estimate);
      setRequestId(submittedRequestId);
      setSubmitted(true);
      toast.success("Your Quick Sale request has been submitted!");
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    const userId = getSubmitUserId(user, navigate);
    if (!userId) return;
    if (showAuthPendingToast(authPending)) return;
    if (redirectBlockedSubmitter(canSubmitQuickSale, navigate)) return;
    if (showValidationErrors(validateSubmissionForm(form, photoFiles.length), setErrors)) return;
    await persistQuickSaleSubmission(userId);
  };

  const handleReset = () => {
    setSubmitted(false);
    setStep(1);
    setAiEstimate(null);
    setRequestId(null);
    resetPhotos();
    setForm((f) => ({ ...f, address: "", city: "", kaek: "", propertyType: "", sqm: "", askingPrice: "", notes: "" }));
  };

  if (submitted) {
    return (
      <QuickSaleSubmittedView
        requestId={requestId}
        aiEstimate={aiEstimate}
        onReset={handleReset}
      />
    );
  }

  return (
    <QuickSaleFormView
      step={step}
      authPending={authPending}
      canSubmitQuickSale={canSubmitQuickSale}
      formLocked={formLocked}
      userExists={Boolean(user)}
      form={form}
      errors={errors}
      addressLoading={addressLoading}
      addressSuggestions={filteredAddressSuggestions}
      photoPreviews={photoPreviews}
      fileInputRef={fileInputRef}
      aiLoading={aiLoading}
      aiEstimate={aiEstimate}
      step2Valid={step2Valid}
      submitting={submitting}
      uploadingPhotos={uploadingPhotos}
      onSellerCta={handleSellerCta}
      onUpdate={upd}
      onSelectAddressSuggestion={handleAddressSuggestionSelect}
      onClearAddressSuggestions={clearAddressSuggestions}
      onPhotoSelect={handlePhotoSelect}
      onRemovePhoto={removePhoto}
      onContinue={handleContinue}
      onBack={handleBack}
      onSubmit={handleSubmit}
    />
  );
};
