import { useEffect, useRef, useState, useCallback } from "react";

interface PullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number; // px pulled before triggering
  disabled?: boolean;
}

export function usePullToRefresh({ onRefresh, threshold = 72, disabled = false }: PullToRefreshOptions) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled) return;
    // Only trigger when scrolled to the very top
    const scrollEl = containerRef.current ?? document.documentElement;
    if (scrollEl.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
  }, [disabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (disabled || startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) { setPullDistance(0); setPulling(false); return; }
    // Rubber-band dampen: actual px = dy * 0.45
    const clamped = Math.min(dy * 0.45, threshold * 1.5);
    setPullDistance(clamped);
    setPulling(clamped > 10);
  }, [disabled, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (disabled) return;
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      try { await onRefresh(); } finally {
        setRefreshing(false);
      }
    }
    startY.current = null;
    setPulling(false);
    setPullDistance(0);
  }, [disabled, pullDistance, threshold, refreshing, onRefresh]);

  useEffect(() => {
    const el = window;
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(pullDistance / threshold, 1);

  return { pulling, pullDistance, refreshing, progress, containerRef };
}
