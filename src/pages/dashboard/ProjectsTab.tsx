import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Link } from "react-router-dom";
import {
  Globe2, Plus, ExternalLink, MapPin, Edit2, Trash2, FolderOpen, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  useProjects,
  useDeleteProject,
} from "@/hooks/useProjects";
import type { Tables } from "@/integrations/supabase/types";
import { getListingDetailPath } from "@/lib/listingRoutes";

type Project = Tables<"projects"> & { listings?: ProjectListing[] };
type ProjectListing = { id: string; title: string; project_id: string | null; listing_type?: string | null };

export default function ProjectsTab() {
  const { user } = useAuth();

  const { data: myProjects = [], isLoading: projectsLoading } = useProjects(user?.id);
  const deleteProject = useDeleteProject();

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Globe2 className="w-6 h-6 text-primary" /> Projects
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Showcase development projects and link listings
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-border gap-2" asChild>
            <Link to="/projects">
              <ExternalLink className="w-4 h-4" /> Full View
            </Link>
          </Button>
          <Button
            className="bg-gradient-primary border-0 text-primary-foreground gap-2"
            asChild
          >
            <Link to="/listings/new-building">
              <Plus className="w-4 h-4" /> Create New Building
            </Link>
          </Button>
        </div>
      </div>

      {projectsLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : myProjects.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="font-semibold">No projects yet</h2>
          <p className="text-sm text-muted-foreground mt-2 mb-4">
            Create a new building to create the project, first unit, and public ad together.
          </p>
          <Button
            className="bg-gradient-primary border-0 text-primary-foreground gap-2"
            asChild
          >
            <Link to="/listings/new-building">
              <Plus className="w-4 h-4" /> Create New Building
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {myProjects.map((p: Project) => (
            <div key={p.id} className="glass-card rounded-xl border border-border overflow-hidden">
              <div className="p-5 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Link
                      to={`/projects/${p.id}`}
                      className="font-display font-semibold hover:text-primary transition-colors"
                    >
                      {p.name}
                    </Link>
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full",
                        p.status === "active"
                          ? "bg-primary/10 text-primary"
                          : p.status === "completed"
                          ? "bg-brand-emerald/20 text-brand-emerald"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {p.status}
                    </span>
                  </div>
                  {p.city && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {p.city}
                    </p>
                  )}
                  {p.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                      {p.description}
                    </p>
                  )}
                  {p.building_permit_number && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Permit: {p.building_permit_number}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="sm" className="border-border text-xs" asChild>
                    <Link to={`/projects/${p.id}`}>
                      <Edit2 className="w-3 h-3 mr-1" />
                      Edit
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete project"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(p.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {Array.isArray(p.listings) && p.listings.length > 0 && (
                <div className="border-t border-border px-5 py-3 bg-muted/20">
                  <p className="text-xs text-muted-foreground mb-2">
                    {p.listings.length} linked listing(s)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(p.listings as ProjectListing[]).map((l: ProjectListing) => (
                      <Link
                        key={l.id}
                        to={getListingDetailPath(l)}
                        className="text-xs px-2 py-1 bg-secondary rounded-lg border border-border hover:border-primary/40 transition-colors truncate max-w-[180px]"
                      >
                        {l.title}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete project?"
        description="This will permanently remove the project, project units, and project media. Linked listings will remain published as individual listings."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteProject.mutate(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
