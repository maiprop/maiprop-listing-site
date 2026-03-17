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
    // Legacy "properties" table no longer exists – fall back gracefully
    setProperties([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addProperty = async (_p: Omit<Property, "id" | "date_added" | "sort_order">) => {
    toast.error("Legacy properties table not available.");
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateProperty = async (_id: string, _updates: Partial<Property>) => {
    toast.error("Legacy properties table not available.");
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const deleteProperty = async (_id: string) => {
    toast.error("Legacy properties table not available.");
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const bulkUpdateStatus = async (_ids: string[], _status: Property["status"]) => {
    toast.error("Legacy properties table not available.");
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const reorderProperties = async (_orderedIds: string[]) => {
    toast.error("Legacy properties table not available.");
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
