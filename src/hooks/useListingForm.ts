/**
 * useListingForm — all form state, validation, AI helpers, image management
 * and submission logic for CreateListing.tsx.
 *
 * Extracted to keep the page component focused on rendering the wizard UI.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { UploadedImage } from "@/types";
import { useListingDraft } from "@/hooks/useListingDraft";
import { useListingAI } from "@/hooks/useListingAI";
import type { Database } from "@/integrations/supabase/types";
import type {
  PropertyType,
  ListingType,
  WizardStep,
  AIPriceSuggestion,
  ListingFormData,
} from "@/hooks/listingForm.types";
import { tFallback, tInterpolate } from "@/lib/i18nFallback";

// Re-export the types so existing callers (`import { type ListingFormData }
// from "@/hooks/useListingForm"`) keep working.
export type { PropertyType, ListingType, WizardStep, AIPriceSuggestion, ListingFormData };
type ListingInsert = Database["public"]["Tables"]["listings"]["Insert"];

/**
 * Set of keys on `ListingFormData` whose values are booleans — derived once
 * from `INITIAL_FORM` so `toggle()` never silently mutates a non-boolean
 * column (or, worse, creates a brand-new key that doesn't exist on the type).
 * Populated lazily below since INITIAL_FORM is declared just after this.
 */
let BOOLEAN_KEYS: Set<string> | null = null;

const INITIAL_FORM: ListingFormData = {
  listing_type: "sale",
  property_type: "apartment",
  title: "", description: "", sqm: "", year_built: "", energy_class: "",
  bedrooms: "", bathrooms: "", wc_count: "", kitchens: "", living_rooms: "",
  floor: "", total_floors: "", levels: "", heating_system: "", construction_status: "",
  commercial_subtype: "", plot_surface: "", floor_height: "",
  has_elevator: false, has_ac: false, has_solar_water: false, has_storage: false,
  has_secure_door: false, has_alarm: false, has_cctv: false, has_security: false,
  has_smart_home: false, has_fireplace: false, has_underfloor_heating: false,
  has_furnished: false, has_internal_staircase: false, has_double_glazing: false,
  has_window_screens: false, has_night_power: false, has_attic: false,
  has_satellite: false, has_painted: false,
  has_parking: false, has_balcony: false, has_garden: false, has_pool: false,
  has_view: false, has_facade: false, has_awning: false, has_disability_access: false,
  is_corner: false, is_penthouse: false, is_neoclassical: false, is_preserved: false,
  has_virtual_tour: false, has_video_tour: false,
  suitable_student: false, suitable_holiday: false, suitable_investment: false, suitable_commercial_use: false,
  has_three_phase_power: false, has_loading_dock: false, has_structured_cabling: false, has_equipped: false,
  is_pre_sale: false, is_off_market: false,
  is_buildable: false, within_city_plan: false, within_settlement: false,
  has_water_supply: false, has_electricity_supply: false, has_land_concession: false,
  coverage_ratio: "", building_allowance: "", facade_length: "", plot_depth: "",
  slope: "", zone_type: "", road_type: "", land_use: "",
  distance_from_sea: "", distance_from_city: "",
  address: "", city: "", region: "", postal_code: "",
  cadastre_number: "", enfia_zone: "",
  price: "", auction_starting_bid: "", auction_date: "", auction_court: "", open_house_date: "",
  deposit_months: "", monthly_expenses: "", agent_fee_included: false,
  pets_allowed: false, short_term_rental: false, available_from: "", min_rental_months: "",
  is_featured: false, priority_placement: 0, is_exclusive: false,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useListingForm(options?: { allowPreSale?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tr = useCallback((key: string, fallback: string) => tFallback(t, key, fallback), [t]);
  const trv = useCallback((key: string, fallback: string, values: Record<string, string | number>) => tInterpolate(t, key, fallback, values), [t]);

  // Form state
  const [form, setForm] = useState<ListingFormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  // Image state
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [coverImageId, setCoverImageId] = useState<string | null>(null);
  // Track every blob URL we hand out via URL.createObjectURL so we can
  // revoke them on unmount or replacement — leaking these on a long
  // listing-creation session leaks raw image bytes for the page lifetime.
  const blobUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = blobUrlsRef.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  // ── Sub-hooks ─────────────────────────────────────────────────────────────

  /** Mark a field as touched — triggers inline validation on the next change */
  const touch = useCallback((key: string) => {
    setTouched(t => t[key] ? t : { ...t, [key]: true });
  }, []);

  const set = useCallback((key: string, value: unknown) => {
    setForm(f => {
      const next = { ...f, [key]: value };
      // Inline validation once the field has been touched (on-blur)
      setTouched(t => {
        if (t[key]) {
          setErrors(e => {
            const inlineErrors: Record<string, string> = {};
            if (key === "title" && !(next.title as string).trim()) inlineErrors.title = tr("createListing.validation.titleRequired", "Title is required");
            if (key === "sqm" && !next.sqm) inlineErrors.sqm = tr("createListing.validation.areaRequired", "Property area (m²) is required");
            if (key === "city" && !(next.city as string).trim()) inlineErrors.city = tr("createListing.validation.cityRequired", "City is required");
            if (key === "price" && !next.price) inlineErrors.price = tr("createListing.validation.priceRequired", "Price is required");
            const n = { ...e }; delete n[key];
            return inlineErrors[key] ? { ...n, [key]: inlineErrors[key] } : n;
          });
        } else {
          setErrors(e => { if (!e[key]) return e; const n = { ...e }; delete n[key]; return n; });
        }
        return t;
      });
      return next;
    });
  }, [tr]);

  const toggle = useCallback((key: string) => {
    if (!BOOLEAN_KEYS) {
      BOOLEAN_KEYS = new Set(
        Object.entries(INITIAL_FORM)
          .filter(([, v]) => typeof v === "boolean")
          .map(([k]) => k),
      );
    }
    if (!BOOLEAN_KEYS.has(key)) {
      // Refuse to flip non-boolean (or unknown) columns. Catches typos in
      // call sites and blocks injection of attacker-controlled keys via UI
      // bindings.
      return;
    }
    setForm(f => ({ ...f, [key]: !(f as unknown as Record<string, boolean>)[key] }));
  }, []);

  const { draftBanner, setDraftBanner, checkDraft, handleSaveDraft, handleRestoreDraft, handleDiscardDraft } =
    useListingDraft(form, setForm);

  const { aiDescLoading, aiPriceLoading, aiPriceSuggestion, handleAiDescription, handleAiPrice } =
    useListingAI(form, set);

  // ── Image handling ────────────────────────────────────────────────────────

  const uploadImage = useCallback(async (file: File): Promise<UploadedImage> => {
    if (!user) throw new Error("Must be logged in");
    const { compressListingImage } = await import("@/lib/compressImage");
    const compressed = await compressListingImage(file);
    const ext = compressed.name.split(".").pop();
    const id = crypto.randomUUID();
    const path = `${user.id}/${id}.${ext}`;
    const { error } = await supabase.storage
      .from("listing-images")
      .upload(path, compressed, { upsert: true, contentType: compressed.type });
    if (error) throw error;
    const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
    return { id, url: data.publicUrl };
  }, [user]);

  const handleFilesSelected = useCallback(async (files: FileList | null) => {
    if (!files || !user) return;
    const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
    const all = Array.from(files).slice(0, 20 - images.length);
    const rejections = all.filter(f => f.size > MAX_FILE_BYTES).map(f => f.name);
    if (rejections.length) toast.error(trv(rejections.length === 1 ? "createListing.validation.fileTooLargeOne" : "createListing.validation.fileTooLargeOther", rejections.length === 1 ? "{{files}} exceeds the 10 MB limit" : "{{files}} exceed the 10 MB limit", { files: rejections.join(", ") }));
    const newFiles = all.filter(f => f.size <= MAX_FILE_BYTES);
    if (newFiles.length === 0) return;

    const placeholders: UploadedImage[] = newFiles.map(file => {
      const url = URL.createObjectURL(file);
      blobUrlsRef.current.add(url);
      return {
        id: `placeholder-${crypto.randomUUID()}`,
        url,
        file,
        uploading: true,
      };
    });
    setImages(prev => [...prev, ...placeholders]);

    for (let i = 0; i < newFiles.length; i++) {
      const placeholder = placeholders[i];
      try {
        const uploaded = await uploadImage(newFiles[i]);
        // Successful upload — the placeholder blob URL is no longer needed.
        URL.revokeObjectURL(placeholder.url);
        blobUrlsRef.current.delete(placeholder.url);
        setImages(prev => prev.map(img =>
          img.id === placeholder.id ? { ...uploaded, uploading: false } : img
        ));
        if (i === 0) setCoverImageId(prev => prev ?? uploaded.id);
      } catch (err: unknown) {
        setImages(prev => prev.map(img =>
          img.id === placeholder.id
            ? { ...img, uploading: false, error: err instanceof Error ? err.message : tr("createListing.validation.uploadFailed", "Upload failed") }
            : img
        ));
        toast.error(trv("createListing.validation.failedToUpload", "Failed to upload {{file}}", { file: newFiles[i].name }));
      }
    }
  }, [user, images.length, uploadImage, tr, trv]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFilesSelected(e.dataTransfer.files);
  }, [handleFilesSelected]);

  const handleReorder = useCallback((fromIdx: number, toIdx: number) => {
    setImages(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  const handleRemove = useCallback((id: string) => {
    setImages(prev => {
      const removed = prev.find(img => img.id === id);
      if (removed && id.startsWith("placeholder-") && removed.url.startsWith("blob:")) {
        URL.revokeObjectURL(removed.url);
        blobUrlsRef.current.delete(removed.url);
      }
      return prev.filter(img => img.id !== id);
    });
    setCoverImageId(prev => prev === id ? null : prev);
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────

  const validateStep = useCallback((s: WizardStep): Record<string, string> => {
    const newErrors: Record<string, string> = {};
    if (s === "details") {
      if (!form.title.trim()) newErrors.title = tr("createListing.validation.titleRequired", "Title is required");
      if (!form.sqm) newErrors.sqm = tr("createListing.validation.areaRequired", "Property area (m²) is required");
    }
    if (s === "location") {
      if (!form.city.trim()) newErrors.city = tr("createListing.validation.cityRequired", "City is required");
    }
    if (s === "pricing") {
      const lt = form.listing_type;
      if (!form.price) newErrors.price = lt === "rent" ? tr("createListing.validation.monthlyRentRequired", "Monthly rent is required") : tr("createListing.validation.askingPriceRequired", "Asking price is required");
      if (lt === "auction" && !form.auction_starting_bid) newErrors.auction_starting_bid = tr("createListing.validation.firstOfferRequired", "First offer price is required");
      if (lt === "open_house" && !form.open_house_date) newErrors.open_house_date = tr("createListing.validation.openHouseDateRequired", "Open house date & time is required");
    }
    return newErrors;
  }, [form, tr]);

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (asDraft = false) => {
    if (!form.title || !form.city || !form.price || !form.sqm) {
      toast.error(tr("createListing.validation.requiredFields", "Please fill in all required fields"));
      return;
    }
    if (Number(form.price) <= 0 || Number(form.sqm) <= 0) {
      toast.error(tr("createListing.validation.priceAreaPositive", "Price and area must be greater than zero"));
      return;
    }
    if (form.listing_type === "open_house" && !form.open_house_date) {
      toast.error(tr("createListing.validation.openHouseDateRequired", "Open house date & time is required"));
      return;
    }
    if (!user) {
      toast.error(tr("createListing.validation.signInRequired", "You must be signed in to publish a listing"));
      return;
    }
    setSubmitting(true);
    const pt = form.property_type;
    const lt = form.listing_type;
    const isResidential = ["apartment", "house", "villa"].includes(pt);
    const isLand = pt === "land";
    const isCommercial = ["commercial", "office"].includes(pt);
    try {
      const coverImg = images.find(img => img.id === coverImageId);
      const coverImageUrl = coverImg?.url || undefined;

      const payload: ListingInsert = {
        title: form.title,
        description: form.description || undefined,
        city: form.city,
        address: form.address || undefined,
        region: form.region || undefined,
        postal_code: form.postal_code || undefined,
        cadastre_number: form.cadastre_number || undefined,
        enfia_zone: form.enfia_zone || undefined,
        property_type: form.property_type,
        listing_type: form.listing_type,
        price: Number(form.price),
        sqm: Number(form.sqm),
        year_built: form.year_built ? Number(form.year_built) : undefined,
        energy_class: form.energy_class || undefined,
        heating_system: form.heating_system || undefined,
        construction_status: form.construction_status || undefined,
        cover_image_url: coverImageUrl,
        price_per_sqm: form.price && form.sqm ? Math.round(Number(form.price) / Number(form.sqm)) : undefined,
        ...(isResidential && {
          bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
          bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
          wc_count: form.wc_count ? Number(form.wc_count) : undefined,
          kitchens: form.kitchens ? Number(form.kitchens) : undefined,
          living_rooms: form.living_rooms ? Number(form.living_rooms) : undefined,
          floor: form.floor ? Number(form.floor) : undefined,
          total_floors: form.total_floors ? Number(form.total_floors) : undefined,
          levels: form.levels ? Number(form.levels) : undefined,
        }),
        ...(isCommercial && {
          commercial_subtype: form.commercial_subtype || undefined,
          plot_surface: form.plot_surface ? Number(form.plot_surface) : undefined,
          floor_height: form.floor_height ? Number(form.floor_height) : undefined,
          floor: form.floor ? Number(form.floor) : undefined,
          total_floors: form.total_floors ? Number(form.total_floors) : undefined,
          wc_count: form.wc_count ? Number(form.wc_count) : undefined,
        }),
        ...(isLand && {
          coverage_ratio: form.coverage_ratio ? Number(form.coverage_ratio) : undefined,
          building_allowance: form.building_allowance ? Number(form.building_allowance) : undefined,
          facade_length: form.facade_length ? Number(form.facade_length) : undefined,
          plot_depth: form.plot_depth ? Number(form.plot_depth) : undefined,
          slope: form.slope || undefined,
          zone_type: form.zone_type || undefined,
          road_type: form.road_type || undefined,
          land_use: form.land_use || undefined,
          distance_from_sea: form.distance_from_sea ? Number(form.distance_from_sea) : undefined,
          distance_from_city: form.distance_from_city ? Number(form.distance_from_city) : undefined,
        }),
        ...(lt === "rent" && {
          deposit_months: form.deposit_months ? Number(form.deposit_months) : undefined,
          monthly_expenses: form.monthly_expenses ? Number(form.monthly_expenses) : undefined,
          agent_fee_included: form.agent_fee_included,
          pets_allowed: form.pets_allowed,
          short_term_rental: form.short_term_rental,
          available_from: form.available_from || undefined,
          min_rental_months: form.min_rental_months ? Number(form.min_rental_months) : undefined,
        }),
        ...(lt === "auction" && {
          auction_starting_bid: form.auction_starting_bid ? Number(form.auction_starting_bid) : undefined,
          auction_date: form.auction_date || undefined,
          auction_court: form.auction_court || undefined,
        }),
        ...(lt === "open_house" && {
          open_house_date: form.open_house_date ? new Date(form.open_house_date).toISOString() : undefined,
        }),
        has_elevator: form.has_elevator, has_ac: form.has_ac, has_solar_water: form.has_solar_water,
        has_storage: form.has_storage, has_secure_door: form.has_secure_door, has_alarm: form.has_alarm,
        has_cctv: form.has_cctv, has_security: form.has_security, has_smart_home: form.has_smart_home,
        has_fireplace: form.has_fireplace, has_underfloor_heating: form.has_underfloor_heating,
        has_furnished: form.has_furnished, has_internal_staircase: form.has_internal_staircase,
        has_double_glazing: form.has_double_glazing, has_window_screens: form.has_window_screens,
        has_night_power: form.has_night_power, has_attic: form.has_attic, has_satellite: form.has_satellite,
        has_painted: form.has_painted, has_parking: form.has_parking, has_balcony: form.has_balcony,
        has_garden: form.has_garden, has_pool: form.has_pool, has_view: form.has_view,
        has_facade: form.has_facade, has_awning: form.has_awning,
        has_disability_access: form.has_disability_access, is_corner: form.is_corner,
        is_penthouse: form.is_penthouse, is_neoclassical: form.is_neoclassical, is_preserved: form.is_preserved,
        has_virtual_tour: form.has_virtual_tour, has_video_tour: form.has_video_tour,
        suitable_student: form.suitable_student, suitable_holiday: form.suitable_holiday,
        suitable_investment: form.suitable_investment, suitable_commercial_use: form.suitable_commercial_use,
        is_buildable: form.is_buildable, within_city_plan: form.within_city_plan,
        is_pre_sale: options?.allowPreSale ? form.is_pre_sale : false, is_off_market: form.is_off_market,
        within_settlement: form.within_settlement, has_water_supply: form.has_water_supply,
        has_electricity_supply: form.has_electricity_supply, has_land_concession: form.has_land_concession,
        has_three_phase_power: form.has_three_phase_power, has_loading_dock: form.has_loading_dock,
        has_structured_cabling: form.has_structured_cabling, has_equipped: form.has_equipped,
        is_featured: form.is_featured ?? false,
        priority_placement: Number(form.priority_placement) || 0,
        tags: form.is_exclusive ? (["exclusive"] as string[]) : undefined,
        owner_id: user.id,
        status: asDraft ? "draft" : "active",
      };

      const { data, error } = await supabase
        .from("listings")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;

      const additionalImages = images.filter(img => img.url !== coverImageUrl && !img.uploading && !img.error);
      if (additionalImages.length > 0) {
        await supabase.from("listing_images").insert(
          additionalImages.map((img, idx) => ({
            listing_id: (data as { id: string }).id,
            url: img.url,
            sort_order: idx + 1,
          }))
        );
      }

      toast.success(asDraft ? tr("createListing.validation.savedDraft", "Listing saved as draft!") : tr("createListing.validation.published", "Listing published successfully!"));
      const detailRoute = lt === "open_house"
        ? `/open-house/${(data as { id: string }).id}`
        : options?.allowPreSale && form.is_pre_sale
        ? `/new-build/${(data as { id: string }).id}`
        : `/property/${(data as { id: string }).id}`;
      navigate(detailRoute);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : tr("createListing.validation.submissionFailed", "Submission failed"));
    } finally {
      setSubmitting(false);
    }
  }, [form, images, coverImageId, user, navigate, options?.allowPreSale, tr]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const completionPct = (() => {
    const checks = [
      true,
      !!(form.title && form.sqm),
      true,
      !!form.city,
      !!form.price,
      images.length > 0,
    ];
    const filled = checks.filter(Boolean).length;
    return Math.round((filled / checks.length) * 100);
  })();

  return {
    // State
    form, errors, setErrors, submitting, touched,
    draftBanner, setDraftBanner,
    aiDescLoading, aiPriceLoading, aiPriceSuggestion,
    images, coverImageId, setCoverImageId,
    // Helpers
    set, toggle, touch,
    // Draft
    checkDraft, handleSaveDraft, handleRestoreDraft, handleDiscardDraft,
    // Images
    handleFilesSelected, handleDrop, handleReorder, handleRemove,
    // AI
    handleAiDescription, handleAiPrice,
    // Validation + submit
    validateStep, handleSubmit,
    // Derived
    completionPct,
    pt: form.property_type,
    lt: form.listing_type,
  };
}
