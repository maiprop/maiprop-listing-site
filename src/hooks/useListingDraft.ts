/**
 * Manages draft persistence for the listing creation wizard.
 * Saves / restores / discards form state in localStorage under "listing_draft".
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { ListingFormData } from "@/hooks/useListingForm";

const DRAFT_KEY = "listing_draft";

interface UseLisingDraftReturn {
  draftBanner: "visible" | "dismissed" | "none" | "autosaved";
  setDraftBanner: (v: "visible" | "dismissed" | "none" | "autosaved") => void;
  checkDraft: () => void;
  handleSaveDraft: () => void;
  handleRestoreDraft: () => void;
  handleDiscardDraft: () => void;
}

export function useListingDraft(
  form: ListingFormData,
  setForm: React.Dispatch<React.SetStateAction<ListingFormData>>,
): UseLisingDraftReturn {
  const [draftBanner, setDraftBanner] = useState<"visible" | "dismissed" | "none" | "autosaved">("none");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced auto-save — silently writes to localStorage 2s after last change
  useEffect(() => {
    if (!form.title && !form.city && !form.price) return; // skip blank initial form
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
        setDraftBanner(prev => prev === "none" || prev === "autosaved" ? "autosaved" : prev);
      } catch (_err: unknown) { /* ignore quota errors */ }
    }, 2000);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form]);

  const checkDraft = useCallback(() => {
    try {
      if (localStorage.getItem(DRAFT_KEY)) setDraftBanner("visible");
    } catch (_err: unknown) { /* ignore */ }
  }, []);

  const handleSaveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
      toast.success("Draft saved");
    } catch (_err: unknown) {
      toast.error("Could not save draft");
    }
  }, [form]);

  const handleRestoreDraft = useCallback(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ListingFormData>;
        setForm(f => ({ ...f, ...parsed }));
        toast.success("Draft restored");
      }
    } catch (_err: unknown) {
      toast.error("Could not restore draft");
    }
    setDraftBanner("dismissed");
  }, [setForm]);

  const handleDiscardDraft = useCallback(() => {
    try { localStorage.removeItem(DRAFT_KEY); } catch (_err: unknown) { /* ignore */ }
    setDraftBanner("dismissed");
  }, []);

  return { draftBanner, setDraftBanner, checkDraft, handleSaveDraft, handleRestoreDraft, handleDiscardDraft };
}
