import { useEffect, useMemo, useRef, useState } from "react";
import { getAutoListingGridColumns, getVirtualWindow } from "@/lib/virtualizedGrid";

type VirtualizedListingGridProps<T extends { id: string }> = {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  className: string;
  estimateItemHeight?: number;
  gap?: number;
  columns?: number | "auto";
  overscanRows?: number;
  "data-testid"?: string;
};

export function VirtualizedListingGrid<T extends { id: string }>({
  items,
  renderItem,
  className,
  estimateItemHeight = 420,
  gap = 16,
  columns = "auto",
  overscanRows = 3,
  "data-testid": testId,
}: VirtualizedListingGridProps<T>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [rootWidth, setRootWidth] = useState(0);
  const [viewportTop, setViewportTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 900 : window.innerHeight,
  );

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const resizeObserver = new ResizeObserver((entries) => {
      setRootWidth(entries[0]?.contentRect.width ?? node.clientWidth);
    });
    resizeObserver.observe(node);
    setRootWidth(node.clientWidth);

    const updateViewport = () => {
      const rect = node.getBoundingClientRect();
      setViewportTop(Math.max(0, -rect.top));
      setViewportHeight(window.innerHeight);
    };
    updateViewport();
    window.addEventListener("scroll", updateViewport, { passive: true });
    window.addEventListener("resize", updateViewport);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  const columnCount = columns === "auto" ? getAutoListingGridColumns(rootWidth) : columns;
  const rowHeight = estimateItemHeight + gap;
  const { startIndex, endIndex, offsetY, totalRows } = getVirtualWindow(
    items.length,
    columnCount,
    viewportTop,
    viewportHeight,
    rowHeight,
    overscanRows,
  );
  const totalHeight = Math.max(0, totalRows * rowHeight - gap);
  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [endIndex, items, startIndex],
  );

  if (items.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className="relative"
      style={{ minHeight: totalHeight }}
      data-testid={testId}
      data-total-count={items.length}
      data-virtualized-count={visibleItems.length}
    >
      <div
        className={className}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          transform: `translateY(${offsetY}px)`,
        }}
      >
        {visibleItems.map((item) => renderItem(item))}
      </div>
    </div>
  );
}
