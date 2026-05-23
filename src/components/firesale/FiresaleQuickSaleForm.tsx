/**
 * Self-contained multi-step Quick Sale™ form.
 * Manages all form state, validation, photo upload, and AI estimate internally.
 */

import { useState, useEffect, type ChangeEvent, type RefObject } from "react";
import { useNavigate, type NavigateFunction } from "react-router-dom";
import {
  Flame,
  MapPin,
  Shield,
  Euro,
  Loader2,
  Sparkles,
  Hash,
  Upload,
  X,
  ImageIcon,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isSellSideRole } from "@/lib/authUtils";
import { useSubscription } from "@/hooks/useSubscription";
import { useNominatimAddressSuggestions } from "@/hooks/useNominatimAddressSuggestions";
import { useFiresalePhotoUploader } from "@/hooks/useFiresalePhotoUploader";
import { isAiUsageLimitError } from "@/lib/aiErrorUtils";
import { KAEK_MAX_LENGTH, isValidKaek, normalizeKaek, toFiresalePropertyType } from "@/lib/firesaleValidation";
import { toast } from "sonner";
import { QuickSaleSubmittedView } from "@/components/firesale/QuickSaleSubmittedView";

const propertyTypeOptions = [
  { value: "apartment", label: "🏢 Apartment" },
  { value: "house", label: "🏡 House" },
  { value: "villa", label: "🌴 Villa" },
  { value: "land", label: "🌿 Land / Plot" },
  { value: "office", label: "🖥️ Office" },
  { value: "commercial_shop", label: "🛍️ Retail Shop" },
  { value: "commercial_warehouse", label: "📦 Warehouse / Storage" },
  { value: "commercial_hotel", label: "🏨 Hotel / B&B" },
  { value: "commercial_restaurant", label: "🍽️ Restaurant / Café" },
  { value: "commercial_clinic", label: "🔬 Clinic / Medical" },
  { value: "commercial_industrial", label: "🏗️ Industrial Space" },
  { value: "commercial_showroom", label: "🖼️ Showroom" },
  { value: "commercial_hall", label: "🎪 Hall / Event Space" },
  { value: "commercial_mixed", label: "🔀 Mixed-Use Building" },
];

const ui = (en: string, el: string): string =>
  i18next.language?.toLowerCase().startsWith("el") ? el : en;

const propertyTypeLabel = (value: string, label: string): string => {
  const labels: Record<string, string> = {
    apartment: "🏢 Διαμέρισμα",
    house: "🏡 Μονοκατοικία",
    villa: "🌴 Βίλα",
    land: "🌿 Οικόπεδο / Αγροτεμάχιο",
    office: "🖥️ Γραφείο",
    commercial_shop: "🛍️ Κατάστημα",
    commercial_warehouse: "📦 Αποθήκη / Αποθηκευτικός χώρος",
    commercial_hotel: "🏨 Ξενοδοχείο / B&B",
    commercial_restaurant: "🍽️ Εστιατόριο / Καφέ",
    commercial_clinic: "🔬 Ιατρείο / Κλινική",
    commercial_industrial: "🏗️ Βιομηχανικός χώρος",
    commercial_showroom: "🖼️ Εκθεσιακός χώρος",
    commercial_hall: "🎪 Αίθουσα / χώρος εκδηλώσεων",
    commercial_mixed: "🔀 Κτίριο μεικτής χρήσης",
  };
  return i18next.language?.toLowerCase().startsWith("el") ? labels[value] ?? label : label;
};

const NOW_YEAR = new Date().getFullYear();

type QuickSaleFormValues = {
  address: string;
  kaek: string;
  propertyType: string;
  sqm: string;
  askingPrice: string;
  constructionYear: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
};

type QuickSaleErrors = Record<string, string>;
type QuickSaleProfile = { display_name?: string | null; first_name?: string | null; phone?: string | null; role?: string | null } | null;
type QuickSaleUser = { id: string; email?: string | null } | null;
type RemoteEstimateData = { estimated_value?: number | null; error?: string };
type ErrorSetter = (errors: QuickSaleErrors) => void;
type EstimateSetter = (estimate: number) => void;
type QuickSaleFieldUpdater = (key: keyof QuickSaleFormValues, value: string) => void;
type PhotoSelectHandler = (event: ChangeEvent<HTMLInputElement>) => void;

const firstFilled = (...values: Array<string | null | undefined>): string =>
  values.find((value) => Boolean(value)) ?? "";

const getProfileContactName = (profile: QuickSaleProfile): string =>
  firstFilled(profile?.display_name, profile?.first_name);

const getProfilePhone = (profile: QuickSaleProfile): string => profile?.phone ?? "";

const getUserEmail = (userEmail: string | null | undefined): string => userEmail ?? "";

const buildInitialForm = (profile: QuickSaleProfile, userEmail: string | null | undefined): QuickSaleFormValues => ({
  address: "",
  kaek: "",
  propertyType: "",
  sqm: "",
  askingPrice: "",
  constructionYear: "",
  contactName: getProfileContactName(profile),
  contactEmail: getUserEmail(userEmail),
  contactPhone: getProfilePhone(profile),
  notes: "",
});

const keepFilled = (currentValue: string, fallbackValue: string | null | undefined): string =>
  currentValue ? currentValue : fallbackValue ?? "";

const syncContactFields = (
  prev: QuickSaleFormValues,
  profile: QuickSaleProfile,
  userEmail: string | null | undefined,
): QuickSaleFormValues => ({
  ...prev,
  contactName: keepFilled(prev.contactName, firstFilled(profile?.display_name, profile?.first_name)),
  contactEmail: keepFilled(prev.contactEmail, userEmail),
  contactPhone: keepFilled(prev.contactPhone, profile?.phone),
});

const validateAddress = (address: string): string | null =>
  address.trim().length < 5 ? ui("Please enter a full address (min 5 characters).", "Συμπληρώστε πλήρη διεύθυνση (τουλάχιστον 5 χαρακτήρες).") : null;

const validateKaekValue = (value: string): string | null => {
  const kaek = normalizeKaek(value);
  if (!kaek) return ui("KAEK is required.", "Το ΚΑΕΚ είναι υποχρεωτικό.");
  if (!isValidKaek(kaek)) {
    return ui(
      "KAEK must be 12 digits, optionally followed by sub-property parts, e.g. 050240601001 or 050240601001/0/1.",
      "Το ΚΑΕΚ πρέπει να έχει 12 ψηφία, προαιρετικά με τμήματα υπο-ιδιοκτησίας, π.χ. 050240601001 ή 050240601001/0/1.",
    );
  }
  return null;
};

const validatePropertyType = (propertyType: string): string | null => {
  if (!propertyType) return ui("Property type is required.", "Ο τύπος ακινήτου είναι υποχρεωτικός.");
  return toFiresalePropertyType(propertyType) ? null : ui("Property type is invalid.", "Ο τύπος ακινήτου δεν είναι έγκυρος.");
};

const validateNumberRange = (
  value: string,
  label: string,
  min: number,
  max: number,
  rangeMessage: string,
): string | null => {
  const numericValue = Number(value);
  if (!value || Number.isNaN(numericValue)) return ui(`${label} is required.`, `Το πεδίο ${label} είναι υποχρεωτικό.`);
  return numericValue < min || numericValue > max ? rangeMessage : null;
};

const validateNotes = (notes: string): string | null =>
  notes.trim().length < 3 ? ui("Please add a short note.", "Προσθέστε μια σύντομη σημείωση.") : null;

const validatePhotoCount = (count: number): string | null =>
  count < 5 ? ui("Please upload at least 5 property photos.", "Ανεβάστε τουλάχιστον 5 φωτογραφίες του ακινήτου.") : null;

const validateContactName = (name: string): string | null =>
  name.trim().length < 2 ? ui("Full name is required.", "Το ονοματεπώνυμο είναι υποχρεωτικό.") : null;

const validateContactEmail = (email: string): string | null => {
  if (!email.trim()) return ui("Email is required.", "Το email είναι υποχρεωτικό.");
  return /\S+@\S+\.\S+/.test(email) ? null : ui("Email looks invalid.", "Το email φαίνεται μη έγκυρο.");
};

const validateContactPhone = (phoneValue: string): string | null => {
  const phone = phoneValue.replace(/\s+/g, "").trim();
  if (!phone) return ui("Phone number is required.", "Το τηλέφωνο είναι υποχρεωτικό.");
  return /^\+?[0-9]{8,15}$/.test(phone) ? null : ui("Phone number looks invalid (use digits, optionally starting with +).", "Το τηλέφωνο φαίνεται μη έγκυρο (χρησιμοποιήστε ψηφία, προαιρετικά με +).");
};

const collectErrors = (checks: Array<[string, string | null]>): QuickSaleErrors => {
  const next: QuickSaleErrors = {};
  checks.forEach(([key, message]) => {
    if (message) next[key] = message;
  });
  return next;
};

const validateStep1Form = (form: QuickSaleFormValues, photoCount: number): QuickSaleErrors =>
  collectErrors([
    ["address", validateAddress(form.address)],
    ["kaek", validateKaekValue(form.kaek)],
    ["propertyType", validatePropertyType(form.propertyType)],
    ["sqm", validateNumberRange(form.sqm, ui("Size (m\u00b2)", "Εμβαδόν (τ.μ.)"), 10, 5000, ui("Size (m\u00b2) must be between 10 and 5000.", "Το εμβαδόν πρέπει να είναι μεταξύ 10 και 5000 τ.μ."))],
    [
      "askingPrice",
      validateNumberRange(form.askingPrice, ui("Asking price", "Ζητούμενη τιμή"), 5_000, 100_000_000, ui("Asking price must be between \u20ac5,000 and \u20ac100,000,000.", "Η ζητούμενη τιμή πρέπει να είναι μεταξύ €5.000 και €100.000.000.")),
    ],
    [
      "constructionYear",
      validateNumberRange(form.constructionYear, ui("Construction year", "Έτος κατασκευής"), 1800, NOW_YEAR + 1, ui(`Construction year must be between 1800 and ${NOW_YEAR + 1}.`, `Το έτος κατασκευής πρέπει να είναι μεταξύ 1800 και ${NOW_YEAR + 1}.`)),
    ],
    ["photos", validatePhotoCount(photoCount)],
    ["notes", validateNotes(form.notes)],
  ]);

const validateStep2Form = (form: QuickSaleFormValues): QuickSaleErrors =>
  collectErrors([
    ["contactName", validateContactName(form.contactName)],
    ["contactEmail", validateContactEmail(form.contactEmail)],
    ["contactPhone", validateContactPhone(form.contactPhone)],
  ]);

const getFirstError = (errors: QuickSaleErrors): string | null => Object.values(errors)[0] ?? null;

const showValidationErrors = (errors: QuickSaleErrors, setErrors: ErrorSetter): boolean => {
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

const navigateToSellerSetup = (navigate: NavigateFunction, hasUser: boolean) => {
  if (!hasUser) {
    navigate("/signup?type=seller");
    return;
  }
  saveSellerIntent();
  navigate("/onboarding");
};

const getSubmitUserId = (user: QuickSaleUser, navigate: NavigateFunction): string | null => {
  if (user) return user.id;
  navigate("/login");
  return null;
};

const redirectBlockedSubmitter = (canSubmitQuickSale: boolean, navigate: NavigateFunction): boolean => {
  if (canSubmitQuickSale) return false;
  saveSellerIntent();
  navigate("/onboarding");
  return true;
};

const showAuthPendingToast = (authPending: boolean): boolean => {
  if (!authPending) return false;
  toast.info("Checking your seller profile. Please try again in a moment.");
  return true;
};

const canSubmitQuickSaleRequest = (
  user: QuickSaleUser,
  profile: QuickSaleProfile,
  authPending: boolean,
): boolean => Boolean(user) && !authPending && profile != null && isSellSideRole(profile);

const BASE_PRICE_PER_SQM: Record<string, number> = {
  villa: 3200,
  house: 2400,
  apartment: 2000,
  commercial: 2800,
  office: 2600,
  land: 900,
};

const getLocalEstimate = (form: QuickSaleFormValues): number =>
  Math.round((BASE_PRICE_PER_SQM[form.propertyType] || 2000) * Number(form.sqm) * 0.92);

const showAiEstimateLimitError = (
  error: unknown,
  data: RemoteEstimateData | null | undefined,
) => {
  if (isAiUsageLimitError(error, data)) toast.error("AI estimate is temporarily unavailable due to usage limits.");
};

const applyRemoteEstimate = (
  data: RemoteEstimateData | null | undefined,
  fnErr: unknown,
  setAiEstimate: EstimateSetter,
) => {
  if (data?.estimated_value) {
    setAiEstimate(Math.round(data.estimated_value * 0.95));
    return;
  }
  showAiEstimateLimitError(fnErr, data);
};

const validateSubmissionForm = (form: QuickSaleFormValues, photoCount: number): QuickSaleErrors => ({
  ...validateStep1Form(form, photoCount),
  ...validateStep2Form(form),
});

const getSubmitEstimate = (aiEstimate: number | null, form: QuickSaleFormValues): number =>
  aiEstimate ?? Math.round(Number(form.sqm) * 1900 * 0.92);

const getPhotoGrade = (count: number): number => {
  if (count >= 8) return 9;
  if (count >= 5) return 7;
  if (count >= 3) return 5;
  return 3;
};

const buildMetaLines = (form: QuickSaleFormValues, photoCount: number): string[] => {
  const metaLines: string[] = [];
  if (form.constructionYear.trim()) metaLines.push(`${ui("Construction year", "Έτος κατασκευής")}: ${form.constructionYear.trim()}`);
  if (photoCount > 0) metaLines.push(`${ui("Photo condition grade (1-10)", "Βαθμός κατάστασης φωτογραφιών (1-10)")}: ${getPhotoGrade(photoCount)}`);
  if (form.kaek.trim()) metaLines.push(`KAEK: ${normalizeKaek(form.kaek)}`);
  if (form.notes.trim()) metaLines.push(form.notes.trim());
  return metaLines;
};

const getCityFromAddress = (address: string): string => address.split(",").pop()?.trim() || "";

const getRequiredPropertyType = (propertyType: string): NonNullable<ReturnType<typeof toFiresalePropertyType>> => {
  const mappedPropertyType = toFiresalePropertyType(propertyType);
  if (!mappedPropertyType) throw new Error("Property type is invalid.");
  return mappedPropertyType;
};

const insertFiresaleRequest = (
  form: QuickSaleFormValues,
  userId: string,
  estimate: number,
  propertyType: NonNullable<ReturnType<typeof toFiresalePropertyType>>,
  metaLines: string[],
) =>
  supabase
    .from("firesale_requests")
    .insert({
      address: form.address.trim(),
      city: getCityFromAddress(form.address),
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
    })
    .select("id")
    .single();

const rollbackFiresaleRequest = async (requestId: string, userId: string) => {
  await supabase.from("firesale_requests").delete().eq("id", requestId).eq("user_id", userId);
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

const submitValidatedQuickSale = async (
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

const QuickSaleHeader = ({ step }: { step: number }) => (
  <div className="px-5 sm:px-7 py-5 border-b border-border bg-gradient-to-r from-destructive/5 to-transparent">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
        <Flame className="w-4.5 h-4.5 text-destructive" />
      </div>
      <div>
        <h3 className="font-display font-bold text-base">{ui("Get Your Preliminary Cash Offer", "Λάβετε προκαταρκτική προσφορά μετρητών")}</h3>
        <p className="text-xs text-muted-foreground">{ui("Free - No obligation - Confidential", "Δωρεάν - Χωρίς υποχρέωση - Εμπιστευτικό")}</p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {[1, 2].map((n) => (
          <div key={n} className={`w-7 h-1.5 rounded-full transition-all ${step >= n ? "bg-primary" : "bg-border"}`} />
        ))}
        <span className="text-[10px] text-muted-foreground ml-1">{step}/2</span>
      </div>
    </div>
  </div>
);

const SellerGateBanner = ({
  authPending,
  canSubmitQuickSale,
  userExists,
  onSellerCta,
}: {
  authPending: boolean;
  canSubmitQuickSale: boolean;
  userExists: boolean;
  onSellerCta: () => void;
}) => {
  if (authPending) {
    return (
      <div className="rounded-xl bg-muted border border-border p-3 flex items-start gap-3">
        <Loader2 className="w-4 h-4 text-primary mt-0.5 shrink-0 animate-spin" />
        <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{ui("Checking seller profile", "Έλεγχος προφίλ πωλητή")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ui("We are loading your account details before enabling Quick Sale submissions.", "Φορτώνουμε τα στοιχεία λογαριασμού πριν ενεργοποιηθεί η υποβολή Quick Sale.")}
          </p>
        </div>
      </div>
    );
  }
  if (canSubmitQuickSale) return null;

  return (
    <div className="rounded-xl bg-muted border border-border p-3 flex items-start gap-3">
      <Lock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{ui("Seller account required", "Απαιτείται λογαριασμός πωλητή")}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {ui("To submit a Quick Sale request, you must have a Seller profile. It's free - Pro is not required.", "Για να υποβάλετε αίτημα Quick Sale, χρειάζεστε προφίλ πωλητή. Είναι δωρεάν - δεν απαιτείται Pro.")}
        </p>
        <div className="mt-2">
          <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground" onClick={onSellerCta}>
            {userExists ? ui("Become a Seller", "Μετάβαση σε πωλητή") : ui("Sign up as Seller", "Εγγραφή ως πωλητής")}
          </Button>
        </div>
      </div>
    </div>
  );
};

const AddressField = ({
  form,
  errors,
  addressLoading,
  addressSuggestions,
  onUpdate,
  onClearSuggestions,
}: {
  form: QuickSaleFormValues;
  errors: QuickSaleErrors;
  addressLoading: boolean;
  addressSuggestions: string[];
  onUpdate: QuickSaleFieldUpdater;
  onClearSuggestions: () => void;
}) => (
  <div>
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
      {ui("Property Address", "Διεύθυνση ακινήτου")} <span className="text-destructive">*</span>
    </label>
    <div className="flex gap-2 bg-muted border border-border rounded-xl px-3 py-2.5 focus-within:border-primary transition-colors">
      <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      <input
        type="text"
        placeholder={ui("e.g. Kifisia, Dekelia 24, Athens", "π.χ. Κηφισιά, Δεκελείας 24, Αθήνα")}
        value={form.address}
        onChange={(e) => onUpdate("address", e.target.value)}
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
      />
    </div>
    {errors.address && <p className="mt-1 text-xs text-destructive">{errors.address}</p>}
    {addressLoading && <p className="mt-1 text-[10px] text-muted-foreground">{ui("Searching address suggestions...", "Αναζήτηση προτάσεων διεύθυνσης...")}</p>}
    {!addressLoading && addressSuggestions.length > 0 && (
      <div className="mt-1 bg-background border border-border rounded-xl shadow-md text-sm max-h-40 overflow-auto">
        {addressSuggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => {
              onUpdate("address", suggestion);
              onClearSuggestions();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-muted/80"
          >
            {suggestion}
          </button>
        ))}
      </div>
    )}
  </div>
);

const KaekField = ({ form, errors, onUpdate }: { form: QuickSaleFormValues; errors: QuickSaleErrors; onUpdate: QuickSaleFieldUpdater }) => (
  <div>
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
      KAEK <span className="text-destructive">*</span>{" "}
      <span className="text-[10px] font-normal normal-case text-muted-foreground">({ui("Greek cadastral property code", "Κωδικός Αριθμός Εθνικού Κτηματολογίου")})</span>
    </label>
    <div className="flex gap-2 bg-muted border border-border rounded-xl px-3 py-2.5 focus-within:border-primary transition-colors">
      <Hash className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      <input
        type="text"
        placeholder="e.g. 050240601001/0/1"
        value={form.kaek}
        maxLength={KAEK_MAX_LENGTH}
        inputMode="numeric"
        onChange={(e) => onUpdate("kaek", normalizeKaek(e.target.value))}
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none font-mono"
      />
    </div>
    <p className="mt-1 text-[10px] text-muted-foreground">
      {ui("Greek KAEK is normally 12 digits. Add sub-property parts only when applicable, e.g. /0/1.", "Το ΚΑΕΚ έχει συνήθως 12 ψηφία. Προσθέστε τμήματα υπο-ιδιοκτησίας μόνο όταν υπάρχουν, π.χ. /0/1.")}
    </p>
    {errors.kaek && <p className="mt-1 text-xs text-destructive">{errors.kaek}</p>}
  </div>
);

const PropertyMetricsFields = ({
  form,
  errors,
  onUpdate,
}: {
  form: QuickSaleFormValues;
  errors: QuickSaleErrors;
  onUpdate: QuickSaleFieldUpdater;
}) => (
  <div className="grid grid-cols-2 gap-4">
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
        {ui("Property Type", "Τύπος ακινήτου")} <span className="text-destructive">*</span>
      </label>
      <select
        value={form.propertyType}
        onChange={(e) => onUpdate("propertyType", e.target.value)}
        className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none capitalize"
      >
        <option value="" className="bg-card">{ui("Select type...", "Επιλέξτε τύπο...")}</option>
        {propertyTypeOptions.map((type) => (
          <option key={type.value} value={type.value} className="bg-card">{propertyTypeLabel(type.value, type.label)}</option>
        ))}
      </select>
      {errors.propertyType && <p className="mt-1 text-xs text-destructive">{errors.propertyType}</p>}
    </div>
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
        {ui("Size (m²)", "Εμβαδόν (τ.μ.)")} <span className="text-destructive">*</span>
      </label>
      <input
        type="number"
        placeholder="e.g. 120"
        value={form.sqm}
        onChange={(e) => onUpdate("sqm", e.target.value)}
        className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
      />
      {errors.sqm && <p className="mt-1 text-xs text-destructive">{errors.sqm}</p>}
    </div>
    <div className="col-span-2">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
        {ui("Asking Price", "Ζητούμενη τιμή")} <span className="text-destructive">*</span>
      </label>
      <div className="flex gap-2 bg-muted border border-border rounded-xl px-3 py-2.5 focus-within:border-primary transition-colors">
        <Euro className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          type="number"
          placeholder={ui("Your target EUR", "Η επιθυμητή τιμή σε EUR")}
          value={form.askingPrice}
          onChange={(e) => onUpdate("askingPrice", e.target.value)}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
      </div>
      {errors.askingPrice && <p className="mt-1 text-xs text-destructive">{errors.askingPrice}</p>}
    </div>
    <div className="col-span-2">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
        {ui("Construction Year", "Έτος κατασκευής")} <span className="text-destructive">*</span>
      </label>
      <input
        type="number"
        placeholder="e.g. 1998"
        value={form.constructionYear}
        onChange={(e) => onUpdate("constructionYear", e.target.value)}
        className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
      />
      {errors.constructionYear && <p className="mt-1 text-xs text-destructive">{errors.constructionYear}</p>}
    </div>
  </div>
);

const getPhotoSelectionText = (count: number): string => `${count} photo${count !== 1 ? "s" : ""} selected`;

const EmptyPhotoUploadButton = ({ fileInputRef }: { fileInputRef: RefObject<HTMLInputElement> }) => (
  <button
    type="button"
    onClick={() => fileInputRef.current?.click()}
    className="w-full flex flex-col items-center justify-center gap-2 bg-muted border-2 border-dashed border-border rounded-xl py-7 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 group"
  >
    <div className="w-10 h-10 rounded-full bg-muted-foreground/10 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
      <Upload className="w-5 h-5 group-hover:text-primary transition-colors" />
    </div>
    <div className="text-center">
      <p className="text-sm font-medium group-hover:text-foreground transition-colors">{ui("Click to upload photos", "Πατήστε για ανέβασμα φωτογραφιών")}</p>
      <p className="text-[11px] mt-0.5">{ui("JPG, PNG - Max 10MB each", "JPG, PNG - Μέγ. 10MB ανά αρχείο")}</p>
    </div>
  </button>
);

const PhotoPreviewTile = ({
  src,
  index,
  onRemovePhoto,
}: {
  src: string;
  index: number;
  onRemovePhoto: (index: number) => void;
}) => (
  <div className="relative group rounded-xl overflow-hidden aspect-square bg-muted border border-border">
    <img src={src} alt="" className="w-full h-full object-cover" />
    <button
      type="button"
      onClick={() => onRemovePhoto(index)}
      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-background/90 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:border-destructive hover:text-destructive-foreground"
    >
      <X className="w-3 h-3" />
    </button>
  </div>
);

const AddPhotoTile = ({ fileInputRef }: { fileInputRef: RefObject<HTMLInputElement> }) => (
  <button
    type="button"
    onClick={() => fileInputRef.current?.click()}
    className="aspect-square rounded-xl border-2 border-dashed border-border bg-muted hover:border-primary/40 hover:bg-primary/5 flex items-center justify-center transition-all"
  >
    <ImageIcon className="w-5 h-5 text-muted-foreground" />
  </button>
);

const PhotoPreviewGrid = ({
  photoPreviews,
  fileInputRef,
  onRemovePhoto,
}: {
  photoPreviews: string[];
  fileInputRef: RefObject<HTMLInputElement>;
  onRemovePhoto: (index: number) => void;
}) => (
  <div className="grid grid-cols-3 gap-2">
    {photoPreviews.map((src, index) => (
      <PhotoPreviewTile key={src} src={src} index={index} onRemovePhoto={onRemovePhoto} />
    ))}
    {photoPreviews.length < 10 && <AddPhotoTile fileInputRef={fileInputRef} />}
  </div>
);

const PhotoUploadField = ({
  errors,
  photoPreviews,
  fileInputRef,
  onPhotoSelect,
  onRemovePhoto,
}: {
  errors: QuickSaleErrors;
  photoPreviews: string[];
  fileInputRef: RefObject<HTMLInputElement>;
  onPhotoSelect: PhotoSelectHandler;
  onRemovePhoto: (index: number) => void;
}) => (
  <div>
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
      {ui("Property Photos", "Φωτογραφίες ακινήτου")} <span className="text-destructive">*</span>{" "}
      <span className="text-[10px] font-normal normal-case text-muted-foreground">{ui("(min 5, up to 10 images)", "(ελάχ. 5, έως 10 εικόνες)")}</span>
    </label>
    <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onPhotoSelect} />
    {photoPreviews.length === 0 ? (
      <EmptyPhotoUploadButton fileInputRef={fileInputRef} />
    ) : (
      <div className="space-y-3">
        <PhotoPreviewGrid photoPreviews={photoPreviews} fileInputRef={fileInputRef} onRemovePhoto={onRemovePhoto} />
        <p className="text-[10px] text-muted-foreground">
          {ui(getPhotoSelectionText(photoPreviews.length), `${photoPreviews.length} φωτογραφ${photoPreviews.length === 1 ? "ία επιλέχθηκε" : "ίες επιλέχθηκαν"}`)}
          {photoPreviews.length < 5 && ui(" - add at least 5 photos to continue", " - προσθέστε τουλάχιστον 5 φωτογραφίες για συνέχεια")}
        </p>
      </div>
    )}
    {errors.photos && <p className="mt-1 text-xs text-destructive">{errors.photos}</p>}
  </div>
);

const NotesField = ({ form, errors, onUpdate }: { form: QuickSaleFormValues; errors: QuickSaleErrors; onUpdate: QuickSaleFieldUpdater }) => (
  <div>
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
      {ui("Additional Notes", "Πρόσθετες σημειώσεις")} <span className="text-destructive">*</span>
    </label>
    <textarea
      rows={2}
      placeholder={ui("Legal issues, urgent timeline, property history...", "Νομικά θέματα, επείγον χρονοδιάγραμμα, ιστορικό ακινήτου...")}
      value={form.notes}
      onChange={(e) => onUpdate("notes", e.target.value)}
      className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors"
    />
    {errors.notes && <p className="mt-1 text-xs text-destructive">{errors.notes}</p>}
  </div>
);

type StepOneProps = {
  authPending: boolean;
  canSubmitQuickSale: boolean;
  userExists: boolean;
  form: QuickSaleFormValues;
  errors: QuickSaleErrors;
  addressLoading: boolean;
  addressSuggestions: string[];
  photoPreviews: string[];
  fileInputRef: RefObject<HTMLInputElement>;
  aiLoading: boolean;
  onSellerCta: () => void;
  onUpdate: QuickSaleFieldUpdater;
  onClearAddressSuggestions: () => void;
  onPhotoSelect: PhotoSelectHandler;
  onRemovePhoto: (index: number) => void;
  onContinue: () => void;
};

const StepOneButtonContent = ({ aiLoading }: { aiLoading: boolean }) => {
  if (aiLoading) {
    return (
      <>
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        {ui("Calculating AI estimate...", "Υπολογισμός AI εκτίμησης...")}
      </>
    );
  }

  return (
    <>
      <Sparkles className="w-4 h-4 mr-2" />
      {ui("Get AI Estimate & Continue", "Λήψη AI εκτίμησης & συνέχεια")}
    </>
  );
};

const QuickSaleStepOne = (props: StepOneProps) => (
  <div className="space-y-5">
    <h4 className="font-display font-semibold text-sm">{ui("Property Details", "Στοιχεία ακινήτου")}</h4>
    <SellerGateBanner
      authPending={props.authPending}
      canSubmitQuickSale={props.canSubmitQuickSale}
      userExists={props.userExists}
      onSellerCta={props.onSellerCta}
    />
    <AddressField
      form={props.form}
      errors={props.errors}
      addressLoading={props.addressLoading}
      addressSuggestions={props.addressSuggestions}
      onUpdate={props.onUpdate}
      onClearSuggestions={props.onClearAddressSuggestions}
    />
    <KaekField form={props.form} errors={props.errors} onUpdate={props.onUpdate} />
    <PropertyMetricsFields form={props.form} errors={props.errors} onUpdate={props.onUpdate} />
    <PhotoUploadField
      errors={props.errors}
      photoPreviews={props.photoPreviews}
      fileInputRef={props.fileInputRef}
      onPhotoSelect={props.onPhotoSelect}
      onRemovePhoto={props.onRemovePhoto}
    />
    <NotesField form={props.form} errors={props.errors} onUpdate={props.onUpdate} />
    <Button className="w-full bg-gradient-primary border-0 text-primary-foreground h-11" disabled={props.aiLoading} onClick={props.onContinue}>
      <StepOneButtonContent aiLoading={props.aiLoading} />
    </Button>
  </div>
);

const EstimateSummary = ({ aiEstimate }: { aiEstimate: number | null }) => {
  if (!aiEstimate) return null;

  return (
    <div className="rounded-xl bg-gradient-to-r from-primary/10 to-accent/5 border border-primary/20 p-4 flex items-center justify-between">
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{ui("AI Estimated Offer", "AI εκτίμηση προσφοράς")}</p>
        <p className="font-display font-black text-2xl text-primary">&euro;{aiEstimate.toLocaleString()}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{ui("Indicative - Final offer after review", "Ενδεικτική - Τελική προσφορά μετά από έλεγχο")}</p>
      </div>
      <div className="text-right">
        <div className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded-lg font-semibold">{ui("94% confidence", "94% εμπιστοσύνη")}</div>
        <p className="text-[10px] text-muted-foreground mt-1.5">{ui("Valid 7 days", "Ισχύει για 7 ημέρες")}</p>
      </div>
    </div>
  );
};

type ContactFieldProps = {
  form: QuickSaleFormValues;
  errors: QuickSaleErrors;
  onUpdate: QuickSaleFieldUpdater;
};

const ContactNameField = ({ form, errors, onUpdate }: ContactFieldProps) => (
  <div>
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
      {ui("Full Name", "Ονοματεπώνυμο")} <span className="text-destructive">*</span>
    </label>
    <input
      type="text"
      placeholder={ui("Your name", "Το όνομά σας")}
      value={form.contactName}
      onChange={(e) => onUpdate("contactName", e.target.value)}
      className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
    />
    {errors.contactName && <p className="mt-1 text-xs text-destructive">{errors.contactName}</p>}
  </div>
);

const ContactEmailField = ({ form, errors, onUpdate }: ContactFieldProps) => (
  <div>
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
      {ui("Email", "Email επικοινωνίας")} <span className="text-destructive">*</span>
    </label>
    <input
      type="email"
      placeholder="email@example.com"
      value={form.contactEmail}
      onChange={(e) => onUpdate("contactEmail", e.target.value)}
      className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
    />
    {errors.contactEmail && <p className="mt-1 text-xs text-destructive">{errors.contactEmail}</p>}
  </div>
);

const ContactPhoneField = ({ form, errors, onUpdate }: ContactFieldProps) => (
  <div>
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
      {ui("Phone", "Τηλέφωνο")} <span className="text-destructive">*</span>
    </label>
    <input
      type="tel"
      placeholder="+30 69..."
      value={form.contactPhone}
      onChange={(e) => onUpdate("contactPhone", e.target.value)}
      className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
    />
    {errors.contactPhone && <p className="mt-1 text-xs text-destructive">{errors.contactPhone}</p>}
  </div>
);

const ContactMethodFields = (props: ContactFieldProps) => (
  <div className="grid grid-cols-2 gap-4">
    <ContactEmailField {...props} />
    <ContactPhoneField {...props} />
  </div>
);

const ContactFields = (props: ContactFieldProps) => (
  <>
    <ContactNameField {...props} />
    <ContactMethodFields {...props} />
  </>
);

type StepTwoProps = {
  aiEstimate: number | null;
  form: QuickSaleFormValues;
  errors: QuickSaleErrors;
  step2Valid: boolean;
  submitting: boolean;
  uploadingPhotos: boolean;
  onUpdate: QuickSaleFieldUpdater;
  onBack: () => void;
  onSubmit: () => void;
};

const SubmitRequestButtonContent = ({ submitting, uploadingPhotos }: { submitting: boolean; uploadingPhotos: boolean }) => {
  if (submitting) {
    return (
      <>
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        {uploadingPhotos ? ui("Uploading photos...", "Ανέβασμα φωτογραφιών...") : ui("Submitting...", "Υποβολή...")}
      </>
    );
  }

  return (
    <>
      <Flame className="w-4 h-4 mr-2" />
      {ui("Submit Quick Sale Request", "Υποβολή αιτήματος Quick Sale")}
    </>
  );
};

const QuickSaleStepTwo = (props: StepTwoProps) => (
  <div className="space-y-5">
    <EstimateSummary aiEstimate={props.aiEstimate} />
    <h4 className="font-display font-semibold text-sm">{ui("Your Contact Details", "Στοιχεία επικοινωνίας")}</h4>
    <p className="text-xs text-muted-foreground -mt-3">{ui("Your information is kept strictly confidential.", "Τα στοιχεία σας παραμένουν αυστηρά εμπιστευτικά.")}</p>
    <ContactFields form={props.form} errors={props.errors} onUpdate={props.onUpdate} />
    <div className="rounded-xl bg-muted border border-border p-3 flex items-start gap-3">
      <Shield className="w-4 h-4 text-brand-emerald mt-0.5 shrink-0" />
      <p className="text-xs text-muted-foreground leading-relaxed">
        {ui("Your data is encrypted and shared", "Τα δεδομένα σας κρυπτογραφούνται και κοινοποιούνται")}{" "}
        <strong className="text-foreground">{ui("only with pre-vetted investors", "μόνο σε προελεγμένους επενδυτές")}</strong>
        {ui(" under NDA. We never publish your property publicly.", " με συμφωνητικό εμπιστευτικότητας. Δεν δημοσιεύουμε ποτέ το ακίνητό σας δημόσια.")}
      </p>
    </div>
    <div className="flex gap-3">
      <Button variant="outline" className="border-border" onClick={props.onBack}>{ui("Back", "Πίσω")}</Button>
      <Button
        className="flex-1 bg-gradient-to-r from-destructive to-destructive/80 border-0 text-destructive-foreground h-11"
        disabled={!props.step2Valid || props.submitting}
        onClick={props.onSubmit}
      >
        <SubmitRequestButtonContent submitting={props.submitting} uploadingPhotos={props.uploadingPhotos} />
      </Button>
    </div>
  </div>
);

type QuickSaleFormViewProps = StepOneProps & StepTwoProps & { step: number };

const QuickSaleFormView = (props: QuickSaleFormViewProps) => (
  <div className="glass-card rounded-2xl border border-primary/20 overflow-hidden shadow-elevated animate-fade-in">
    <QuickSaleHeader step={props.step} />
    <div className="p-5 sm:p-7">
      {props.step === 1 ? <QuickSaleStepOne {...props} /> : <QuickSaleStepTwo {...props} />}
    </div>
  </div>
);

export const FiresaleQuickSaleForm = () => { // skipcq: JS-R1005 - Quick Sale owns one compact two-step workflow; validation and persistence helpers are delegated above.
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

  const [form, setForm] = useState<QuickSaleFormValues>(() => buildInitialForm(profile, user?.email));
  const [errors, setErrors] = useState<QuickSaleErrors>({});

  useEffect(() => {
    setForm((prev) => syncContactFields(prev, profile, user?.email));
  }, [profile, user]);

  const upd: QuickSaleFieldUpdater = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const handleSellerCta = () => navigateToSellerSetup(navigate, Boolean(user));
  const handleBack = () => setStep(1);

  // Address autocomplete delegated to a typed hook (debounced + abortable).
  const {
    suggestions: addressSuggestions,
    loading: addressLoading,
    clear: clearAddressSuggestions,
  } = useNominatimAddressSuggestions(form.address);

  const step2Valid = Object.keys(validateStep2Form(form)).length === 0;
  const generateEstimate = async () => {
    setAiEstimate(getLocalEstimate(form));
    if (!user) { setAiLoading(false); return; }
    setAiLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("property-valuation", {
        body: { property_type: form.propertyType, sqm: Number(form.sqm) },
      });
      applyRemoteEstimate(data, fnErr, setAiEstimate);
    } catch (e: unknown) {
      showAiEstimateLimitError(e, null);
    } finally {
      setAiLoading(false);
    }
  };
  const handleContinue = async () => { // skipcq: JS-R1005 - Step transition validates auth, seller role, form fields, and estimate generation together.
    if (showAuthPendingToast(authPending)) return;
    if (!canSubmitQuickSale) {
      navigateToSellerSetup(navigate, Boolean(user));
      return;
    }
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
  const handleSubmit = async () => { // skipcq: JS-R1005 - Final submit keeps auth, seller gating, validation, and persistence in one click handler.
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
    setForm((f) => ({ ...f, address: "", kaek: "", propertyType: "", sqm: "", askingPrice: "", notes: "" }));
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
      userExists={Boolean(user)}
      form={form}
      errors={errors}
      addressLoading={addressLoading}
      addressSuggestions={addressSuggestions}
      photoPreviews={photoPreviews}
      fileInputRef={fileInputRef}
      aiLoading={aiLoading}
      aiEstimate={aiEstimate}
      step2Valid={step2Valid}
      submitting={submitting}
      uploadingPhotos={uploadingPhotos}
      onSellerCta={handleSellerCta}
      onUpdate={upd}
      onClearAddressSuggestions={clearAddressSuggestions}
      onPhotoSelect={handlePhotoSelect}
      onRemovePhoto={removePhoto}
      onContinue={handleContinue}
      onBack={handleBack}
      onSubmit={handleSubmit}
    />
  );
};
