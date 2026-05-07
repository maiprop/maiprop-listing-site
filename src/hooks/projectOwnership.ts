import { supabase } from "@/integrations/supabase/client";

export async function requireOwnedProject(projectId: string, userId: string | undefined): Promise<void> {
  if (!userId) throw new Error("Must be logged in");

  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Unauthorized");
}
