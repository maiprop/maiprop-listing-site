import { useState, useCallback, useEffect } from "react";
import { useFormWizard } from "@/hooks/useFormWizard";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import {
  Building2, ChevronLeft, Loader2, Check, Image, LayoutGrid,
  FileText, Upload, Home, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { type ProjectMediaType } from "@/hooks/useProjectMedia";
import { toast } from "sonner";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
import { isPlatformAdmin } from "@/lib/authUtils";
import { useSubscription } from "@/hooks/useSubscription";
import { getPlanLimits } from "@/hooks/usePlanLimits";
import { useMyListings } from "@/hooks/useListings";
import { uploadListingImage } from "@/lib/buildingListingUploads";
import { useCreateBuildingListing } from "@/hooks/useCreateBuildingListing";
import {
  IMAGE_AND_VIDEO_MIME_TYPES,
  PDF_MIME_TYPES,
  assertAllowedUpload,
} from "@/lib/uploadValidation";
import { tFallback, tInterpolate } from "@/lib/i18nFallback";

const INPUT_CLS = "w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors";
const LABEL_CLS = "text-xs text-muted-foreground block mb-1.5 font-medium";

const KITCHEN_TYPES = ["open", "closed", "semi-open", "kitchenette", "none"];
const ENERGY_CLASSES = ["A+", "A", "B+", "B", "C", "D", "E", "F", "G", "Exempt"];
const MEDIA_TYPES: { value: ProjectMediaType; label: string }[] = [
  { value: "rendering", label: "Building renderings" },
  { value: "floor_plan", label: "Floor plans" },
  { value: "site_plan", label: "Site plan" },
  { value: "brochure_pdf", label: "Project brochure (PDF)" },
  { value: "drone", label: "Drone photos" },
  { value: "walkthrough", label: "3D walkthrough" },
  { value: "progress", label: "Construction progress" },
  { value: "video", label: "Video" },
];

type UploadedImage = { id: string; url: string; file?: File; uploading?: boolean; error?: string };

const WIZARD_STEPS = ["building", "unit", "media", "listing", "photos"] as const;
type WizardStep = typeof WIZARD_STEPS[number];

const STEPS = [
  { id: "building" as WizardStep, label: "Building", icon: Building2 },
  { id: "unit" as WizardStep, label: "Unit", icon: Home },
  { id: "media" as WizardStep, label: "Media", icon: LayoutGrid },
  { id: "listing" as WizardStep, label: "Listing", icon: FileText },
  { id: "photos" as WizardStep, label: "Photos", icon: Image },
];

export default function CreateNewBuildingListing() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const submitNewBuildingListing = useCreateBuildingListing();

  const participantType = getParticipantTypeFromProfile(profile);
  const canCreateListing = profile?.role === "developer" || isPlatformAdmin(profile);
  const { hasDeveloperPro } = useSubscription();
  const { data: myListings = [] } = useMyListings();
  const listingLimit = getPlanLimits(participantType, hasDeveloperPro ? "pro" : "free").listings;
  const tr = useCallback((key: string, fallback: string) => tFallback(t, key, fallback), [t]);
  const trv = useCallback((key: string, fallback: string, values: Record<string, string | number>) => tInterpolate(t, key, fallback, values), [t]);
  const stepLabel = (id: WizardStep, fallback: string) => tr(`newBuildingListing.steps.${id}`, fallback);
  const mediaLabel = (value: ProjectMediaType, fallback: string) => tr(`newBuildingListing.media.types.${value}`, fallback);
  const kitchenLabel = (value: string) => tr(`newBuildingListing.unit.kitchenTypes.${value}`, value);

  const { step, stepIndex, isFirst, isLast, goNext, goPrev, goTo } = useFormWizard({ steps: WIZARD_STEPS });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Step 1: Project
  const [project, setProject] = useState({
    name: "",
    building_permit_number: "",
    developer_company: "",
    architect_group: "",
    construction_company: "",
    description: "",
    address: "",
    city: "",
    municipality: "",
    area_description: "",
    permit_approval_date: "",
    construction_start_date: "",
    structural_completion_date: "",
    delivery_date: "",
    latitude: "" as string | number,
    longitude: "" as string | number,
  });

  // Step 2: Unit
  const [unit, setUnit] = useState({
    unit_id: "",
    floor: "",
    unit_number: "",
    internal_sqm: "",
    balcony_sqm: "",
    storage_sqm: "",
    parking_sqm: "",
    bedrooms: "",
    bathrooms: "",
    kitchen_type: "",
    living_rooms: "",
    price: "",
    vat_included: true,
    parking_price: "",
    storage_price: "",
    sea_view: false,
    city_view: false,
    mountain_view: false,
    energy_class: "",
    heating_system: "",
    cooling_system: "",
  });

  // Step 3: Project media (optional)
  const [projectMedia, setProjectMedia] = useState<Record<ProjectMediaType, File | null>>({
    rendering: null, floor_plan: null, site_plan: null, brochure_pdf: null,
    drone: null, walkthrough: null, progress: null, video: null,
  });

  // Step 4: Listing
  const [listing, setListing] = useState({
    title: "",
    description: "",
  });

  // Step 5: Photos
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [coverImageId, setCoverImageId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !profile || canCreateListing) return;
    toast.error(tr("newBuildingListing.guard.developersOnly", "New building listings are for developers only. Switch your account type in Settings."));
    navigate("/dashboard/settings", { replace: true });
  }, [user, profile, canCreateListing, navigate, tr]);

  const setProjectField = (key: string, value: string | number) =>
    setProject(p => ({ ...p, [key]: value }));
  const setUnitField = (key: string, value: string | number | boolean) =>
    setUnit(u => ({ ...u, [key]: value }));

  const handleListingImageUpload = useCallback(async (file: File): Promise<UploadedImage> => {
    if (!user) throw new Error(tr("newBuildingListing.validation.mustBeLoggedIn", "Must be logged in"));
    return uploadListingImage(file, user.id);
  }, [user, tr]);

  // Guard: listing count limit reached
  if (user && profile && canCreateListing && listingLimit !== null && myListings.length >= listingLimit) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold mb-2">{tr("newBuildingListing.limit.title", "Listing Limit Reached")}</h1>
            <p className="text-muted-foreground text-sm">
              {trv("newBuildingListing.limit.description", "You have reached the {{limit}}-listing limit on your current plan ({{plan}}). Upgrade to add more listings.", {
                limit: listingLimit,
                plan: hasDeveloperPro ? tr("newBuildingListing.plan.developerPro", "Developer Pro") : tr("newBuildingListing.plan.free", "Free"),
              })}
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button asChild>
              <Link to="/pricing">{tr("newBuildingListing.limit.upgradePlan", "Upgrade Plan")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">{tr("newBuildingListing.limit.backToDashboard", "Back to Dashboard")}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Guard: redirect users who can't create building listings (must be after all hooks)
  if (user && profile && !canCreateListing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">{tr("newBuildingListing.guard.redirecting", "Redirecting...")}</span>
        </div>
      </div>
    );
  }

  const handleListingFilesSelected = async (files: FileList | null) => {
    if (!files || !user) return;
    const newFiles = Array.from(files).slice(0, 20 - images.length);
    if (newFiles.length === 0) return;
    const placeholders: UploadedImage[] = newFiles.map(file => ({
      id: `placeholder-${crypto.randomUUID()}`,
      url: URL.createObjectURL(file),
      file,
      uploading: true,
    }));
    setImages(prev => [...prev, ...placeholders]);
    for (let i = 0; i < newFiles.length; i++) {
      const placeholder = placeholders[i];
      try {
        const uploaded = await handleListingImageUpload(newFiles[i]);
        setImages(prev => prev.map(img =>
          img.id === placeholder.id ? { ...uploaded, uploading: false } : img
        ));
        if (i === 0) setCoverImageId(prev => prev ?? uploaded.id);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : tr("newBuildingListing.validation.uploadFailed", "Upload failed");
        setImages(prev => prev.map(img =>
          img.id === placeholder.id ? { ...img, uploading: false, error: msg } : img
        ));
        toast.error(trv("newBuildingListing.validation.failedToUpload", "Failed to upload {{file}}: {{message}}", { file: newFiles[i].name, message: msg }));
      }
    }
  };

  const validateStep = (s: WizardStep): boolean => {
    const newErrors: Record<string, string> = {};
    if (s === "building") {
      if (!project.name.trim()) newErrors.project_name = tr("newBuildingListing.validation.projectNameRequired", "Project name is required");
      if (!project.building_permit_number.trim()) newErrors.building_permit = tr("newBuildingListing.validation.permitRequired", "Building permit number is required");
      if (!project.city.trim()) newErrors.project_city = tr("newBuildingListing.validation.cityRequired", "City is required");
    }
    if (s === "unit") {
      if (!unit.internal_sqm) newErrors.internal_sqm = tr("newBuildingListing.validation.internalSqmRequired", "Internal sqm is required");
      if (!unit.price) newErrors.price = tr("newBuildingListing.validation.priceRequired", "Price is required");
      if (!unit.bedrooms) newErrors.bedrooms = tr("newBuildingListing.validation.bedroomsRequired", "Bedrooms are required");
      if (!unit.bathrooms) newErrors.bathrooms = tr("newBuildingListing.validation.bathroomsRequired", "Bathrooms are required");
    }
    if (s === "listing") {
      if (!listing.title.trim()) newErrors.title = tr("newBuildingListing.validation.titleRequired", "Listing title is required");
    }
    if (s === "photos") {
      const validImages = images.filter(img => !img.uploading && !img.error);
      if (validImages.length === 0) newErrors.photos = tr("newBuildingListing.validation.photoRequired", "At least one photo is required");
      if (!coverImageId || !validImages.some(img => img.id === coverImageId)) newErrors.cover = tr("newBuildingListing.validation.coverRequired", "Set a cover photo");
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error(Object.values(newErrors)[0]);
      return false;
    }
    setErrors({});
    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) goNext();
  };

  const handleBack = () => goPrev();

  const handleSubmit = async () => {
    if (!user) return;
    if (!project.name || !project.building_permit_number || !project.city) {
      toast.error(tr("newBuildingListing.validation.projectFieldsRequired", "Fill in required project fields"));
      return;
    }
    if (!unit.internal_sqm || !unit.price || !unit.bedrooms || !unit.bathrooms) {
      toast.error(tr("newBuildingListing.validation.unitFieldsRequired", "Fill in required unit fields"));
      return;
    }
    const finalTitle = listing.title.trim() || `${project.name}${unit.unit_id ? ` - Unit ${unit.unit_id}` : ""}`.trim();
    if (!finalTitle) {
      toast.error(tr("newBuildingListing.validation.titleRequired", "Listing title is required"));
      return;
    }
    const validImages = images.filter(img => !img.uploading && !img.error);
    if (validImages.length === 0) {
      toast.error(tr("newBuildingListing.validation.photoRequired", "At least one photo is required"));
      return;
    }
    const coverImg = validImages.find(img => img.id === coverImageId);
    const coverImageUrl = coverImg?.url;
    if (!coverImageUrl) {
      toast.error(tr("newBuildingListing.validation.coverRequired", "Set a cover photo"));
      return;
    }
    const additionalImageUrls = validImages
      .filter(img => img.url !== coverImageUrl)
      .map(img => img.url);

    setSubmitting(true);
    try {
      const { listingId } = await submitNewBuildingListing({
        userId: user.id,
        project,
        unit,
        projectMedia,
        listing,
        finalTitle,
        coverImageUrl,
        additionalImageUrls,
      });
      toast.success(tr("newBuildingListing.validation.created", "New building listing created!"));
      navigate(`/new-build/${listingId}`);
    } catch (_err: unknown) {
      toast.error(tr("newBuildingListing.validation.createFailed", "Failed to create new building listing. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const completionPct = Math.round(
    (100 * STEPS.filter((_, i) => {
      if (i === 0) return !!(project.name && project.building_permit_number && project.city);
      if (i === 1) return !!(unit.internal_sqm && unit.price && unit.bedrooms && unit.bathrooms);
      if (i === 2) return true;
      if (i === 3) return !!listing.title.trim();
      if (i === 4) return images.some(img => !img.uploading && !img.error);
      return false;
    }).length) / STEPS.length
  );

  return (
    <div className="min-h-screen bg-background pb-bottom-nav lg:pb-0">
      <Navbar />
      <div className="pt-16">
        <div className="border-b border-border bg-card py-5">
          <div className="container">
            <div className="flex items-center justify-between mb-1">
              <h1 className="font-display text-2xl font-bold">{tr("newBuildingListing.title", "New Building Listing")}</h1>
              <span className="text-sm font-semibold tabular-nums text-primary">{completionPct}%</span>
            </div>
            <p className="text-muted-foreground text-xs mb-3">
              {trv("newBuildingListing.stepProgress", "Step {{current}} of {{total}} - {{label}}", {
                current: stepIndex + 1,
                total: STEPS.length,
                label: stepLabel(STEPS[stepIndex].id, STEPS[stepIndex].label),
              })}
            </p>
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${completionPct}%` }} />
            </div>
          </div>
        </div>

        <div className="container py-8 max-w-3xl">
          <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => stepIndex > i && goTo(s.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    step === s.id ? "bg-primary text-primary-foreground"
                      : stepIndex > i ? "bg-primary/20 text-primary cursor-pointer hover:bg-primary/30"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {stepIndex > i ? <Check className="w-3 h-3" /> : <s.icon className="w-3 h-3" />}
                  {stepLabel(s.id, s.label)}
                </button>
                {i < STEPS.length - 1 && <div className={`w-4 h-0.5 ${stepIndex > i ? "bg-primary" : "bg-border"}`} />}
              </div>
            ))}
          </div>

          <div className="glass-card rounded-2xl p-6 md:p-8">
            {/* Step 1: Building */}
            {step === "building" && (
              <div className="space-y-6">
                <h2 className="font-display text-xl font-semibold">{tr("newBuildingListing.building.heading", "Building & Project Details")}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className={LABEL_CLS}>{tr("newBuildingListing.building.projectName", "Project name")} *</label>
                    <input value={project.name} onChange={e => setProjectField("name", e.target.value)} placeholder={tr("newBuildingListing.building.projectNamePlaceholder", "e.g. Marina Heights")} className={INPUT_CLS} />
                    {errors.project_name && <p className="text-xs text-destructive mt-1">{errors.project_name}</p>}
                  </div>
                  <div>
                    <label className={LABEL_CLS}>{tr("newBuildingListing.building.permitNumber", "Building permit number")} *</label>
                    <input value={project.building_permit_number} onChange={e => setProjectField("building_permit_number", e.target.value)} placeholder={tr("newBuildingListing.building.permitPlaceholder", "e.g. 12345/2024")} className={INPUT_CLS} />
                    {errors.building_permit && <p className="text-xs text-destructive mt-1">{errors.building_permit}</p>}
                  </div>
                  <div>
                    <label className={LABEL_CLS}>{tr("newBuildingListing.building.city", "City")} *</label>
                    <input value={project.city} onChange={e => setProjectField("city", e.target.value)} placeholder={tr("newBuildingListing.building.cityPlaceholder", "e.g. Athens")} className={INPUT_CLS} />
                    {errors.project_city && <p className="text-xs text-destructive mt-1">{errors.project_city}</p>}
                  </div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.building.developerCompany", "Developer company")}</label><input value={project.developer_company} onChange={e => setProjectField("developer_company", e.target.value)} placeholder={tr("newBuildingListing.building.companyPlaceholder", "Company name")} className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.building.architectGroup", "Architect / group")}</label><input value={project.architect_group} onChange={e => setProjectField("architect_group", e.target.value)} placeholder={tr("newBuildingListing.building.architectPlaceholder", "Architect or group")} className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.building.constructionCompany", "Construction company")}</label><input value={project.construction_company} onChange={e => setProjectField("construction_company", e.target.value)} placeholder={tr("newBuildingListing.building.constructorPlaceholder", "Constructor")} className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.building.municipality", "Municipality")}</label><input value={project.municipality} onChange={e => setProjectField("municipality", e.target.value)} placeholder={tr("newBuildingListing.building.municipalityPlaceholder", "Δήμος")} className={INPUT_CLS} /></div>
                  <div className="sm:col-span-2"><label className={LABEL_CLS}>{tr("newBuildingListing.building.address", "Address")}</label><input value={project.address} onChange={e => setProjectField("address", e.target.value)} placeholder={tr("newBuildingListing.building.addressPlaceholder", "Street, number")} className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.building.latitude", "Latitude")}</label><input type="number" step="any" value={project.latitude} onChange={e => setProjectField("latitude", e.target.value)} placeholder="37.9838" className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.building.longitude", "Longitude")}</label><input type="number" step="any" value={project.longitude} onChange={e => setProjectField("longitude", e.target.value)} placeholder="23.7275" className={INPUT_CLS} /></div>
                  <div className="sm:col-span-2"><label className={LABEL_CLS}>{tr("newBuildingListing.building.projectDescription", "Project description")}</label><textarea value={project.description} onChange={e => setProjectField("description", e.target.value)} rows={4} placeholder={tr("newBuildingListing.building.descriptionPlaceholder", "Brief description...")} className={INPUT_CLS + " resize-none"} /></div>
                  <div className="sm:col-span-2"><label className={LABEL_CLS}>{tr("newBuildingListing.building.areaDescription", "Area description")}</label><textarea value={project.area_description} onChange={e => setProjectField("area_description", e.target.value)} rows={2} placeholder={tr("newBuildingListing.building.areaDescriptionPlaceholder", "Neighbourhood, amenities...")} className={INPUT_CLS + " resize-none"} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.building.permitApprovalDate", "Permit approval date")}</label><input type="date" value={project.permit_approval_date} onChange={e => setProjectField("permit_approval_date", e.target.value)} className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.building.constructionStart", "Construction start")}</label><input type="date" value={project.construction_start_date} onChange={e => setProjectField("construction_start_date", e.target.value)} className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.building.structuralCompletion", "Structural completion")}</label><input type="date" value={project.structural_completion_date} onChange={e => setProjectField("structural_completion_date", e.target.value)} className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.building.deliveryDate", "Delivery date")}</label><input type="date" value={project.delivery_date} onChange={e => setProjectField("delivery_date", e.target.value)} className={INPUT_CLS} /></div>
                </div>
              </div>
            )}

            {/* Step 2: Unit */}
            {step === "unit" && (
              <div className="space-y-6">
                <h2 className="font-display text-xl font-semibold">{tr("newBuildingListing.unit.heading", "Unit Details")}</h2>
                <p className="text-sm text-muted-foreground">{tr("newBuildingListing.unit.subtitle", "Details for the specific unit you are listing.")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.unitId", "Unit ID")}</label><input value={unit.unit_id} onChange={e => setUnitField("unit_id", e.target.value)} placeholder="A101" className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.floor", "Floor")}</label><input type="number" value={unit.floor} onChange={e => setUnitField("floor", e.target.value)} placeholder="1" className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.unitNumber", "Unit number")}</label><input value={unit.unit_number} onChange={e => setUnitField("unit_number", e.target.value)} placeholder="101" className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.internalSqm", "Internal sqm")} *</label><input type="number" step="0.01" value={unit.internal_sqm} onChange={e => setUnitField("internal_sqm", e.target.value)} placeholder="85" className={INPUT_CLS} />{errors.internal_sqm && <p className="text-xs text-destructive">{errors.internal_sqm}</p>}</div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.balconySqm", "Balcony sqm")}</label><input type="number" step="0.01" value={unit.balcony_sqm} onChange={e => setUnitField("balcony_sqm", e.target.value)} placeholder="12" className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.price", "Price (€)")} *</label><input type="number" value={unit.price} onChange={e => setUnitField("price", e.target.value)} placeholder="250000" className={INPUT_CLS} />{errors.price && <p className="text-xs text-destructive">{errors.price}</p>}</div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.bedrooms", "Bedrooms")} *</label><input type="number" value={unit.bedrooms} onChange={e => setUnitField("bedrooms", e.target.value)} placeholder="2" className={INPUT_CLS} />{errors.bedrooms && <p className="text-xs text-destructive">{errors.bedrooms}</p>}</div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.bathrooms", "Bathrooms")} *</label><input type="number" value={unit.bathrooms} onChange={e => setUnitField("bathrooms", e.target.value)} placeholder="2" className={INPUT_CLS} />{errors.bathrooms && <p className="text-xs text-destructive">{errors.bathrooms}</p>}</div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.livingRooms", "Living rooms")}</label><input type="number" value={unit.living_rooms} onChange={e => setUnitField("living_rooms", e.target.value)} placeholder="1" className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.storageSqm", "Storage sqm")}</label><input type="number" step="0.01" value={unit.storage_sqm} onChange={e => setUnitField("storage_sqm", e.target.value)} placeholder="0" className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.parkingSqm", "Parking sqm")}</label><input type="number" step="0.01" value={unit.parking_sqm} onChange={e => setUnitField("parking_sqm", e.target.value)} placeholder="0" className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.kitchenType", "Kitchen type")}</label><select value={unit.kitchen_type} onChange={e => setUnitField("kitchen_type", e.target.value)} className={INPUT_CLS}><option value="">—</option>{KITCHEN_TYPES.map(k => <option key={k} value={k}>{kitchenLabel(k)}</option>)}</select></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.energyClass", "Energy class")}</label><select value={unit.energy_class} onChange={e => setUnitField("energy_class", e.target.value)} className={INPUT_CLS}><option value="">—</option>{ENERGY_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.heating", "Heating")}</label><input value={unit.heating_system} onChange={e => setUnitField("heating_system", e.target.value)} placeholder={tr("newBuildingListing.unit.heatingPlaceholder", "e.g. heat pump")} className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.cooling", "Cooling")}</label><input value={unit.cooling_system} onChange={e => setUnitField("cooling_system", e.target.value)} placeholder={tr("newBuildingListing.unit.coolingPlaceholder", "e.g. AC")} className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.parkingPrice", "Parking price (€)")}</label><input type="number" value={unit.parking_price} onChange={e => setUnitField("parking_price", e.target.value)} placeholder="0" className={INPUT_CLS} /></div>
                  <div><label className={LABEL_CLS}>{tr("newBuildingListing.unit.storagePrice", "Storage price (€)")}</label><input type="number" value={unit.storage_price} onChange={e => setUnitField("storage_price", e.target.value)} placeholder="0" className={INPUT_CLS} /></div>
                  <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-4 pt-2">
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unit.sea_view} onChange={e => setUnitField("sea_view", e.target.checked)} /> {tr("newBuildingListing.unit.seaView", "Sea view")}</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unit.city_view} onChange={e => setUnitField("city_view", e.target.checked)} /> {tr("newBuildingListing.unit.cityView", "City view")}</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unit.mountain_view} onChange={e => setUnitField("mountain_view", e.target.checked)} /> {tr("newBuildingListing.unit.mountainView", "Mountain view")}</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unit.vat_included} onChange={e => setUnitField("vat_included", e.target.checked)} /> {tr("newBuildingListing.unit.vatIncluded", "VAT included")}</label>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Project Media (optional) */}
            {step === "media" && (
              <div className="space-y-6">
                <h2 className="font-display text-xl font-semibold">{tr("newBuildingListing.media.heading", "Project Media (Optional)")}</h2>
                <p className="text-sm text-muted-foreground">{tr("newBuildingListing.media.subtitle", "Upload renderings, floor plans, brochures, etc. You can add more later from the project page.")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {MEDIA_TYPES.map(({ value, label }) => (
                    <div key={value} className="space-y-1">
                      <label className={LABEL_CLS}>{mediaLabel(value, label)}</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept={value === "brochure_pdf" ? "application/pdf" : "image/*,video/*"}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            // Fail fast at selection rather than waiting until upload.
                            try {
                              const allowed = value === "brochure_pdf" ? PDF_MIME_TYPES : IMAGE_AND_VIDEO_MIME_TYPES;
                              assertAllowedUpload(f, allowed, {
                                label: value === "brochure_pdf" ? tr("newBuildingListing.media.pdfBrochure", "PDF brochure") : tr("newBuildingListing.media.mediaFile", "media file"),
                                maxBytes: 50 * 1024 * 1024,
                              });
                            } catch (err: unknown) {
                              toast.error(err instanceof Error ? err.message : tr("newBuildingListing.validation.unsupportedFile", "Unsupported file"));
                              e.target.value = "";
                              return;
                            }
                            setProjectMedia(p => ({ ...p, [value]: f }));
                          }}
                          className="text-sm"
                        />
                        {projectMedia[value] && (
                          <span className="text-xs text-muted-foreground truncate max-w-[120px]">{projectMedia[value]?.name}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4: Listing */}
            {step === "listing" && (
              <div className="space-y-6">
                <h2 className="font-display text-xl font-semibold">{tr("newBuildingListing.listing.heading", "Listing Info")}</h2>
                <p className="text-sm text-muted-foreground">{tr("newBuildingListing.listing.subtitle", "Title and description for the listing. A default title was suggested from your project and unit.")}</p>
                <div className="space-y-4">
                  <div>
                    <label className={LABEL_CLS}>{tr("newBuildingListing.listing.title", "Listing title")} *</label>
                    <input
                      value={listing.title || `${project.name}${unit.unit_id ? ` - Unit ${unit.unit_id}` : ""}`}
                      onChange={e => setListing(l => ({ ...l, title: e.target.value }))}
                      placeholder={tr("newBuildingListing.listing.titlePlaceholder", "e.g. Marina Heights - Unit A101")}
                      className={INPUT_CLS}
                    />
                    {errors.title && <p className="text-xs text-destructive mt-1">{errors.title}</p>}
                  </div>
                  <div>
                    <label className={LABEL_CLS}>{tr("newBuildingListing.listing.description", "Description")}</label>
                    <textarea
                      value={listing.description}
                      onChange={e => setListing(l => ({ ...l, description: e.target.value }))}
                      rows={6}
                      placeholder={tr("newBuildingListing.listing.descriptionPlaceholder", "Describe the unit, building amenities, finishes...")}
                      className={INPUT_CLS + " resize-none"}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Photos */}
            {step === "photos" && (
              <div className="space-y-6">
                <h2 className="font-display text-xl font-semibold">{tr("newBuildingListing.photos.heading", "Listing Photos")}</h2>
                <p className="text-sm text-muted-foreground">{tr("newBuildingListing.photos.subtitle", "Upload photos for your listing. Drag to reorder. Click \"Set as cover\" on the main photo.")}</p>
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleListingFilesSelected(e.dataTransfer.files); }}
                  className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => document.getElementById("nb-photo-input")?.click()}
                >
                  <input
                    id="nb-photo-input"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => handleListingFilesSelected(e.target.files)}
                  />
                  <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">{tr("newBuildingListing.photos.dropPrompt", "Drop photos or click to upload")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{tr("newBuildingListing.photos.fileHint", "JPG, PNG, WEBP - max 20")}</p>
                </div>
                {images.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {images.map(img => (
                      <div key={img.id} className="relative aspect-[4/3] rounded-lg overflow-hidden bg-secondary group">
                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                        {img.uploading && <div className="absolute inset-0 flex items-center justify-center bg-background/80"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}
                        {img.error && <div className="absolute inset-0 flex items-center justify-center bg-destructive/20 text-destructive text-xs p-1">{img.error}</div>}
                        {!img.uploading && !img.error && (
                          <button
                            type="button"
                            onClick={() => setCoverImageId(img.id)}
                            className={`absolute bottom-0 inset-x-0 py-1 text-xs font-medium ${coverImageId === img.id ? "bg-primary text-primary-foreground" : "bg-background/80 opacity-0 group-hover:opacity-100"} transition-opacity`}
                          >
                            {coverImageId === img.id ? tr("newBuildingListing.photos.cover", "Cover") : tr("newBuildingListing.photos.setAsCover", "Set as cover")}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {errors.photos && <p className="text-xs text-destructive">{errors.photos}</p>}
                {errors.cover && <p className="text-xs text-destructive">{errors.cover}</p>}
              </div>
            )}

            <div className="flex items-center justify-between gap-4 mt-8 pt-6 border-t border-border">
              <Button variant="outline" onClick={handleBack} disabled={isFirst} className="gap-2">
                <ChevronLeft className="w-4 h-4" /> {tr("newBuildingListing.actions.back", "Back")}
              </Button>
              {!isLast ? (
                <Button onClick={handleNext} className="gap-2 bg-gradient-primary border-0">
                  {tr("newBuildingListing.actions.next", "Next")} <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={submitting} className="gap-2 bg-gradient-primary border-0">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {submitting ? tr("newBuildingListing.actions.creating", "Creating...") : tr("newBuildingListing.actions.createListing", "Create Listing")}
                </Button>
              )}
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-4">
            <Link to="/listings/new" className="text-primary hover:underline">{tr("newBuildingListing.links.regularListing", "Create a regular listing")}</Link>
            {" · "}
            <Link to="/projects" className="text-primary hover:underline">{tr("newBuildingListing.links.myProjects", "My projects")}</Link>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
