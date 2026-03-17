import { useState, useMemo, useEffect } from "react";
import { z } from "zod";
import { useProperties } from "@/contexts/PropertyContext";
import { useAuth } from "@/hooks/useAuth";
import { Property } from "@/data/properties";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, AlertTriangle, Home, ArrowRightCircle, CheckCircle, LogOut, GripVertical, Users, RefreshCw, Sparkles, BookOpen, Eye, EyeOff } from "lucide-react";
import ImageUpload from "@/components/ImageUpload";
import FileUpload from "@/components/FileUpload";
import CrmTab from "@/components/CrmTab";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";

const propertySchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(2000, "Description too long"),
  price: z.number().int().nonnegative("Price must be positive").nullable(),
  size: z.number().int().nonnegative("Size must be positive").nullable(),
  bedrooms: z.number().int().nonnegative().max(50, "Max 50 bedrooms").nullable(),
  location: z.string().max(300, "Location too long"),
  floor: z.string().max(50, "Floor too long"),
  construction_year: z.string().max(4).regex(/^\d{4}$/, "Must be a 4-digit year").or(z.literal("")),
  yield: z.string().max(20, "Yield too long"),
  poi: z.array(z.string().max(100)).max(20, "Max 20 POIs"),
  tags: z.array(z.string().max(50)).max(20, "Max 20 tags"),
});

const emptyProperty: Omit<Property, "id" | "date_added" | "sort_order"> = {
  title: "", description: "", images: [], before_image: "", after_image: "", price: null, size: null, bedrooms: null,
  floor_plan: "", location: "", poi: [], tags: [], status: "", project_type: "new", yield: "", floor: "", construction_year: "", market_report: "",
};

// ── Articles Tab ────────────────────────────────────────────────────────────
interface ArticleRow {
  id: string;
  slug: string;
  topic: string;
  title: string;
  category: string;
  read_time: string;
  published: boolean;
  updated_at: string;
  content: Record<string, unknown>;
}

const ArticlesTab = () => {
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [newTopic, setNewTopic] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newCategory, setNewCategory] = useState("Golden Visa");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<ArticleRow | null>(null);
  const [deleteArtId, setDeleteArtId] = useState<string | null>(null);

  const fetchArticles = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("articles" as any).select("*").order("updated_at", { ascending: false });
    if (!error) setArticles((data as unknown as ArticleRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchArticles(); }, []);



  const generateAndSave = async (slug: string, topic: string, forceRegenerate = true) => {
    setGenerating(slug);
    try {
      const { data, error } = await supabase.functions.invoke("generate-article", {
        body: { topic, slug, forceRegenerate },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Article "${slug}" generated and saved.`);
      await fetchArticles();
    } catch (e: any) {
      toast.error(`Generation failed: ${e.message}`);
    } finally {
      setGenerating(null);
    }
  };

  const handleAddNew = async () => {
    if (!newTopic.trim() || !newSlug.trim()) { toast.error("Topic and slug are required"); return; }
    const cleanSlug = newSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    setAddOpen(false);
    await generateAndSave(cleanSlug, newTopic.trim());
    setNewTopic(""); setNewSlug(""); setNewCategory("Golden Visa");
  };

  const togglePublish = async (art: ArticleRow) => {
    const { error } = await supabase.from("articles" as any).update({ published: !art.published } as any).eq("id", art.id);
    if (error) { toast.error("Failed to update publish status"); return; }
    setArticles((prev) => prev.map((a) => a.id === art.id ? { ...a, published: !art.published } : a));
  };

  const handleSaveEdit = async () => {
    if (!editingArticle) return;
    const { error } = await supabase.from("articles" as any).update({
      title: editingArticle.title,
      topic: editingArticle.topic,
      category: editingArticle.category,
    } as any).eq("id", editingArticle.id);
    if (error) { toast.error("Failed to save"); return; }
    setEditOpen(false);
    await fetchArticles();
    toast.success("Article updated.");
  };

  const handleDelete = async () => {
    if (!deleteArtId) return;
    await supabase.from("articles" as any).delete().eq("id", deleteArtId);
    setDeleteArtId(null);
    await fetchArticles();
    toast.success("Article deleted.");
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">AI Articles</h2>
        <Button size="sm" className="gap-2 rounded-full" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> New Article
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading articles…
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-muted/50">
                <TableHead>Title / Slug</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Published</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {articles.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No articles yet — create your first one!</TableCell></TableRow>
              )}
              {articles.map((art) => (
                <TableRow key={art.id} className="border-border hover:bg-muted/30">
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{art.title || art.slug}</p>
                      <p className="text-xs text-muted-foreground font-mono">/guides/{art.slug}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className="border text-xs border-primary/30 bg-primary/10 text-primary">{art.category}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(art.updated_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" title={art.published ? "Unpublish" : "Publish"} onClick={() => togglePublish(art)}>
                      {art.published ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Regenerate with AI" disabled={generating === art.slug} onClick={() => generateAndSave(art.slug, art.topic, true)}>
                        <Sparkles className={`h-4 w-4 text-primary ${generating === art.slug ? "animate-pulse" : ""}`} />
                      </Button>
                      <Button size="icon" variant="ghost" title="Edit metadata" onClick={() => { setEditingArticle(art); setEditOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" title="Delete" onClick={() => setDeleteArtId(art.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add New Article Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="border-border bg-card max-w-lg">
          <DialogHeader><DialogTitle>New AI Article</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Topic / Subject <span className="text-xs text-muted-foreground">(be specific — AI uses this as the article brief)</span></Label>
              <Textarea
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                placeholder="e.g. Greek Golden Visa tax advantages for UAE investors compared to Portugal and Spain programs"
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label>URL Slug <span className="text-xs text-muted-foreground">(kebab-case, used in /guides/[slug])</span></Label>
              <Input
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="greek-golden-visa-tax-advantages-uae"
              />
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Golden Visa">Golden Visa</SelectItem>
                  <SelectItem value="Market Analysis">Market Analysis</SelectItem>
                  <SelectItem value="Investment Strategy">Investment Strategy</SelectItem>
                  <SelectItem value="Legal & Tax">Legal &amp; Tax</SelectItem>
                  <SelectItem value="Lifestyle">Lifestyle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddNew} className="w-full rounded-full gap-2">
              <Sparkles className="h-4 w-4" /> Generate with AI &amp; Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit metadata dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="border-border bg-card max-w-lg">
          <DialogHeader><DialogTitle>Edit Article Metadata</DialogTitle></DialogHeader>
          {editingArticle && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Title</Label>
                <Input value={editingArticle.title} onChange={(e) => setEditingArticle({ ...editingArticle, title: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Topic (used for AI regeneration)</Label>
                <Textarea value={editingArticle.topic} onChange={(e) => setEditingArticle({ ...editingArticle, topic: e.target.value })} rows={3} />
              </div>
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select value={editingArticle.category} onValueChange={(v) => setEditingArticle({ ...editingArticle, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Golden Visa">Golden Visa</SelectItem>
                    <SelectItem value="Market Analysis">Market Analysis</SelectItem>
                    <SelectItem value="Investment Strategy">Investment Strategy</SelectItem>
                    <SelectItem value="Legal & Tax">Legal &amp; Tax</SelectItem>
                    <SelectItem value="Lifestyle">Lifestyle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSaveEdit} className="w-full rounded-full">Save Changes</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteArtId} onOpenChange={() => setDeleteArtId(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Article?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the article and its cached content.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
// ── End ArticlesTab ──────────────────────────────────────────────────────────

const Admin = () => {
  const { properties, addProperty, updateProperty, deleteProperty, bulkUpdateStatus, reorderProperties } = useProperties();
  const { signOut } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<"new" | "delivered">("new");
  const [form, setForm] = useState<Omit<Property, "id" | "date_added" | "sort_order">>(emptyProperty);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<Property["status"]>("available");

  const portfolioProperties = useMemo(() => properties.filter((p) => p.project_type === "new").sort((a, b) => a.sort_order - b.sort_order), [properties]);
  const deliveredProperties = useMemo(() => properties.filter((p) => p.project_type === "delivered").sort((a, b) => a.sort_order - b.sort_order), [properties]);

  const onPortfolioDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(portfolioProperties);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    reorderProperties(items.map((p) => p.id));
  };

  const onDeliveredDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(deliveredProperties);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    reorderProperties(items.map((p) => p.id));
  };

  const missingInfo = (p: Property) => {
    const missing: string[] = [];
    if (!p.images.length || !p.images[0]) missing.push("Image");
    if (!p.price) missing.push("Price");
    if (!p.status) missing.push("Status");
    return missing;
  };

  const openNew = () => { setEditingId(null); setEditingType("new"); setForm(emptyProperty); setDescVariants([]); setDescVariantIdx(0); setFormOpen(true); };
  const openEdit = (p: Property) => {
    setEditingId(p.id);
    setEditingType(p.project_type);
    setForm({ title: p.title, description: p.description, images: p.images, before_image: p.before_image, after_image: p.after_image, price: p.price, size: p.size, bedrooms: p.bedrooms, floor_plan: p.floor_plan, location: p.location, poi: p.poi, tags: p.tags, status: p.status, project_type: p.project_type, yield: p.yield, floor: p.floor, construction_year: p.construction_year, market_report: p.market_report || "" });
    setDescVariants([]); setDescVariantIdx(0);
    setFormOpen(true);
  };

  const handleSave = () => {
    const result = propertySchema.safeParse(form);
    if (!result.success) {
      const firstError = result.error.errors[0];
      toast.error(firstError?.message || "Validation failed");
      return;
    }
    if (editingId) updateProperty(editingId, form);
    else addProperty(form);
    setFormOpen(false);
  };

  const handleDelete = () => {
    if (deleteId) { deleteProperty(deleteId); setDeleteId(null); setSelected((s) => { s.delete(deleteId); return new Set(s); }); }
  };

  const transferToDelivered = (id: string) => {
    updateProperty(id, { project_type: "delivered", status: "sold", floor_plan: "" });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const handleBulk = () => {
    bulkUpdateStatus(Array.from(selected), bulkStatus);
    setSelected(new Set());
  };

  const [refreshingPoi, setRefreshingPoi] = useState<Set<string>>(new Set());
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [descVariants, setDescVariants] = useState<string[]>([]);
  const [descVariantIdx, setDescVariantIdx] = useState(0);

  const generateDescription = async () => {
    setGeneratingDesc(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-description", {
        body: {
          title: form.title,
          location: form.location,
          size: form.size,
          bedrooms: form.bedrooms,
          tags: form.tags,
          poi: form.poi,
        },
      });
      if (error) throw error;
      if (data?.description) {
        const newVariants = [...descVariants, data.description];
        setDescVariants(newVariants);
        const newIdx = newVariants.length - 1;
        setDescVariantIdx(newIdx);
        setForm((prev) => ({ ...prev, description: data.description }));
      }
    } catch (e: any) {
      toast.error(`Failed to generate description: ${e.message || "Unknown error"}`);
    } finally {
      setGeneratingDesc(false);
    }
  };

  const cycleVariant = (dir: 1 | -1) => {
    const newIdx = (descVariantIdx + dir + descVariants.length) % descVariants.length;
    setDescVariantIdx(newIdx);
    setForm((prev) => ({ ...prev, description: descVariants[newIdx] }));
  };

  const refreshPoi = async (p: Property) => {
    setRefreshingPoi((prev) => new Set(prev).add(p.id));
    try {
      // Clear cache first so AI is called fresh
      await supabase.from("properties").update({ poi_cache: null } as any).eq("id", p.id);
      const { data, error } = await supabase.functions.invoke("location-poi", {
        body: { location: p.location, property_id: p.id },
      });
      if (error) throw error;
      toast.success(`POI refreshed for "${p.title}" — ${data?.poi?.length || 0} POIs`);
    } catch (e: any) {
      toast.error(`POI refresh failed: ${e.message || "Unknown error"}`);
    } finally {
      setRefreshingPoi((prev) => { const n = new Set(prev); n.delete(p.id); return n; });
    }
  };

  const refreshAllPoi = async () => {
    const allProps = [...portfolioProperties, ...deliveredProperties].filter((p) => p.location);
    toast.info(`Refreshing POI for ${allProps.length} properties...`);
    for (const p of allProps) {
      await refreshPoi(p);
    }
    toast.success("All POI caches refreshed!");
  };

  const isDeliveredForm = editingType === "delivered" || form.project_type === "delivered";

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="rounded-lg border border-border p-2 transition-colors hover:bg-muted">
              <Home className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold">Property Admin</h1>
          </div>
          <Button onClick={openNew} className="gap-2 rounded-full"><Plus className="h-4 w-4" /> Add Property</Button>
          <Button variant="outline" onClick={signOut} className="gap-2 rounded-full"><LogOut className="h-4 w-4" /> Sign Out</Button>
        </div>

        <Tabs defaultValue="properties" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="properties" className="gap-2"><Home className="h-4 w-4" /> Properties</TabsTrigger>
            <TabsTrigger value="crm" className="gap-2"><Users className="h-4 w-4" /> CRM</TabsTrigger>
            <TabsTrigger value="articles" className="gap-2"><BookOpen className="h-4 w-4" /> Articles</TabsTrigger>
          </TabsList>

          <TabsContent value="properties">
        {/* ── PORTFOLIO SECTION ── */}
        <div className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Portfolio <span className="text-sm font-normal text-muted-foreground">(drag to reorder)</span></h2>
            <Button variant="outline" size="sm" className="gap-2" onClick={refreshAllPoi}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh All POI
            </Button>
          </div>

          {selected.size > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as Property["status"])}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                   <SelectItem value="available">Available</SelectItem>
                   <SelectItem value="booked">Booked</SelectItem>
                   <SelectItem value="sold">Sold</SelectItem>
                   <SelectItem value="under-construction">Under Construction</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleBulk}>Update Status</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-muted/50">
                  <TableHead className="w-8" />
                  <TableHead className="w-10" />
                  <TableHead>Title</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Info</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <DragDropContext onDragEnd={onPortfolioDragEnd}>
                <Droppable droppableId="portfolio">
                  {(provided) => (
                    <TableBody ref={provided.innerRef} {...provided.droppableProps}>
                      {portfolioProperties.length === 0 && (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No portfolio properties</TableCell></TableRow>
                      )}
                      {portfolioProperties.map((p, index) => {
                        const missing = missingInfo(p);
                        const isSold = p.status === "sold";
                        return (
                          <Draggable key={p.id} draggableId={p.id} index={index}>
                            {(provided, snapshot) => (
                              <TableRow
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`border-border hover:bg-muted/30 ${snapshot.isDragging ? "bg-muted/50 shadow-lg" : ""}`}
                              >
                                <TableCell>
                                  <div {...provided.dragHandleProps} className="flex cursor-grab items-center justify-center">
                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                                </TableCell>
                                <TableCell className="font-medium">{p.title}</TableCell>
                                <TableCell>{p.price ? `€${p.price.toLocaleString()}` : "—"}</TableCell>
                                <TableCell>
                                  {(() => {
                                    const sc: Record<string, string> = {
                                      available: "bg-primary/20 text-primary border-primary/30",
                                      booked: "bg-secondary/20 text-secondary border-secondary/30",
                                      sold: "bg-destructive/20 text-destructive border-destructive/30",
                                      "under-construction": "bg-muted/30 text-muted-foreground border-muted-foreground/30",
                                    };
                                    return <Badge className={`border text-xs capitalize ${sc[p.status] || ""}`}>{p.status || "none"}</Badge>;
                                  })()}
                                </TableCell>
                                <TableCell>
                                  {missing.length > 0 && (
                                    <div className="flex items-center gap-1 text-destructive" title={`Missing: ${missing.join(", ")}`}>
                                      <AlertTriangle className="h-4 w-4" />
                                      <span className="text-xs">{missing.join(", ")}</span>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button size="icon" variant="ghost" title="Refresh POI" onClick={() => refreshPoi(p)} disabled={refreshingPoi.has(p.id)}>
                                      <RefreshCw className={`h-4 w-4 ${refreshingPoi.has(p.id) ? "animate-spin" : ""}`} />
                                    </Button>
                                    {isSold && (
                                      <Button size="icon" variant="ghost" title="Transfer to Delivered" onClick={() => transferToDelivered(p.id)} className="text-secondary">
                                        <ArrowRightCircle className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4" /></Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </TableBody>
                  )}
                </Droppable>
              </DragDropContext>
            </Table>
          </div>
        </div>

        {/* ── SUCCESSFULLY DELIVERED SECTION ── */}
        <div>
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-secondary" />
            <h2 className="text-lg font-semibold">Successfully Delivered <span className="text-sm font-normal text-muted-foreground">(drag to reorder)</span></h2>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-muted/50">
                  <TableHead className="w-8" />
                  <TableHead>Title</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Yield</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <DragDropContext onDragEnd={onDeliveredDragEnd}>
                <Droppable droppableId="delivered">
                  {(provided) => (
                    <TableBody ref={provided.innerRef} {...provided.droppableProps}>
                      {deliveredProperties.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No delivered properties yet</TableCell></TableRow>
                      )}
                      {deliveredProperties.map((p, index) => (
                        <Draggable key={p.id} draggableId={p.id} index={index}>
                          {(provided, snapshot) => (
                            <TableRow
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`border-border hover:bg-muted/30 ${snapshot.isDragging ? "bg-muted/50 shadow-lg" : ""}`}
                            >
                              <TableCell>
                                <div {...provided.dragHandleProps} className="flex cursor-grab items-center justify-center">
                                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">{p.title}</TableCell>
                              <TableCell>{p.price ? `€${p.price.toLocaleString()}` : "—"}</TableCell>
                              <TableCell className="text-sm">{p.yield || "—"}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </TableBody>
                  )}
                </Droppable>
              </DragDropContext>
            </Table>
          </div>
        </div>
          </TabsContent>

          <TabsContent value="crm">
            <CrmTab />
          </TabsContent>

          <TabsContent value="articles">
            <ArticlesTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-border bg-card">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Property" : "Add Property"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Description</Label>
                <div className="flex items-center gap-1">
                  {descVariants.length > 1 && (
                    <div className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                      <button type="button" onClick={() => cycleVariant(-1)} className="hover:text-foreground disabled:opacity-30 px-0.5">‹</button>
                      <span>{descVariantIdx + 1}/{descVariants.length}</span>
                      <button type="button" onClick={() => cycleVariant(1)} className="hover:text-foreground disabled:opacity-30 px-0.5">›</button>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={generateDescription}
                    disabled={generatingDesc}
                    className="h-7 gap-1.5 rounded-full px-3 text-xs border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <Sparkles className="h-3 w-3" />
                    {generatingDesc ? "Generating…" : descVariants.length === 0 ? "Generate with AI" : "Regenerate"}
                  </Button>
                </div>
              </div>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Price (€)</Label>
                <Input type="number" value={form.price ?? ""} onChange={(e) => setForm({ ...form, price: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="grid gap-2">
                <Label>Size (m²)</Label>
                <Input type="number" value={form.size ?? ""} onChange={(e) => setForm({ ...form, size: e.target.value ? Number(e.target.value) : null })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Bedrooms</Label>
                <Input type="number" value={form.bedrooms ?? ""} onChange={(e) => setForm({ ...form, bedrooms: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="grid gap-2">
                <Label>Yield</Label>
                <Input value={form.yield} onChange={(e) => setForm({ ...form, yield: e.target.value })} placeholder="e.g. 5.2%" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Location</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <ImageUpload
              label="Property Images (drag to reorder)"
              value={form.images}
              onChange={(urls) => setForm({ ...form, images: urls })}
              folder="gallery"
            />
            {!isDeliveredForm && (
              <ImageUpload
                label="Floor Plan"
                value={form.floor_plan ? [form.floor_plan] : []}
                onChange={(urls) => setForm({ ...form, floor_plan: urls[0] || "" })}
                max={1}
                folder="floorplans"
              />
            )}
            <FileUpload
              label="Market Report (PDF)"
              value={form.market_report}
              onChange={(url) => setForm({ ...form, market_report: url })}
              folder="reports"
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Floor</Label>
                <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="e.g. 3rd" />
              </div>
              <div className="grid gap-2">
                <Label>Construction Year</Label>
                <Input value={form.construction_year} onChange={(e) => setForm({ ...form, construction_year: e.target.value })} placeholder="e.g. 2024" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ImageUpload
                label="Before Image"
                value={form.before_image ? [form.before_image] : []}
                onChange={(urls) => setForm({ ...form, before_image: urls[0] || "" })}
                max={1}
                folder="before-after"
              />
              <ImageUpload
                label="After Image"
                value={form.after_image ? [form.after_image] : []}
                onChange={(urls) => setForm({ ...form, after_image: urls[0] || "" })}
                max={1}
                folder="before-after"
              />
            </div>
            <div className="grid gap-2">
              <Label>POI (comma-separated)</Label>
              <Input value={form.poi.join(", ")} onChange={(e) => setForm({ ...form, poi: e.target.value.split(",").map((s) => s.trim()) })} onBlur={() => setForm((prev) => ({ ...prev, poi: prev.poi.filter(Boolean) }))} />
            </div>
            <div className="grid gap-2">
              <Label>Tags (comma-separated, e.g. Balcony, Loft, Terrace)</Label>
              <Input value={form.tags.join(", ")} onChange={(e) => setForm({ ...form, tags: e.target.value.split(",").map((s) => s.trim()) })} onBlur={() => setForm((prev) => ({ ...prev, tags: prev.tags.filter(Boolean) }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Property["status"] })}>
                  <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="sold">Sold</SelectItem>
                    <SelectItem value="under-construction">Under Construction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Project Type</Label>
                <Select value={form.project_type} onValueChange={(v) => setForm({ ...form, project_type: v as "new" | "delivered" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleSave} className="mt-2 w-full rounded-full">{editingId ? "Save Changes" : "Add Property"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Property?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Admin;
