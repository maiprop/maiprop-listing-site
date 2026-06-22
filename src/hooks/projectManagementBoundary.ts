import { supabase } from "@/integrations/supabase/client";

type ProjectManagementResponse<T> = {
  data?: T;
  error?: string | null;
};

export async function invokeProjectManagement<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<ProjectManagementResponse<T>>("project-management", {
    body,
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data as T;
}
