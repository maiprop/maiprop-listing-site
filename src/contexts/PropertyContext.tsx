import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Property } from "@/data/properties";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PropertyContextType {
  properties: Property[];
  loading: boolean;
  addProperty: (p: Omit<Property, "id" | "date_added" | "sort_order">) => Promise<void>;
  updateProperty: (id: string, p: Partial<Property>) => Promise<void>;
  deleteProperty: (id: string) => Promise<void>;
  bulkUpdateStatus: (ids: string[], status: Property["status"]) => Promise<void>;
  reorderProperties: (ids: string[]) => Promise<void>;
  refetch: () => Promise<void>;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export const PropertyProvider = ({ children }: { children: ReactNode }) => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProperties = useCallback(async () => {
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      if (import.meta.env.DEV) console.error("Failed to fetch properties:", error);
      return;
    }
    setProperties((data as Property[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const addProperty = async (p: Omit<Property, "id" | "date_added" | "sort_order">) => {
    // New properties get the highest sort_order
    const maxOrder = properties.length > 0 ? Math.max(...properties.map((x) => x.sort_order)) : 0;
    const { error } = await supabase.from("properties").insert({ ...p, sort_order: maxOrder + 1 });
    if (error) { if (import.meta.env.DEV) console.error("Failed to add property:", error); toast.error("Failed to add property."); return; }
    await fetchProperties();
  };

  const updateProperty = async (id: string, updates: Partial<Property>) => {
    const { error } = await supabase.from("properties").update(updates).eq("id", id);
    if (error) { if (import.meta.env.DEV) console.error("Failed to update property:", error); toast.error("Failed to update property."); return; }
    await fetchProperties();
  };

  const deleteProperty = async (id: string) => {
    const { error } = await supabase.from("properties").delete().eq("id", id);
    if (error) { if (import.meta.env.DEV) console.error("Failed to delete property:", error); toast.error("Failed to delete property."); return; }
    await fetchProperties();
  };

  const bulkUpdateStatus = async (ids: string[], status: Property["status"]) => {
    const { error } = await supabase.from("properties").update({ status }).in("id", ids);
    if (error) { if (import.meta.env.DEV) console.error("Failed to bulk update:", error); toast.error("Failed to update properties."); return; }
    await fetchProperties();
  };

  const reorderProperties = async (orderedIds: string[]) => {
    // Optimistically update local state
    const reordered = orderedIds.map((id, i) => {
      const prop = properties.find((p) => p.id === id)!;
      return { ...prop, sort_order: i };
    });
    // Keep properties not in the list unchanged
    const otherProps = properties.filter((p) => !orderedIds.includes(p.id));
    setProperties([...reordered, ...otherProps]);

    // Batch update sort_order in DB
    const updates = orderedIds.map((id, i) =>
      supabase.from("properties").update({ sort_order: i }).eq("id", id)
    );
    const results = await Promise.all(updates);
    const hasError = results.some((r) => r.error);
    if (hasError) {
      toast.error("Failed to save order.");
      await fetchProperties();
    }
  };

  return (
    <PropertyContext.Provider value={{ properties, loading, addProperty, updateProperty, deleteProperty, bulkUpdateStatus, reorderProperties, refetch: fetchProperties }}>
      {children}
    </PropertyContext.Provider>
  );
};

export const useProperties = () => {
  const ctx = useContext(PropertyContext);
  if (!ctx) throw new Error("useProperties must be used within PropertyProvider");
  return ctx;
};
