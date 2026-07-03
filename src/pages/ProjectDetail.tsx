import { useState, useCallback, useEffect } from "react";
import { useModal } from "@/hooks/useModal";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Building2, ChevronLeft, Loader2, Save, MapPin, Calendar, Image, LayoutGrid,
  Trash2, Plus, Edit2, ChevronDown, ChevronUp, FileText, Upload,
  BarChart2, Users, DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useProject, useUpdateProject, useUpdateProjectListingCover } from "@/hooks/useProjects";
import {
  useProjectUnits, useCreateProjectUnit, useUpdateProjectUnit, useBulkUpdateProjectUnitPrices, useDeleteProjectUnit,
  type ProjectUnitInsert, type ProjectUnit,
} from "@/hooks/useProjectUnits";
import {
  useProjectMedia, useAddProjectMedia, useDeleteProjectMedia,
  type ProjectMediaType, type ProjectMedia,
} from "@/hooks/useProjectMedia";
import {
  useProjectLeads, useCreateProjectLead, useUpdateProjectLead, useDeleteProjectLead,
  type ProjectLeadInsert, type ProjectLead,
} from "@/hooks/useProjectLeads";
import { useProjectViews } from "@/hooks/useProjectViews";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LocationAutocompleteInput, type LocationAutocompleteSelection } from "@/components/location/LocationAutocompleteInput";
import {
  IMAGE_AND_VIDEO_MIME_TYPES,
  PDF_MIME_TYPES,
  assertAllowedUpload,
} from "@/lib/uploadValidation";
import { uploadListingImage } from "@/lib/buildingListingUploads";
import { tFallback, tInterpolate } from "@/lib/i18nFallback";
import { getListingDetailPath } from "@/lib/listingRoutes";
import { calculatePricePerSqm } from "@/lib/priceCalculations";

const INPUT_CLS = "w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors";
const LABEL_CLS = "text-xs text-muted-foreground block mb-1.5 font-medium";
const PROJECT_MEDIA_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

const MEDIA_TYPES: { value: ProjectMediaType; label: string; mandatory?: boolean }[] = [
  { value: "rendering", label: "Building renderings", mandatory: true },
  { value: "floor_plan", label: "Floor plans", mandatory: true },
  { value: "site_plan", label: "Site plan", mandatory: true },
  { value: "brochure_pdf", label: "Project brochure (PDF)", mandatory: true },
  { value: "drone", label: "Drone photos" },
  { value: "walkthrough", label: "3D walkthrough" },
  { value: "progress", label: "Construction progress" },
  { value: "video", label: "Video" },
];

const KITCHEN_TYPES = ["open", "closed", "semi-open", "kitchenette", "none"];
const ENERGY_CLASSES = ["A+", "A", "B+", "B", "C", "D", "E", "F", "G", "Exempt"];

const Section = ({ title, icon: Icon, children, defaultOpen = true }: { title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card rounded-xl border border-border overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/50 transition-colors">
        <span className="font-display font-semibold flex items-center gap-2"><Icon className="w-5 h-5 text-primary" /> {title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-5 pt-0 space-y-4">{children}</div>}
    </div>
  );
};

export default function ProjectDetail() { // skipcq: JS-R1005 - Project route coordinates details, media, units, leads, and owner controls.
  const { id } = useParams();
  const { t } = useTranslation();
  const tr = useCallback((key: string, fallback: string) => tFallback(t, key, fallback), [t]);
  const trv = useCallback(
    (key: string, fallback: string, values: Record<string, string | number>) => tInterpolate(t, key, fallback, values),
    [t],
  );
  const { user } = useAuth();
  const { data: project, isLoading } = useProject(id);
  const { data: units = [] } = useProjectUnits(id);
  const { data: media = [] } = useProjectMedia(id);
  const { data: leads = [] } = useProjectLeads(id);
  const { data: viewsData } = useProjectViews(id);
  const createLead = useCreateProjectLead();
  const updateLead = useUpdateProjectLead();
  const deleteLead = useDeleteProjectLead();
  const updateProject = useUpdateProject();
  const createUnit = useCreateProjectUnit();
  const updateUnit = useUpdateProjectUnit();
  const bulkUpdateUnitPrices = useBulkUpdateProjectUnitPrices();
  const deleteUnit = useDeleteProjectUnit();
  const addMedia = useAddProjectMedia();
  const deleteMedia = useDeleteProjectMedia();
  const updateProjectListingCover = useUpdateProjectListingCover();

  const [form, setForm] = useState<Record<string, string | number | boolean | null | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [coverUploadingListingId, setCoverUploadingListingId] = useState<string | null>(null);
  const modal = useModal<"unitForm" | "leadForm" | "bulkPrice">();
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [_editingLeadId, _setEditingLeadId] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState<Partial<ProjectLeadInsert>>({});
  const [bulkPricePct, setBulkPricePct] = useState("");
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState<string | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);

  useEffect(() => { // skipcq: JS-R1005 - Project form hydration mirrors many optional project fields.
    if (project) {
      setForm({
        name: project.name ?? undefined,
        description: project.description ?? undefined,
        building_permit_number: project.building_permit_number ?? undefined,
        developer_company: project.developer_company ?? undefined,
        architect_group: project.architect_group ?? undefined,
        construction_company: project.construction_company ?? undefined,
        address: project.address ?? undefined,
        city: project.city ?? undefined,
        municipality: project.municipality ?? undefined,
        latitude: project.latitude ?? undefined,
        longitude: project.longitude ?? undefined,
        area_description: project.area_description ?? undefined,
        permit_approval_date: project.permit_approval_date ?? undefined,
        construction_start_date: project.construction_start_date ?? undefined,
        structural_completion_date: project.structural_completion_date ?? undefined,
        delivery_date: project.delivery_date ?? undefined,
        status: project.status ?? undefined,
      });
    }
  }, [project]);

  const updateField = (key: string, value: string | number | null | undefined) => {
    setForm(f => ({ ...f, [key]: value }));
  };
  const updateLocationField = (key: "address" | "city" | "municipality", value: string) => {
    setForm(f => ({ ...f, [key]: value, latitude: null, longitude: null }));
  };
  const applyProjectLocationSelection = (selection: LocationAutocompleteSelection) => {
    const latitude = selection.latitude ? Number(selection.latitude) : undefined;
    const longitude = selection.longitude ? Number(selection.longitude) : undefined;
    setForm(f => ({
      ...f,
      address: selection.addressLine || f.address,
      city: selection.city || f.city,
      municipality: selection.municipality || selection.region || f.municipality,
      latitude: Number.isFinite(latitude) ? latitude : f.latitude,
      longitude: Number.isFinite(longitude) ? longitude : f.longitude,
    }));
  };

  const handleSaveProject = async () => { // skipcq: JS-R1005 - Save path normalizes optional project fields before mutation.
    if (!id) return;
    setSaving(true);
    const updates: Record<string, unknown> = {};
    const keys = ["name", "description", "building_permit_number", "developer_company", "architect_group", "construction_company", "address", "city", "municipality", "latitude", "longitude", "area_description", "permit_approval_date", "construction_start_date", "structural_completion_date", "delivery_date", "status"];
    keys.forEach(k => { if (form[k] !== undefined) updates[k] = form[k]; });
    if (typeof form.latitude === "string" && form.latitude) updates.latitude = parseFloat(form.latitude);
    if (typeof form.longitude === "string" && form.longitude) updates.longitude = parseFloat(form.longitude);
    updateProject.mutate({ id, updates }, { onSettled: () => setSaving(false) });
  };

  const uploadProjectMedia = useCallback(async (file: File, mediaType: ProjectMediaType): Promise<string> => { // skipcq: JS-R1005 - Upload path validates media type, storage path, and public URL together.
    if (!user || !id) throw new Error(tr("projects.detail.errors.notAuthenticated", "Not authenticated"));
    const allowed = mediaType === "brochure_pdf" ? PDF_MIME_TYPES : IMAGE_AND_VIDEO_MIME_TYPES;
    assertAllowedUpload(file, allowed, {
      label: mediaType === "brochure_pdf"
        ? tr("projects.detail.media.pdfBrochure", "PDF brochure")
        : tr("projects.detail.media.mediaFile", "media file"),
      maxBytes: PROJECT_MEDIA_UPLOAD_MAX_BYTES,
    });
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${id}/${mediaType}-${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("project-media").upload(path, file, { upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from("project-media").getPublicUrl(path);
    return data.publicUrl;
  }, [user, id, tr]);

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, mediaType: ProjectMediaType) => { // skipcq: JS-R1005 - Media input handler owns nullable file, upload, and toast fallback paths.
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      const url = await uploadProjectMedia(file, mediaType);
      addMedia.mutate({ project_id: id, url, media_type: mediaType });
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) || tr("projects.detail.errors.uploadFailed", "Upload failed"));
    }
    e.target.value = "";
  };

  const handlePublicAdCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>, listingId: string) => {
    const file = e.target.files?.[0];
    if (!file || !user || !id) return;
    setCoverUploadingListingId(listingId);
    try {
      const uploaded = await uploadListingImage(file, user.id);
      updateProjectListingCover.mutate(
        { projectId: id, listingId, coverImageUrl: uploaded.url },
        { onSettled: () => setCoverUploadingListingId(null) },
      );
    } catch (err: unknown) {
      setCoverUploadingListingId(null);
      toast.error((err instanceof Error ? err.message : null) || tr("projects.detail.errors.coverUploadFailed", "Failed to update cover image"));
    } finally {
      e.target.value = "";
    }
  };

  const handleAddUnit = (u: Partial<ProjectUnitInsert>) => {
    if (!id) return;
    const payload = { ...u, project_id: id } as ProjectUnitInsert;
    const pricePerSqm = calculatePricePerSqm({ price: payload.price, sqm: payload.internal_sqm });
    if (pricePerSqm != null) payload.price_per_sqm = pricePerSqm;
    createUnit.mutate(payload, {
      onSuccess: () => modal.close(),
    });
  };

  const handleUpdateUnit = (unitId: string, updates: Partial<ProjectUnitInsert>) => {
    if (!id) return;
    const pricePerSqm = calculatePricePerSqm({ price: updates.price, sqm: updates.internal_sqm });
    const normalizedUpdates = pricePerSqm != null ? { ...updates, price_per_sqm: pricePerSqm } : updates;
    updateUnit.mutate({ id: unitId, projectId: id, updates: normalizedUpdates }, { onSuccess: () => setEditingUnitId(null) });
  };

  const handleDeleteUnit = (unitId: string) => {
    setUnitToDelete(unitId);
  };

  const handleAddLead = () => {
    if (!id || !leadForm.name?.trim()) return;
    createLead.mutate({ ...leadForm, project_id: id, name: leadForm.name.trim() } as ProjectLeadInsert, {
      onSuccess: () => { setLeadForm({}); modal.close(); },
    });
  };

  const handleUpdateLead = (leadId: string, updates: Partial<ProjectLeadInsert>) => {
    if (!id) return;
    updateLead.mutate({ id: leadId, projectId: id, updates });
  };

  const handleBulkPriceUpdate = () => { // skipcq: JS-R1005 - Bulk price update validates inputs and applies filtered unit mutations.
    if (!id || !bulkPricePct) return;
    const pct = parseFloat(bulkPricePct);
    if (isNaN(pct) || pct === 0) return;
     
    const available = units.filter((u: ProjectUnit) => u.availability_status === "available" && u.price);
    if (available.length === 0) { toast.error(tr("projects.detail.errors.noPricedUnits", "No available units with price to update")); return; }
    setBulkConfirmOpen(true);
  };

  const executeBulkPriceUpdate = () => {
    setBulkConfirmOpen(false);
    if (!id) return;
    const pct = parseFloat(bulkPricePct);
    if (!Number.isFinite(pct) || pct === 0) {
      toast.error(tr("projects.detail.errors.nonZeroPercentage", "Enter a non-zero percentage change."));
      return;
    }
     
    const availableUnits = units.filter((u: ProjectUnit) => u.availability_status === "available" && u.price != null);
    if (availableUnits.length === 0) {
      toast.error(tr("projects.detail.errors.noAvailableUnits", "No available units to update."));
      return;
    }
    bulkUpdateUnitPrices.mutate(
      { projectId: id, units: availableUnits, percentage: pct },
      {
        onSuccess: ({ updatedCount }) => {
          modal.close();
          setBulkPricePct("");
          toast.success(trv("projects.detail.toasts.updatedUnits", "Updated {{count}} unit(s)", { count: updatedCount }));
        },
      }
    );
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8 pt-24">
          <div className="text-center">
            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="font-display text-xl font-semibold">{tr("projects.auth.title", "Sign in to manage projects")}</h1>
            <Button className="mt-4" asChild><Link to="/login">{tr("projects.auth.signIn", "Sign in")}</Link></Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isLoading || !project) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  // Initialize form from project on first render
  const currentForm = Object.keys(form).length ? form : {
    name: project.name, description: project.description, building_permit_number: project.building_permit_number,
    developer_company: project.developer_company, architect_group: project.architect_group, construction_company: project.construction_company,
    address: project.address, city: project.city, municipality: project.municipality, latitude: project.latitude, longitude: project.longitude,
    area_description: project.area_description, permit_approval_date: project.permit_approval_date, construction_start_date: project.construction_start_date,
    structural_completion_date: project.structural_completion_date, delivery_date: project.delivery_date, status: project.status,
  };

  const listings: Array<{ id: string; title?: string | null; sqm?: number | null; price?: number | null; cover_image_url?: string | null; listing_type?: string | null; views_count?: number }> = Array.isArray((project as unknown as Record<string, unknown>).listings) ? (project as unknown as { listings: Array<{ id: string; title?: string | null; sqm?: number | null; price?: number | null; cover_image_url?: string | null; listing_type?: string | null; views_count?: number }> }).listings : [];
  const availableCount = units.filter((u) => u.availability_status === "available").length;
  const reservedCount = units.filter((u) => u.availability_status === "reserved").length;
  const soldCount = units.filter((u) => u.availability_status === "sold").length;
  const totalViews = (listings.reduce((s: number, l) => s + (l.views_count || 0), 0)) + (viewsData?.count ?? 0);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container max-w-4xl mx-auto px-4 pt-16 pb-16">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild><Link to="/projects"><ChevronLeft className="w-4 h-4" /></Link></Button>
            <div>
              <h1 className="font-display text-2xl font-bold">{project.name || tr("projects.detail.fallbackProject", "Project")}</h1>
              <p className="text-sm text-muted-foreground">{tr("projects.detail.subtitle", "Edit project details, units, and media")}</p>
            </div>
          </div>
          <Button onClick={handleSaveProject} disabled={saving} className="bg-gradient-primary border-0 text-primary-foreground gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {tr("projects.detail.actions.save", "Save")}
          </Button>
        </div>

        <div className="space-y-6">
          {/* 0. Developer dashboard: sales tracking & analytics */}
          <Section title={tr("projects.detail.sections.dashboard", "Dashboard")} icon={BarChart2} defaultOpen={true}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="glass-card rounded-xl p-4 border border-border">
                <span className="text-xs text-muted-foreground block">{tr("projects.detail.stats.available", "Available")}</span>
                <span className="font-display text-2xl font-bold text-primary">{availableCount}</span>
              </div>
              <div className="glass-card rounded-xl p-4 border border-border">
                <span className="text-xs text-muted-foreground block">{tr("projects.detail.stats.reserved", "Reserved")}</span>
                <span className="font-display text-2xl font-bold text-brand-gold">{reservedCount}</span>
              </div>
              <div className="glass-card rounded-xl p-4 border border-border">
                <span className="text-xs text-muted-foreground block">{tr("projects.detail.stats.sold", "Sold")}</span>
                <span className="font-display text-2xl font-bold text-brand-emerald">{soldCount}</span>
              </div>
              <div className="glass-card rounded-xl p-4 border border-border">
                <span className="text-xs text-muted-foreground block">{tr("projects.detail.stats.totalViews", "Total views")}</span>
                <span className="font-display text-2xl font-bold text-primary">{totalViews}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{tr("projects.detail.stats.caption", "Sales tracking and project analytics.")}</p>
          </Section>

          {/* 1. Basic project info */}
          <Section title={tr("projects.detail.sections.basicInfo", "Basic project info")} icon={FileText}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className={LABEL_CLS}>{tr("projects.detail.fields.projectName", "Project name *")}</label><input value={(currentForm.name as string) || ""} onChange={e => updateField("name", e.target.value)} placeholder={tr("projects.fields.namePlaceholder", "e.g. Marina Heights")} className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>{tr("projects.detail.fields.permitNumber", "Building permit number *")}</label><input value={(currentForm.building_permit_number as string) || ""} onChange={e => updateField("building_permit_number", e.target.value)} placeholder={tr("projects.fields.permitPlaceholder", "e.g. 12345/2024")} className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>{tr("projects.detail.fields.developerCompany", "Developer company")}</label><input value={(currentForm.developer_company as string) || ""} onChange={e => updateField("developer_company", e.target.value)} placeholder={tr("projects.detail.placeholders.companyName", "Company name")} className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>{tr("projects.detail.fields.architectGroup", "Architect / developer group")}</label><input value={(currentForm.architect_group as string) || ""} onChange={e => updateField("architect_group", e.target.value)} placeholder={tr("projects.detail.placeholders.architectGroup", "Architect or group")} className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>{tr("projects.detail.fields.constructionCompany", "Construction company")}</label><input value={(currentForm.construction_company as string) || ""} onChange={e => updateField("construction_company", e.target.value)} placeholder={tr("projects.detail.placeholders.constructor", "Constructor")} className={INPUT_CLS} /></div>
              <div className="sm:col-span-2"><label className={LABEL_CLS}>{tr("projects.fields.projectDescription", "Project description")}</label><textarea value={(currentForm.description as string) || ""} onChange={e => updateField("description", e.target.value)} rows={4} placeholder={tr("projects.detail.placeholders.projectDescription", "Brief description of the project...")} className={INPUT_CLS + " resize-none"} /></div>
            </div>
          </Section>

          {/* 2. Location */}
          <Section title={tr("projects.detail.sections.location", "Location")} icon={MapPin}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label htmlFor="project-edit-address" className={LABEL_CLS}>{tr("projects.fields.address", "Address")}</label><LocationAutocompleteInput id="project-edit-address" mode="address" value={(currentForm.address as string) || ""} onChange={(value) => updateLocationField("address", value)} onSuggestionSelect={applyProjectLocationSelection} placeholder={tr("projects.fields.addressPlaceholder", "Street, number")} inputClassName={INPUT_CLS} /></div>
              <div><label htmlFor="project-edit-city" className={LABEL_CLS}>{tr("projects.fields.city", "City")}</label><LocationAutocompleteInput id="project-edit-city" mode="city" value={(currentForm.city as string) || ""} onChange={(value) => updateLocationField("city", value)} onSuggestionSelect={(selection) => { const municipality = selection.municipality || selection.region; if (municipality) updateField("municipality", municipality); }} placeholder={tr("projects.fields.cityPlaceholder", "e.g. Athens")} inputClassName={INPUT_CLS} /></div>
              <div>
                <label htmlFor="project-edit-municipality" className={LABEL_CLS}>{tr("projects.detail.fields.municipality", "Municipality")}</label>
                <LocationAutocompleteInput
                  id="project-edit-municipality"
                  mode="city"
                  value={(currentForm.municipality as string) || ""}
                  onChange={(value) => updateLocationField("municipality", value)}
                  onSuggestionSelect={(selection) => updateField("municipality", selection.municipality || selection.region || selection.city || selection.value)}
                  placeholder={tr("projects.detail.placeholders.municipality", "Municipality")}
                  inputClassName={INPUT_CLS}
                />
              </div>
              <div><label className={LABEL_CLS}>{tr("projects.detail.fields.latitude", "Latitude")}</label><input type="number" step="any" value={(currentForm.latitude as number | null) ?? ""} onChange={e => updateField("latitude", e.target.value ? parseFloat(e.target.value) : null)} placeholder={tr("projects.detail.placeholders.latitude", "e.g. 37.9838")} className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>{tr("projects.detail.fields.longitude", "Longitude")}</label><input type="number" step="any" value={(currentForm.longitude as number | null) ?? ""} onChange={e => updateField("longitude", e.target.value ? parseFloat(e.target.value) : null)} placeholder={tr("projects.detail.placeholders.longitude", "e.g. 23.7275")} className={INPUT_CLS} /></div>
              <div className="sm:col-span-2"><label className={LABEL_CLS}>{tr("projects.detail.fields.areaDescription", "Area description")}</label><textarea value={(currentForm.area_description as string) || ""} onChange={e => updateField("area_description", e.target.value)} rows={2} placeholder={tr("projects.detail.placeholders.areaDescription", "Neighbourhood, amenities, surroundings...")} className={INPUT_CLS + " resize-none"} /></div>
            </div>
          </Section>

          {/* 3. Project timeline */}
          <Section title={tr("projects.detail.sections.timeline", "Project timeline")} icon={Calendar}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={LABEL_CLS}>{tr("projects.detail.fields.permitApprovalDate", "Permit approval date")}</label><input type="date" value={(currentForm.permit_approval_date as string) || ""} onChange={e => updateField("permit_approval_date", e.target.value)} className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>{tr("projects.detail.fields.constructionStart", "Construction start")}</label><input type="date" value={(currentForm.construction_start_date as string) || ""} onChange={e => updateField("construction_start_date", e.target.value)} className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>{tr("projects.detail.fields.structuralCompletion", "Structural completion")}</label><input type="date" value={(currentForm.structural_completion_date as string) || ""} onChange={e => updateField("structural_completion_date", e.target.value)} className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>{tr("projects.detail.fields.deliveryDate", "Delivery date")}</label><input type="date" value={(currentForm.delivery_date as string) || ""} onChange={e => updateField("delivery_date", e.target.value)} className={INPUT_CLS} /></div>
            </div>
          </Section>

          {/* 4. Media */}
          <Section title={tr("projects.detail.sections.media", "Media")} icon={Image}>
            <div className="space-y-4">
              {MEDIA_TYPES.map(({ value, label, mandatory }) => {
                const items = media.filter((m: ProjectMedia) => m.media_type === value);
                return (
                  <div key={value} className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium w-44">{tr(`projects.detail.media.types.${value}`, label)}{mandatory && " *"}</span>
                    <div className="flex flex-wrap gap-2">
                      {items.map((m: ProjectMedia) => (
                        <div key={m.id} className="flex items-center gap-1 bg-secondary rounded-lg px-2 py-1">
                          {m.media_type === "brochure_pdf" ? <FileText className="w-4 h-4" /> : <img src={m.url} alt="" className="w-10 h-10 rounded object-cover" />}
                          <button
                            type="button"
                            aria-label={trv("projects.detail.actions.deleteMedia", "Delete {{type}}", { type: tr(`projects.detail.media.types.${m.media_type}`, m.media_type.replace(/_/g, " ")) })}
                            onClick={() => {
                              if (!id) return;
                              deleteMedia.mutate({ id: m.id, projectId: id });
                            }}
                            className="p-1 rounded hover:bg-destructive/10 text-destructive"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <label className="cursor-pointer">
                        <input type="file" accept={value === "brochure_pdf" ? ".pdf" : "image/*,video/*"} className="hidden" onChange={e => handleMediaUpload(e, value)} />
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border text-xs font-medium hover:bg-secondary transition-colors"><Upload className="w-3.5 h-3.5" /> {tr("projects.detail.actions.add", "Add")}</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* 5. Units + bulk price update */}
          <Section title={tr("projects.detail.sections.units", "Units (inventory & pricing)")} icon={LayoutGrid}>
            <div className="flex flex-wrap gap-2 mb-4">
              <Button variant="outline" size="sm" className="border-border gap-1.5" onClick={() => modal.toggle("bulkPrice")}>
                <DollarSign className="w-3.5 h-3.5" /> {tr("projects.detail.actions.bulkPriceUpdate", "Bulk price update")}
              </Button>
              {modal.isOpen("bulkPrice") && (
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="number" step="0.1" placeholder={tr("projects.detail.placeholders.percentageIncrease", "e.g. 5 for +5%")} value={bulkPricePct} onChange={e => setBulkPricePct(e.target.value)} className="w-24 bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm" />
                  <span className="text-xs text-muted-foreground">{tr("projects.detail.labels.percentIncrease", "% increase")}</span>
                  <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground" onClick={handleBulkPriceUpdate}>{tr("projects.detail.actions.applyToAvailable", "Apply to available")}</Button>
                </div>
              )}
            </div>
            <div className="space-y-4">
              {units.map((u: ProjectUnit) => ( // skipcq: JS-R1005 - Unit row renders edit, delete, media, and status controls in one list branch.
                <div key={u.id} className="glass-card rounded-xl p-4 border border-border">
                  {editingUnitId === u.id ? (
                    <UnitEditForm unit={u} onSave={(updates) => handleUpdateUnit(u.id, updates)} onCancel={() => setEditingUnitId(null)} />
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <span className="font-semibold">{u.unit_id || u.unit_number || trv("projects.detail.labels.unitFallback", "Unit {{floor}}-{{unit}}", { floor: u.floor || "?", unit: u.unit_number || "?" })}</span>
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${u.availability_status === "sold" ? "bg-brand-emerald/20 text-brand-emerald" : u.availability_status === "reserved" ? "bg-brand-gold/20 text-brand-gold" : "bg-primary/10 text-primary"}`}>{tr(`projects.detail.status.${u.availability_status}`, u.availability_status)}</span>
                        {Boolean(u.price) && <span className="ml-2 text-sm text-muted-foreground">€{Number(u.price).toLocaleString()}</span>}
                        {Boolean(u.internal_sqm) && <span className="ml-2 text-xs text-muted-foreground">{u.internal_sqm}m²</span>}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" aria-label={tr("projects.detail.actions.editUnit", "Edit unit")} onClick={() => setEditingUnitId(u.id)}><Edit2 className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label={tr("projects.detail.actions.deleteUnit", "Delete unit")} className="text-destructive" onClick={() => handleDeleteUnit(u.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {modal.isOpen("unitForm") ? (
                <div className="glass-card rounded-xl p-4 border border-primary/20">
                  <UnitEditForm unit={null} onSave={handleAddUnit} onCancel={() => modal.close()} isCreate />
                </div>
              ) : (
                <Button variant="outline" className="border-border w-full gap-2" onClick={() => modal.open("unitForm")}><Plus className="w-4 h-4" /> {tr("projects.detail.actions.addUnit", "Add unit")}</Button>
              )}
            </div>
          </Section>

          {/* 6. Lead management */}
          <Section title={tr("projects.detail.sections.leads", "Lead management")} icon={Users}>
            <p className="text-sm text-muted-foreground mb-3">{tr("projects.detail.leads.caption", "Track and manage leads interested in this project.")}</p>
            {modal.isOpen("leadForm") ? (
              <div className="glass-card rounded-xl p-4 border border-primary/20 space-y-3 mb-4">
                <input placeholder={tr("projects.detail.leads.namePlaceholder", "Name *")} value={leadForm.name || ""} onChange={e => setLeadForm(f => ({ ...f, name: e.target.value }))} className={INPUT_CLS} />
                <input placeholder={tr("projects.detail.leads.emailPlaceholder", "Email")} value={leadForm.email || ""} onChange={e => setLeadForm(f => ({ ...f, email: e.target.value }))} className={INPUT_CLS} />
                <input placeholder={tr("projects.detail.leads.phonePlaceholder", "Phone")} value={leadForm.phone || ""} onChange={e => setLeadForm(f => ({ ...f, phone: e.target.value }))} className={INPUT_CLS} />
                <input placeholder={tr("projects.detail.leads.sourcePlaceholder", "Source")} value={leadForm.source || ""} onChange={e => setLeadForm(f => ({ ...f, source: e.target.value }))} className={INPUT_CLS} />
                <input placeholder={tr("projects.detail.leads.unitPlaceholder", "Unit of interest")} value={leadForm.unit_id || ""} onChange={e => setLeadForm(f => ({ ...f, unit_id: e.target.value }))} className={INPUT_CLS} />
                <textarea placeholder={tr("projects.detail.leads.notesPlaceholder", "Notes")} value={leadForm.notes || ""} onChange={e => setLeadForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={INPUT_CLS + " resize-none"} />
                <div className="flex gap-2">
                  <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground" onClick={handleAddLead}>{tr("projects.detail.actions.addLead", "Add lead")}</Button>
                  <Button size="sm" variant="outline" className="border-border" onClick={() => { modal.close(); setLeadForm({}); }}>{tr("projects.actions.cancel", "Cancel")}</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="border-border gap-1.5 mb-4" onClick={() => modal.open("leadForm")}><Plus className="w-3.5 h-3.5" /> {tr("projects.detail.actions.addLead", "Add lead")}</Button>
            )}
            <div className="space-y-2">
              {leads.map((l: ProjectLead) => (
                <div key={l.id} className="glass-card rounded-xl p-3 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-medium text-sm">{l.name}</span>
                    <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${l.status === "converted" ? "bg-brand-emerald/20 text-brand-emerald" : l.status === "lost" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>{tr(`projects.detail.leadStatus.${l.status}`, l.status)}</span>
                    {l.email && <p className="text-xs text-muted-foreground">{l.email}</p>}
                    {l.unit_id && <p className="text-xs text-muted-foreground">{trv("projects.detail.leads.unitLine", "Unit: {{unit}}", { unit: l.unit_id })}</p>}
                  </div>
                  <div className="flex gap-1">
                    <select value={l.status} onChange={e => handleUpdateLead(l.id, { status: e.target.value as ProjectLeadInsert["status"] })} className="text-xs bg-secondary border border-border rounded-lg px-2 py-1">
                      <option value="new">{tr("projects.detail.leadStatus.new", "New")}</option>
                      <option value="contacted">{tr("projects.detail.leadStatus.contacted", "Contacted")}</option>
                      <option value="qualified">{tr("projects.detail.leadStatus.qualified", "Qualified")}</option>
                      <option value="converted">{tr("projects.detail.leadStatus.converted", "Converted")}</option>
                      <option value="lost">{tr("projects.detail.leadStatus.lost", "Lost")}</option>
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={trv("projects.detail.actions.deleteLeadNamed", "Delete lead {{name}}", { name: l.name })}
                      className="text-destructive h-8 w-8"
                      onClick={() => setLeadToDelete(l.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {leads.length === 0 && !modal.isOpen("leadForm") && <p className="text-sm text-muted-foreground">{tr("projects.detail.leads.empty", "No leads yet.")}</p>}
            </div>
          </Section>

          {/* 7. Public ad */}
          <Section title={tr("projects.detail.sections.publicAd", "Public New Build ad")} icon={Building2}>
            <p className="text-sm text-muted-foreground mb-3">{tr("projects.detail.publicAd.caption", "The public ad for this project uses the project details, units, pricing, phases, and media managed here.")}</p>
            {listings.length > 0 && (
              <div className="space-y-2 mb-4">
                {listings.map((l) => (
                  <div key={l.id} className="flex flex-col gap-3 bg-secondary rounded-xl p-3 sm:flex-row sm:items-center">
                    {l.cover_image_url ? (
                      <img src={l.cover_image_url} alt="" className="h-16 w-full rounded-lg object-cover sm:h-12 sm:w-12" />
                    ) : (
                      <div className="flex h-16 w-full items-center justify-center rounded-lg bg-background text-muted-foreground sm:h-12 sm:w-12">
                        <Image className="h-5 w-5" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0"><Link to={getListingDetailPath(l)} className="font-medium hover:underline truncate block">{l.title}</Link><span className="text-xs text-muted-foreground">€{Number(l.price).toLocaleString()} · {l.sqm}m²</span></div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className={`inline-flex min-h-[36px] cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary ${coverUploadingListingId === l.id ? "pointer-events-none opacity-60" : ""}`}>
                        {coverUploadingListingId === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {coverUploadingListingId === l.id
                          ? tr("projects.detail.actions.uploadingCover", "Uploading...")
                          : tr("projects.detail.actions.replaceCover", "Replace cover")}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          aria-label={tr("projects.detail.actions.replacePublicAdCover", "Replace public ad cover image")}
                          className="sr-only"
                          disabled={coverUploadingListingId === l.id}
                          onChange={(e) => handlePublicAdCoverUpload(e, l.id)}
                        />
                      </label>
                      <Button variant="outline" size="sm" className="border-border" asChild>
                        <Link to={getListingDetailPath(l)}>{tr("projects.detail.actions.viewPublicAd", "View ad")}</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {listings.length === 0 && (
              <p className="text-sm text-muted-foreground">{tr("projects.detail.publicAd.empty", "No public ad has been published for this project yet.")}</p>
            )}
          </Section>
        </div>
      </main>
      <Footer />
      <ConfirmDialog
        open={bulkConfirmOpen}
        title={tr("projects.detail.dialogs.bulkPrice.title", "Apply bulk price change")}
        description={trv("projects.detail.dialogs.bulkPrice.description", "Apply {{pct}}% price change to all available units? This cannot be undone.", { pct: bulkPricePct })}
        confirmLabel={tr("projects.detail.actions.apply", "Apply")}
        destructive={false}
        onConfirm={executeBulkPriceUpdate}
        onCancel={() => setBulkConfirmOpen(false)}
      />
      <ConfirmDialog
        open={Boolean(unitToDelete)}
        title={tr("projects.detail.dialogs.removeUnit.title", "Remove unit")}
        description={tr("projects.detail.dialogs.removeUnit.description", "Remove this unit from the project inventory?")}
        confirmLabel={tr("projects.detail.actions.remove", "Remove")}
        onConfirm={() => {
          if (id && unitToDelete) deleteUnit.mutate({ id: unitToDelete, projectId: id });
          setUnitToDelete(null);
        }}
        onCancel={() => setUnitToDelete(null)}
      />
      <ConfirmDialog
        open={Boolean(leadToDelete)}
        title={tr("projects.detail.dialogs.removeLead.title", "Remove lead")}
        description={tr("projects.detail.dialogs.removeLead.description", "Remove this lead from the project CRM?")}
        confirmLabel={tr("projects.detail.actions.remove", "Remove")}
        onConfirm={() => {
          if (id && leadToDelete) deleteLead.mutate({ id: leadToDelete, projectId: id });
          setLeadToDelete(null);
        }}
        onCancel={() => setLeadToDelete(null)}
      />
    </div>
  );
}

const UnitEditForm = ({ unit, onSave, onCancel, isCreate }: { unit?: ProjectUnit | null; onSave: (u: Partial<ProjectUnitInsert>) => void; onCancel: () => void; isCreate?: boolean }) => { // skipcq: JS-R1005 - UnitEditForm intentionally maps one dense project-unit schema into a single editor.
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => tFallback(t, key, fallback);
  const [f, setF] = useState({
    unit_id: unit?.unit_id || "",
    floor: unit?.floor ?? "",
    unit_number: unit?.unit_number || "",
    availability_status: unit?.availability_status || "available",
    internal_sqm: unit?.internal_sqm ?? "",
    balcony_sqm: unit?.balcony_sqm ?? "",
    storage_sqm: unit?.storage_sqm ?? "",
    parking_sqm: unit?.parking_sqm ?? "",
    bedrooms: unit?.bedrooms ?? "",
    bathrooms: unit?.bathrooms ?? "",
    kitchen_type: unit?.kitchen_type || "",
    living_rooms: unit?.living_rooms ?? "",
    price: unit?.price ?? "",
    vat_included: unit?.vat_included ?? true,
    parking_price: unit?.parking_price ?? "",
    storage_price: unit?.storage_price ?? "",
    sea_view: unit?.sea_view ?? false,
    city_view: unit?.city_view ?? false,
    mountain_view: unit?.mountain_view ?? false,
    energy_class: unit?.energy_class || "",
    heating_system: unit?.heating_system || "",
    cooling_system: unit?.cooling_system || "",
  });

  const submit = () => { // skipcq: JS-R1005 - Unit editor submit maps the dense unit form into typed insert fields.
    const u: Partial<ProjectUnitInsert> = {
      unit_id: f.unit_id || undefined,
      floor: f.floor ? parseInt(String(f.floor)) : undefined,
      unit_number: f.unit_number || undefined,
      availability_status: f.availability_status as ProjectUnitInsert["availability_status"],
      internal_sqm: f.internal_sqm ? parseFloat(String(f.internal_sqm)) : undefined,
      balcony_sqm: f.balcony_sqm ? parseFloat(String(f.balcony_sqm)) : undefined,
      storage_sqm: f.storage_sqm ? parseFloat(String(f.storage_sqm)) : undefined,
      parking_sqm: f.parking_sqm ? parseFloat(String(f.parking_sqm)) : undefined,
      bedrooms: f.bedrooms ? parseInt(String(f.bedrooms)) : undefined,
      bathrooms: f.bathrooms ? parseInt(String(f.bathrooms)) : undefined,
      kitchen_type: f.kitchen_type || undefined,
      living_rooms: f.living_rooms ? parseInt(String(f.living_rooms)) : undefined,
      price: f.price ? parseFloat(String(f.price)) : undefined,
      vat_included: f.vat_included,
      parking_price: f.parking_price ? parseFloat(String(f.parking_price)) : undefined,
      storage_price: f.storage_price ? parseFloat(String(f.storage_price)) : undefined,
      sea_view: f.sea_view,
      city_view: f.city_view,
      mountain_view: f.mountain_view,
      energy_class: f.energy_class || undefined,
      heating_system: f.heating_system || undefined,
      cooling_system: f.cooling_system || undefined,
    };
    onSave(u);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div><label className={LABEL_CLS}>{tr("projects.detail.unitForm.unitId", "Unit ID")}</label><input value={f.unit_id} onChange={e => setF(x => ({ ...x, unit_id: e.target.value }))} placeholder="A101" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>{tr("projects.detail.unitForm.floor", "Floor")}</label><input type="number" value={f.floor} onChange={e => setF(x => ({ ...x, floor: e.target.value }))} placeholder="1" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>{tr("projects.detail.unitForm.unitNumber", "Unit number")}</label><input value={f.unit_number} onChange={e => setF(x => ({ ...x, unit_number: e.target.value }))} placeholder="101" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>{tr("projects.detail.unitForm.status", "Status")}</label><select value={f.availability_status} onChange={e => setF(x => ({ ...x, availability_status: e.target.value }))} className={INPUT_CLS}><option value="available">{tr("projects.detail.status.available", "Available")}</option><option value="reserved">{tr("projects.detail.status.reserved", "Reserved")}</option><option value="sold">{tr("projects.detail.status.sold", "Sold")}</option></select></div>
      <div><label className={LABEL_CLS}>{tr("projects.detail.unitForm.internalSqm", "Internal sqm")}</label><input type="number" step="0.01" value={f.internal_sqm} onChange={e => setF(x => ({ ...x, internal_sqm: e.target.value }))} placeholder="85" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>{tr("projects.detail.unitForm.balconySqm", "Balcony sqm")}</label><input type="number" step="0.01" value={f.balcony_sqm} onChange={e => setF(x => ({ ...x, balcony_sqm: e.target.value }))} placeholder="12" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>{tr("projects.detail.unitForm.price", "Price (€)")}</label><input type="number" value={f.price} onChange={e => setF(x => ({ ...x, price: e.target.value }))} placeholder="250000" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>{tr("projects.detail.unitForm.bedrooms", "Bedrooms")}</label><input type="number" value={f.bedrooms} onChange={e => setF(x => ({ ...x, bedrooms: e.target.value }))} placeholder="2" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>{tr("projects.detail.unitForm.bathrooms", "Bathrooms")}</label><input type="number" value={f.bathrooms} onChange={e => setF(x => ({ ...x, bathrooms: e.target.value }))} placeholder="2" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>{tr("projects.detail.unitForm.kitchenType", "Kitchen type")}</label><select value={f.kitchen_type} onChange={e => setF(x => ({ ...x, kitchen_type: e.target.value }))} className={INPUT_CLS}><option value="">—</option>{KITCHEN_TYPES.map(k => <option key={k} value={k}>{tr(`projects.detail.kitchenTypes.${k}`, k)}</option>)}</select></div>
      <div><label className={LABEL_CLS}>{tr("projects.detail.unitForm.energyClass", "Energy class")}</label><select value={f.energy_class} onChange={e => setF(x => ({ ...x, energy_class: e.target.value }))} className={INPUT_CLS}><option value="">—</option>{ENERGY_CLASSES.map(c => <option key={c} value={c}>{tr(`projects.detail.energyClasses.${c}`, c)}</option>)}</select></div>
      <div className="sm:col-span-2 flex items-center gap-2 pt-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.sea_view} onChange={e => setF(x => ({ ...x, sea_view: e.target.checked }))} /> {tr("projects.detail.unitForm.seaView", "Sea view")}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.city_view} onChange={e => setF(x => ({ ...x, city_view: e.target.checked }))} /> {tr("projects.detail.unitForm.cityView", "City view")}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.mountain_view} onChange={e => setF(x => ({ ...x, mountain_view: e.target.checked }))} /> {tr("projects.detail.unitForm.mountainView", "Mountain view")}</label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground" onClick={submit}>{isCreate ? tr("projects.detail.actions.add", "Add") : tr("projects.detail.actions.save", "Save")}</Button>
        <Button size="sm" variant="outline" className="border-border" onClick={onCancel}>{tr("projects.actions.cancel", "Cancel")}</Button>
      </div>
    </div>
  );
};
