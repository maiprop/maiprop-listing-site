import type { ChangeEvent } from "react";
import i18next from "i18next";
import { isSellerRole } from "@/lib/authUtils";
import { isValidKaek, normalizeKaek, toFiresalePropertyType } from "@/lib/firesaleValidation";

export const propertyTypeOptions = [
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

export const ui = (en: string, el: string): string =>
  i18next.language?.toLowerCase().startsWith("el") ? el : en;

export const propertyTypeLabel = (value: string, label: string): string => {
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

export type QuickSaleFormValues = {
  address: string;
  city: string;
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

export type QuickSaleErrors = Record<string, string>;
export type QuickSaleProfile = { display_name?: string | null; first_name?: string | null; phone?: string | null; role?: string | null } | null;
export type QuickSaleUser = { id: string; email?: string | null } | null;
export type RemoteEstimateData = {
  estimatedValue?: number | null;
  estimated_value?: number | null;
  auctionAdjustedValue?: number | null;
  auction_adjusted_value?: number | null;
  error?: string;
};
export type ErrorSetter = (errors: QuickSaleErrors) => void;
export type EstimateSetter = (estimate: number) => void;
export type QuickSaleFieldUpdater = (key: keyof QuickSaleFormValues, value: string) => void;
export type PhotoSelectHandler = (event: ChangeEvent<HTMLInputElement>) => void;

const firstFilled = (...values: Array<string | null | undefined>): string =>
  values.find((value) => Boolean(value)) ?? "";

const getProfileContactName = (profile: QuickSaleProfile): string =>
  firstFilled(profile?.display_name, profile?.first_name);

const getProfilePhone = (profile: QuickSaleProfile): string => profile?.phone ?? "";

const getUserEmail = (userEmail: string | null | undefined): string => userEmail ?? "";

export const buildInitialForm = (profile: QuickSaleProfile, userEmail: string | null | undefined): QuickSaleFormValues => ({
  address: "",
  city: "",
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

export const syncContactFields = (
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

export const validateStep1Form = (form: QuickSaleFormValues, photoCount: number): QuickSaleErrors =>
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

export const validateStep2Form = (form: QuickSaleFormValues): QuickSaleErrors =>
  collectErrors([
    ["contactName", validateContactName(form.contactName)],
    ["contactEmail", validateContactEmail(form.contactEmail)],
    ["contactPhone", validateContactPhone(form.contactPhone)],
  ]);

export const getFirstError = (errors: QuickSaleErrors): string | null => Object.values(errors)[0] ?? null;

export const canSubmitQuickSaleRequest = (
  user: QuickSaleUser,
  profile: QuickSaleProfile,
  authPending: boolean,
): boolean => Boolean(user) && !authPending && profile != null && isSellerRole(profile);

const BASE_PRICE_PER_SQM: Record<string, number> = {
  villa: 3200,
  house: 2400,
  apartment: 2000,
  commercial: 2800,
  office: 2600,
  land: 900,
};

export const getLocalEstimate = (form: QuickSaleFormValues): number =>
  Math.round((BASE_PRICE_PER_SQM[form.propertyType] || 2000) * Number(form.sqm) * 0.92);

export const validateSubmissionForm = (form: QuickSaleFormValues, photoCount: number): QuickSaleErrors => ({
  ...validateStep1Form(form, photoCount),
  ...validateStep2Form(form),
});

export const getSubmitEstimate = (aiEstimate: number | null, form: QuickSaleFormValues): number =>
  aiEstimate ?? Math.round(Number(form.sqm) * 1900 * 0.92);

export const getPhotoGrade = (count: number): number => {
  if (count >= 8) return 9;
  if (count >= 5) return 7;
  if (count >= 3) return 5;
  return 3;
};

export const buildMetaLines = (form: QuickSaleFormValues, photoCount: number): string[] => {
  const metaLines: string[] = [];
  if (form.constructionYear.trim()) metaLines.push(`${ui("Construction year", "Έτος κατασκευής")}: ${form.constructionYear.trim()}`);
  if (photoCount > 0) metaLines.push(`${ui("Photo condition grade (1-10)", "Βαθμός κατάστασης φωτογραφιών (1-10)")}: ${getPhotoGrade(photoCount)}`);
  if (form.kaek.trim()) metaLines.push(`KAEK: ${normalizeKaek(form.kaek)}`);
  if (form.notes.trim()) metaLines.push(form.notes.trim());
  return metaLines;
};

export const getCityFromAddress = (address: string): string => address.split(",").pop()?.trim() || "";

export const getRequiredPropertyType = (propertyType: string): NonNullable<ReturnType<typeof toFiresalePropertyType>> => {
  const mappedPropertyType = toFiresalePropertyType(propertyType);
  if (!mappedPropertyType) throw new Error("Property type is invalid.");
  return mappedPropertyType;
};

export const getPhotoSelectionText = (count: number): string => `${count} photo${count !== 1 ? "s" : ""} selected`;
