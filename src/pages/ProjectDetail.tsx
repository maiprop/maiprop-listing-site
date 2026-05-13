import { useState, useCallback, useEffect } from "react";
import { useModal } from "@/hooks/useModal";
import { Link, useParams } from "react-router-dom";
import {
  Building2, ChevronLeft, Loader2, Save, MapPin, Calendar, Image, LayoutGrid,
  Trash2, Plus, Edit2, ChevronDown, ChevronUp, FileText, Upload,
  BarChart2, Users, DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useQueryClient } from "@tanstack/react-query";
import { useProject, useUpdateProject } from "@/hooks/useProjects";
import {
  useProjectUnits, useCreateProjectUnit, useUpdateProjectUnit, useDeleteProjectUnit,
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
import { useMyListings, useUpdateListing } from "@/hooks/useListings";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const INPUT_CLS = "w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors";
const LABEL_CLS = "text-xs text-muted-foreground block mb-1.5 font-medium";

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

export default function ProjectDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const participantType = getParticipantTypeFromProfile(profile);
  const isDeveloper = participantType === "developer";
  const { data: project, isLoading } = useProject(id);
  const { data: units = [] } = useProjectUnits(id);
  const { data: media = [] } = useProjectMedia(id);
  const { data: leads = [] } = useProjectLeads(id);
  const { data: viewsData } = useProjectViews(id);
  const { data: myListings = [] } = useMyListings();
  const createLead = useCreateProjectLead();
  const updateLead = useUpdateProjectLead();
  const deleteLead = useDeleteProjectLead();
  const updateProject = useUpdateProject();
  const createUnit = useCreateProjectUnit();
  const updateUnit = useUpdateProjectUnit();
  const deleteUnit = useDeleteProjectUnit();
  const addMedia = useAddProjectMedia();
  const deleteMedia = useDeleteProjectMedia();
  const updateListing = useUpdateListing();

  const [form, setForm] = useState<Record<string, string | number | boolean | undefined>>({});
  const [saving, setSaving] = useState(false);
  const modal = useModal<"unitForm" | "leadForm" | "bulkPrice">();
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [_editingLeadId, _setEditingLeadId] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState<Partial<ProjectLeadInsert>>({});
  const [bulkPricePct, setBulkPricePct] = useState("");
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  useEffect(() => {
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

  const updateField = (key: string, value: string | number | undefined) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  const handleSaveProject = async () => {
    if (!id) return;
    setSaving(true);
    const updates: Record<string, unknown> = {};
    const keys = ["name", "description", "building_permit_number", "developer_company", "architect_group", "construction_company", "address", "city", "municipality", "latitude", "longitude", "area_description", "permit_approval_date", "construction_start_date", "structural_completion_date", "delivery_date", "status"];
    keys.forEach(k => { if (form[k] !== undefined) updates[k] = form[k]; });
    if (typeof form.latitude === "string" && form.latitude) updates.latitude = parseFloat(form.latitude);
    if (typeof form.longitude === "string" && form.longitude) updates.longitude = parseFloat(form.longitude);
    updateProject.mutate({ id, updates }, { onSettled: () => setSaving(false) });
  };

  const uploadProjectMedia = useCallback(async (file: File, mediaType: ProjectMediaType): Promise<string> => {
    if (!user || !id) throw new Error("Not authenticated");
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${id}/${mediaType}-${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("project-media").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("project-media").getPublicUrl(path);
    return data.publicUrl;
  }, [user, id]);

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, mediaType: ProjectMediaType) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      const url = await uploadProjectMedia(file, mediaType);
      addMedia.mutate({ project_id: id, url, media_type: mediaType });
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) || "Upload failed");
    }
    e.target.value = "";
  };

  const handleAddUnit = (u: Partial<ProjectUnitInsert>) => {
    if (!id) return;
    const payload = { ...u, project_id: id } as ProjectUnitInsert;
    if (payload.internal_sqm && payload.price) payload.price_per_sqm = Number(payload.price) / Number(payload.internal_sqm);
    createUnit.mutate(payload, {
      onSuccess: () => modal.close(),
    });
  };

  const handleUpdateUnit = (unitId: string, updates: Partial<ProjectUnitInsert>) => {
    if (!id) return;
    updateUnit.mutate({ id: unitId, projectId: id, updates }, { onSuccess: () => setEditingUnitId(null) });
  };

  const handleDeleteUnit = (unitId: string) => {
    if (!confirm("Remove this unit?")) return;
    deleteUnit.mutate({ id: unitId, projectId: id! });
  };

  const handleLinkListing = (listingId: string) => {
    updateListing.mutate({ id: listingId, updates: { project_id: id! } });
  };

  const handleUnlinkListing = (listingId: string) => {
    updateListing.mutate({ id: listingId, updates: { project_id: null } });
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

  const handleBulkPriceUpdate = () => {
    if (!id || !bulkPricePct) return;
    const pct = parseFloat(bulkPricePct);
    if (isNaN(pct) || pct === 0) return;
     
    const available = units.filter((u: ProjectUnit) => u.availability_status === "available" && u.price);
    if (available.length === 0) { toast.error("No available units with price to update"); return; }
    setBulkConfirmOpen(true);
  };

  const executeBulkPriceUpdate = async () => {
    setBulkConfirmOpen(false);
    if (!id) return;
    const pct = parseFloat(bulkPricePct);
     
    const availableUnits = units.filter((u: ProjectUnit) => u.availability_status === "available" && u.price);
    try {
      for (const u of availableUnits) {
        const newPrice = Math.round(Number(u.price) * (1 + pct / 100));
        const newPricePerSqm = u.internal_sqm ? newPrice / Number(u.internal_sqm) : undefined;
         
        const { error } = await supabase.from("project_units").update({ price: newPrice, price_per_sqm: newPricePerSqm }).eq("id", u.id);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["project_units", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      modal.close();
      setBulkPricePct("");
      toast.success(`Updated ${availableUnits.length} unit(s)`);
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : null) || "Update failed");
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8 pt-24">
          <div className="text-center">
            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="font-display text-xl font-semibold">Sign in to manage projects</h1>
            <Button className="mt-4" asChild><Link to="/login">Sign in</Link></Button>
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

  const listings: Array<{ id: string; views_count?: number }> = Array.isArray((project as unknown as Record<string, unknown>).listings) ? (project as unknown as { listings: Array<{ id: string; views_count?: number }> }).listings : [];
  const linkedListingIds = new Set(listings.map((l) => l.id));
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
              <h1 className="font-display text-2xl font-bold">{project.name || "Project"}</h1>
              <p className="text-sm text-muted-foreground">Edit project details, units, and media</p>
            </div>
          </div>
          <Button onClick={handleSaveProject} disabled={saving} className="bg-gradient-primary border-0 text-primary-foreground gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </Button>
        </div>

        <div className="space-y-6">
          {/* 0. Developer dashboard: sales tracking & analytics */}
          <Section title="Dashboard" icon={BarChart2} defaultOpen={true}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="glass-card rounded-xl p-4 border border-border">
                <span className="text-xs text-muted-foreground block">Available</span>
                <span className="font-display text-2xl font-bold text-primary">{availableCount}</span>
              </div>
              <div className="glass-card rounded-xl p-4 border border-border">
                <span className="text-xs text-muted-foreground block">Reserved</span>
                <span className="font-display text-2xl font-bold text-brand-gold">{reservedCount}</span>
              </div>
              <div className="glass-card rounded-xl p-4 border border-border">
                <span className="text-xs text-muted-foreground block">Sold</span>
                <span className="font-display text-2xl font-bold text-brand-emerald">{soldCount}</span>
              </div>
              <div className="glass-card rounded-xl p-4 border border-border">
                <span className="text-xs text-muted-foreground block">Total views</span>
                <span className="font-display text-2xl font-bold text-primary">{totalViews}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Sales tracking and project analytics.</p>
          </Section>

          {/* 1. Basic project info */}
          <Section title="Basic project info" icon={FileText}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className={LABEL_CLS}>Project name *</label><input value={(currentForm.name as string) || ""} onChange={e => updateField("name", e.target.value)} placeholder="e.g. Marina Heights" className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>Î‘ÏÎ¹Î¸Î¼ÏŒÏ‚ ÎŸÎ¹ÎºÎ¿Î´Î¿Î¼Î¹ÎºÎ®Ï‚ Î†Î´ÎµÎ¹Î±Ï‚ (Building permit number) *</label><input value={(currentForm.building_permit_number as string) || ""} onChange={e => updateField("building_permit_number", e.target.value)} placeholder="e.g. 12345/2024" className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>Developer company</label><input value={(currentForm.developer_company as string) || ""} onChange={e => updateField("developer_company", e.target.value)} placeholder="Company name" className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>Architect / developer group</label><input value={(currentForm.architect_group as string) || ""} onChange={e => updateField("architect_group", e.target.value)} placeholder="Architect or group" className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>Construction company</label><input value={(currentForm.construction_company as string) || ""} onChange={e => updateField("construction_company", e.target.value)} placeholder="Constructor" className={INPUT_CLS} /></div>
              <div className="sm:col-span-2"><label className={LABEL_CLS}>Project description</label><textarea value={(currentForm.description as string) || ""} onChange={e => updateField("description", e.target.value)} rows={4} placeholder="Brief description of the project..." className={INPUT_CLS + " resize-none"} /></div>
            </div>
          </Section>

          {/* 2. Location */}
          <Section title="Location" icon={MapPin}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className={LABEL_CLS}>Address</label><input value={(currentForm.address as string) || ""} onChange={e => updateField("address", e.target.value)} placeholder="Street, number" className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>City</label><input value={(currentForm.city as string) || ""} onChange={e => updateField("city", e.target.value)} placeholder="e.g. Athens" className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>Municipality</label><input value={(currentForm.municipality as string) || ""} onChange={e => updateField("municipality", e.target.value)} placeholder="Î”Î®Î¼Î¿Ï‚" className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>Latitude</label><input type="number" step="any" value={(currentForm.latitude as number) ?? ""} onChange={e => updateField("latitude", e.target.value ? parseFloat(e.target.value) : undefined)} placeholder="e.g. 37.9838" className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>Longitude</label><input type="number" step="any" value={(currentForm.longitude as number) ?? ""} onChange={e => updateField("longitude", e.target.value ? parseFloat(e.target.value) : undefined)} placeholder="e.g. 23.7275" className={INPUT_CLS} /></div>
              <div className="sm:col-span-2"><label className={LABEL_CLS}>Area description</label><textarea value={(currentForm.area_description as string) || ""} onChange={e => updateField("area_description", e.target.value)} rows={2} placeholder="Neighbourhood, amenities, surroundings..." className={INPUT_CLS + " resize-none"} /></div>
            </div>
          </Section>

          {/* 3. Project timeline */}
          <Section title="Project timeline" icon={Calendar}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={LABEL_CLS}>Permit approval date</label><input type="date" value={(currentForm.permit_approval_date as string) || ""} onChange={e => updateField("permit_approval_date", e.target.value)} className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>Construction start</label><input type="date" value={(currentForm.construction_start_date as string) || ""} onChange={e => updateField("construction_start_date", e.target.value)} className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>Structural completion</label><input type="date" value={(currentForm.structural_completion_date as string) || ""} onChange={e => updateField("structural_completion_date", e.target.value)} className={INPUT_CLS} /></div>
              <div><label className={LABEL_CLS}>Delivery date</label><input type="date" value={(currentForm.delivery_date as string) || ""} onChange={e => updateField("delivery_date", e.target.value)} className={INPUT_CLS} /></div>
            </div>
          </Section>

          {/* 4. Media */}
          <Section title="Media" icon={Image}>
            <div className="space-y-4">
              {MEDIA_TYPES.map(({ value, label, mandatory }) => {
                const items = media.filter((m: ProjectMedia) => m.media_type === value);
                return (
                  <div key={value} className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium w-44">{label}{mandatory && " *"}</span>
                    <div className="flex flex-wrap gap-2">
                      {items.map((m: ProjectMedia) => (
                        <div key={m.id} className="flex items-center gap-1 bg-secondary rounded-lg px-2 py-1">
                          {m.media_type === "brochure_pdf" ? <FileText className="w-4 h-4" /> : <img src={m.url} alt="" className="w-10 h-10 rounded object-cover" />}
                          <button type="button" onClick={() => deleteMedia.mutate({ id: m.id, projectId: id! })} className="p-1 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      ))}
                      <label className="cursor-pointer">
                        <input type="file" accept={value === "brochure_pdf" ? ".pdf" : "image/*,video/*"} className="hidden" onChange={e => handleMediaUpload(e, value)} />
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border text-xs font-medium hover:bg-secondary transition-colors"><Upload className="w-3.5 h-3.5" /> Add</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* 5. Units + bulk price update */}
          <Section title="Units (inventory & pricing)" icon={LayoutGrid}>
            <div className="flex flex-wrap gap-2 mb-4">
              <Button variant="outline" size="sm" className="border-border gap-1.5" onClick={() => modal.toggle("bulkPrice")}>
                <DollarSign className="w-3.5 h-3.5" /> Bulk price update
              </Button>
              {modal.isOpen("bulkPrice") && (
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="number" step="0.1" placeholder="e.g. 5 for +5%" value={bulkPricePct} onChange={e => setBulkPricePct(e.target.value)} className="w-24 bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm" />
                  <span className="text-xs text-muted-foreground">% increase</span>
                  <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground" onClick={handleBulkPriceUpdate}>Apply to available</Button>
                </div>
              )}
            </div>
            <div className="space-y-4">
              {units.map((u: ProjectUnit) => (
                <div key={u.id} className="glass-card rounded-xl p-4 border border-border">
                  {editingUnitId === u.id ? (
                    <UnitEditForm unit={u} onSave={(updates) => handleUpdateUnit(u.id, updates)} onCancel={() => setEditingUnitId(null)} />
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <span className="font-semibold">{u.unit_id || u.unit_number || `Unit ${u.floor || "?"}-${u.unit_number || "?"}`}</span>
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${u.availability_status === "sold" ? "bg-brand-emerald/20 text-brand-emerald" : u.availability_status === "reserved" ? "bg-brand-gold/20 text-brand-gold" : "bg-primary/10 text-primary"}`}>{u.availability_status}</span>
                        {Boolean(u.price) && <span className="ml-2 text-sm text-muted-foreground">€{Number(u.price).toLocaleString()}</span>}
                        {Boolean(u.internal_sqm) && <span className="ml-2 text-xs text-muted-foreground">{u.internal_sqm}m²</span>}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" aria-label="Edit unit" onClick={() => setEditingUnitId(u.id)}><Edit2 className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label="Delete unit" className="text-destructive" onClick={() => handleDeleteUnit(u.id)}><Trash2 className="w-4 h-4" /></Button>
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
                <Button variant="outline" className="border-border w-full gap-2" onClick={() => modal.open("unitForm")}><Plus className="w-4 h-4" /> Add unit</Button>
              )}
            </div>
          </Section>

          {/* 6. Lead management */}
          <Section title="Lead management" icon={Users}>
            <p className="text-sm text-muted-foreground mb-3">Track and manage leads interested in this project.</p>
            {modal.isOpen("leadForm") ? (
              <div className="glass-card rounded-xl p-4 border border-primary/20 space-y-3 mb-4">
                <input placeholder="Name *" value={leadForm.name || ""} onChange={e => setLeadForm(f => ({ ...f, name: e.target.value }))} className={INPUT_CLS} />
                <input placeholder="Email" value={leadForm.email || ""} onChange={e => setLeadForm(f => ({ ...f, email: e.target.value }))} className={INPUT_CLS} />
                <input placeholder="Phone" value={leadForm.phone || ""} onChange={e => setLeadForm(f => ({ ...f, phone: e.target.value }))} className={INPUT_CLS} />
                <input placeholder="Source" value={leadForm.source || ""} onChange={e => setLeadForm(f => ({ ...f, source: e.target.value }))} className={INPUT_CLS} />
                <input placeholder="Unit of interest" value={leadForm.unit_id || ""} onChange={e => setLeadForm(f => ({ ...f, unit_id: e.target.value }))} className={INPUT_CLS} />
                <textarea placeholder="Notes" value={leadForm.notes || ""} onChange={e => setLeadForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={INPUT_CLS + " resize-none"} />
                <div className="flex gap-2">
                  <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground" onClick={handleAddLead}>Add lead</Button>
                  <Button size="sm" variant="outline" className="border-border" onClick={() => { modal.close(); setLeadForm({}); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="border-border gap-1.5 mb-4" onClick={() => modal.open("leadForm")}><Plus className="w-3.5 h-3.5" /> Add lead</Button>
            )}
            <div className="space-y-2">
              {leads.map((l: ProjectLead) => (
                <div key={l.id} className="glass-card rounded-xl p-3 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-medium text-sm">{l.name}</span>
                    <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${l.status === "converted" ? "bg-brand-emerald/20 text-brand-emerald" : l.status === "lost" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>{l.status}</span>
                    {l.email && <p className="text-xs text-muted-foreground">{l.email}</p>}
                    {l.unit_id && <p className="text-xs text-muted-foreground">Unit: {l.unit_id}</p>}
                  </div>
                  <div className="flex gap-1">
                    <select value={l.status} onChange={e => handleUpdateLead(l.id, { status: e.target.value as ProjectLeadInsert["status"] })} className="text-xs bg-secondary border border-border rounded-lg px-2 py-1">
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="converted">Converted</option>
                      <option value="lost">Lost</option>
                    </select>
                    <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => { if (confirm("Remove lead?")) deleteLead.mutate({ id: l.id, projectId: id! }); }}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              ))}
              {leads.length === 0 && !modal.isOpen("leadForm") && <p className="text-sm text-muted-foreground">No leads yet.</p>}
            </div>
          </Section>

          {/* 7. Linked listings */}
          <Section title="Linked listings" icon={Building2}>
            <p className="text-sm text-muted-foreground mb-3">Link existing listings to this project. These appear on the project showcase.</p>
            {listings.length > 0 && (
              <div className="space-y-2 mb-4">
                {listings.map((l: { id: string; title?: string | null; sqm?: number | null; price?: number | null; cover_image_url?: string | null }) => (
                  <div key={l.id} className="flex items-center gap-3 bg-secondary rounded-xl p-3">
                    {l.cover_image_url && <img src={l.cover_image_url} alt="" className="w-12 h-12 rounded-lg object-cover" />}
                    <div className="flex-1 min-w-0"><Link to={`/property/${l.id}`} className="font-medium hover:underline truncate block">{l.title}</Link><span className="text-xs text-muted-foreground">€{Number(l.price).toLocaleString()} Â· {l.sqm}m²</span></div>
                    <Button variant="ghost" size="sm" onClick={() => handleUnlinkListing(l.id)}>Unlink</Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {myListings.filter((l) => !linkedListingIds.has(l.id)).map((l) => (
                <Button key={l.id} variant="outline" size="sm" className="border-border" onClick={() => handleLinkListing(l.id)}>+ {l.title?.slice(0, 25)}{(l.title?.length ?? 0) > 25 ? "…" : ""}</Button>
              ))}
              {myListings.filter((l) => !linkedListingIds.has(l.id)).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No unlinked listings. <Link to="/listings/new" className="text-primary underline">Create one</Link>
                  {isDeveloper && <>{" Â· "}<Link to="/listings/new-building" className="text-primary underline">New building</Link></>}
                </p>
              )}
            </div>
          </Section>
        </div>
      </main>
      <Footer />
      <ConfirmDialog
        open={bulkConfirmOpen}
        title="Apply bulk price change"
        description={`Apply ${bulkPricePct}% price change to all available units? This cannot be undone.`}
        confirmLabel="Apply"
        onConfirm={executeBulkPriceUpdate}
        onCancel={() => setBulkConfirmOpen(false)}
      />
    </div>
  );
}

const UnitEditForm = ({ unit, onSave, onCancel, isCreate }: { unit?: ProjectUnit | null; onSave: (u: Partial<ProjectUnitInsert>) => void; onCancel: () => void; isCreate?: boolean }) => { // skipcq: JS-R1005 - UnitEditForm intentionally maps one dense project-unit schema into a single editor.
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

  const submit = () => {
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
      <div><label className={LABEL_CLS}>Unit ID</label><input value={f.unit_id} onChange={e => setF(x => ({ ...x, unit_id: e.target.value }))} placeholder="A101" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>Floor</label><input type="number" value={f.floor} onChange={e => setF(x => ({ ...x, floor: e.target.value }))} placeholder="1" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>Unit number</label><input value={f.unit_number} onChange={e => setF(x => ({ ...x, unit_number: e.target.value }))} placeholder="101" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>Status</label><select value={f.availability_status} onChange={e => setF(x => ({ ...x, availability_status: e.target.value }))} className={INPUT_CLS}><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option></select></div>
      <div><label className={LABEL_CLS}>Internal sqm</label><input type="number" step="0.01" value={f.internal_sqm} onChange={e => setF(x => ({ ...x, internal_sqm: e.target.value }))} placeholder="85" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>Balcony sqm</label><input type="number" step="0.01" value={f.balcony_sqm} onChange={e => setF(x => ({ ...x, balcony_sqm: e.target.value }))} placeholder="12" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>Price (€)</label><input type="number" value={f.price} onChange={e => setF(x => ({ ...x, price: e.target.value }))} placeholder="250000" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>Bedrooms</label><input type="number" value={f.bedrooms} onChange={e => setF(x => ({ ...x, bedrooms: e.target.value }))} placeholder="2" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>Bathrooms</label><input type="number" value={f.bathrooms} onChange={e => setF(x => ({ ...x, bathrooms: e.target.value }))} placeholder="2" className={INPUT_CLS} /></div>
      <div><label className={LABEL_CLS}>Kitchen type</label><select value={f.kitchen_type} onChange={e => setF(x => ({ ...x, kitchen_type: e.target.value }))} className={INPUT_CLS}><option value="">—</option>{KITCHEN_TYPES.map(k => <option key={k} value={k}>{k}</option>)}</select></div>
      <div><label className={LABEL_CLS}>Energy class</label><select value={f.energy_class} onChange={e => setF(x => ({ ...x, energy_class: e.target.value }))} className={INPUT_CLS}><option value="">—</option>{ENERGY_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
      <div className="sm:col-span-2 flex items-center gap-2 pt-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.sea_view} onChange={e => setF(x => ({ ...x, sea_view: e.target.checked }))} /> Sea view</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.city_view} onChange={e => setF(x => ({ ...x, city_view: e.target.checked }))} /> City view</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.mountain_view} onChange={e => setF(x => ({ ...x, mountain_view: e.target.checked }))} /> Mountain view</label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground" onClick={submit}>{isCreate ? "Add" : "Save"}</Button>
        <Button size="sm" variant="outline" className="border-border" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
};
