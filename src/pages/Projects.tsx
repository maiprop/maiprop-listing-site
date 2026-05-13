import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Building2, Plus, Loader2, MapPin, Edit2, Trash2, ChevronRight,
  FolderOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useProjects, useCreateProject, useUpdateProject, useDeleteProject } from "@/hooks/useProjects";
import { useMyListings, useUpdateListing } from "@/hooks/useListings";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
import { ProGate } from "@/components/gates/ProGate";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Tables } from "@/integrations/supabase/types";

type ProjectListing = { id: string; title: string; cover_image_url?: string | null; price?: number | null };
type ProjectWithListings = Tables<"projects"> & { listings?: ProjectListing[] };

const Projects = () => { // skipcq: JS-R1005 - This page keeps create/edit/delete project UI state together with its ProGate surface.
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const participantType = getParticipantTypeFromProfile(profile);
  const isDeveloper = participantType === "developer";
  const { data: projects = [], isLoading } = useProjects(user?.id);
  const { data: myListings = [] } = useMyListings();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const updateListing = useUpdateListing();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newPermit, setNewPermit] = useState("");
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const handleCreate = () => {
    if (!newName.trim()) {
      toast.error("Project name is required");
      return;
    }
    createProject.mutate(
      { name: newName.trim(), description: newDesc.trim() || undefined, city: newCity.trim() || undefined, address: newAddress.trim() || undefined, building_permit_number: newPermit.trim() || undefined },
      {
        onSuccess: (data) => {
          setNewName("");
          setNewDesc("");
          setNewCity("");
          setNewAddress("");
          setNewPermit("");
          setShowCreate(false);
          if (data?.id) navigate(`/projects/${data.id}`);
        },
      }
    );
  };

  const handleUpdate = (id: string, updates: { name?: string; description?: string; status?: string }) => {
    updateProject.mutate({ id, updates }, { onSuccess: () => setEditingId(null) });
  };

  const handleDelete = (id: string) => {
    setProjectToDelete(id);
  };

  const handleLinkListing = (projectId: string, listingId: string) => {
    updateListing.mutate({ id: listingId, updates: { project_id: projectId } });
  };

  const handleUnlinkListing = (listingId: string) => {
    updateListing.mutate({ id: listingId, updates: { project_id: null } });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="font-display text-xl font-semibold">Sign in to manage projects</h1>
            <p className="text-sm text-muted-foreground mt-2">Create and showcase your development projects</p>
            <Button className="mt-4" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container max-w-5xl mx-auto px-4 pt-16 pb-10">
        <ProGate>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl font-bold">Projects</h1>
            <p className="text-sm text-muted-foreground mt-1">Showcase development projects and link listings</p>
          </div>
          <div className="flex gap-2">
            {isDeveloper && (
              <Button variant="outline" className="border-border" asChild>
                <Link to="/listings/new-building">New Building Listing</Link>
              </Button>
            )}
            <Button onClick={() => setShowCreate(true)} className="bg-gradient-primary border-0 text-primary-foreground gap-2">
              <Plus className="w-4 h-4" /> New Project
            </Button>
          </div>
        </div>

        {showCreate && (
          <div className="glass-card rounded-xl p-6 mb-6 border border-border">
            <h3 className="font-display font-semibold mb-4">Create project</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Name *</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Marina Heights"
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Brief description..."
                  rows={2}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm resize-none text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">City</label>
                <input
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  placeholder="e.g. Athens"
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Address</label>
                <input
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="Street, number"
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Αριθμός Οικοδομικής Άδειας (Building permit) *</label>
                <input
                  value={newPermit}
                  onChange={(e) => setNewPermit(e.target.value)}
                  placeholder="e.g. 12345/2024"
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={createProject.isPending} className="bg-gradient-primary border-0 text-primary-foreground">
                  {createProject.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Create
                </Button>
                <Button variant="outline" className="border-border" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : projects.length === 0 ? (
          <div className="glass-card rounded-xl p-12 text-center">
            <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-semibold">No projects yet</h2>
            <p className="text-sm text-muted-foreground mt-2">Create a project to group and showcase your listings</p>
            <Button className="mt-4 bg-gradient-primary border-0 text-primary-foreground" onClick={() => setShowCreate(true)}>Create your first project</Button>
          </div>
        ) : (
          <div className="space-y-6">
            {(projects as ProjectWithListings[]).map((p) => {
              const listings = Array.isArray(p.listings) ? p.listings : [];
              const isEditing = editingId === p.id;

              return (
                <div key={p.id} className="glass-card rounded-xl overflow-hidden border border-border">
                  <div className="p-5 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Link to={`/projects/${p.id}`} className="font-display font-semibold text-lg hover:text-primary transition-colors">
                          {p.name}
                        </Link>
                      </div>
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            defaultValue={p.name}
                            onBlur={(e) => handleUpdate(p.id, { name: e.target.value })}
                            placeholder="Project name"
                            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-primary transition-colors"
                            aria-label="Project name"
                          />
                          <input
                            defaultValue={p.description || ""}
                            onBlur={(e) => handleUpdate(p.id, { description: e.target.value })}
                            placeholder="Description"
                            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors"
                            aria-label="Project description"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                              p.status === "active" ? "bg-primary/10 text-primary" :
                              p.status === "completed" ? "bg-brand-emerald/20 text-brand-emerald" :
                              "bg-muted text-muted-foreground"
                            }`}>{p.status}</span>
                            {p.building_permit_number && <span className="text-xs text-muted-foreground">Permit: {p.building_permit_number}</span>}
                          </div>
                          {(p.description || p.city || p.developer_company) && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {p.description}
                              {p.developer_company && <span className="ml-2">· {p.developer_company}</span>}
                              {p.city && (
                                <span className="inline-flex items-center gap-1 ml-2">
                                  <MapPin className="w-3 h-3" /> {p.city}
                                </span>
                              )}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" className="border-border" asChild>
                        <Link to={`/projects/${p.id}`}>Edit full</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingId(isEditing ? null : p.id)}
                        aria-label={isEditing ? "Done editing" : "Quick edit"}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(p.id)}
                        aria-label="Delete project"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {listings.length > 0 && (
                    <div className="border-t border-border px-5 py-4">
                      <h4 className="text-xs font-medium text-muted-foreground mb-3">Listings in this project</h4>
                      <div className="flex flex-wrap gap-2">
                        {listings.map((l) => (
                          <div
                            key={l.id}
                            className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-3 py-2 text-sm"
                          >
                            {l.cover_image_url && (
                              <img src={l.cover_image_url} alt="" className="w-10 h-10 rounded object-cover" />
                            )}
                            <div>
                              <Link to={`/property/${l.id}`} className="font-medium hover:underline">
                                {l.title}
                              </Link>
                              <span className="text-muted-foreground ml-2">€{Number(l.price).toLocaleString()}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnlinkListing(l.id)}
                            >
                              Unlink
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-border px-5 py-4 bg-muted/30">
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">Link your listings</h4>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                      {myListings
                        .filter((l) => l.project_id !== p.id)
                        .map((l) => (
                          <Button
                            key={l.id}
                            variant="outline"
                            size="sm"
                            onClick={() => handleLinkListing(p.id, l.id)}
                          >
                            + {l.title?.slice(0, 30)}{l.title?.length > 30 ? "…" : ""}
                          </Button>
                        ))}
                      {myListings.filter((l) => l.project_id !== p.id).length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No unlinked listings. <Link to="/listings/new" className="underline text-primary">Create one</Link>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8">
          <Button variant="outline" className="border-border" asChild>
            <Link to="/dashboard" className="gap-2">
              <ChevronRight className="w-4 h-4 rotate-180" /> Back to Dashboard
            </Link>
          </Button>
        </div>
        </ProGate>
      </main>
      <Footer />
      <ConfirmDialog
        open={Boolean(projectToDelete)}
        title="Delete project"
        description="Delete this project? Linked listings will be unlinked."
        confirmLabel="Delete"
        onConfirm={() => {
          if (projectToDelete) deleteProject.mutate(projectToDelete);
          setProjectToDelete(null);
        }}
        onCancel={() => setProjectToDelete(null)}
      />
    </div>
  );
};

export default Projects;
