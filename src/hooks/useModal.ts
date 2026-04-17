import { useState, useCallback } from "react";

/**
 * Manages a set of exclusive named modals with a single string state.
 * Replaces N individual boolean useState flags for modals that can't be
 * open simultaneously.
 *
 * Example:
 *   const modal = useModal<"viewing" | "auctionAlert">();
 *   modal.open("viewing")          // open a specific modal
 *   modal.close()                  // close whatever is open
 *   modal.isOpen("viewing")        // boolean — use in JSX conditionals
 *   modal.toggle("viewing")        // open if closed, close if open
 */
export function useModal<T extends string>() {
  const [active, setActive] = useState<T | null>(null);

  const open = useCallback((id: T) => setActive(id), []);
  const close = useCallback(() => setActive(null), []);
  const isOpen = useCallback((id: T) => active === id, [active]);
  const toggle = useCallback((id: T) => setActive(a => (a === id ? null : id)), []);

  return { open, close, isOpen, toggle, active };
}
