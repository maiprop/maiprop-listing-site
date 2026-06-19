import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { getAutoListingGridColumns, getVirtualRowsFromOffsets } from "@/lib/virtualizedGrid";

type VirtualizedListingGridProps<T extends { id: string }> = {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  className: string;
  scrollParentRef?: React.RefObject<HTMLElement>;
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
  scrollParentRef,
  estimateItemHeight = 420,
  gap = 16,
  columns = "auto",
  overscanRows = 3,
  "data-testid": testId,
}: VirtualizedListingGridProps<T>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportFrameRef = useRef<number | null>(null);
  const [rootWidth, setRootWidth] = useState(0);
  const [viewportTop, setViewportTop] = useState(0);
  const [measuredRowHeights, setMeasuredRowHeights] = useState<Record<string, number>>({});
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 900 : window.innerHeight,
  );

  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? node.clientWidth;
      setRootWidth((current) => (current === nextWidth ? current : nextWidth));
    });
    resizeObserver.observe(node);
    setRootWidth((current) => (current === node.clientWidth ? current : node.clientWidth));

    const updateViewport = () => {
      const rect = node.getBoundingClientRect();
      const scrollParent = scrollParentRef?.current ?? null;
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        const nextTop = Math.max(0, parentRect.top - rect.top);
        const nextHeight = scrollParent.clientHeight;
        setViewportTop((current) => (current === nextTop ? current : nextTop));
        setViewportHeight((current) => (current === nextHeight ? current : nextHeight));
        return;
      }
      const nextTop = Math.max(0, -rect.top);
      const nextHeight = window.innerHeight;
      setViewportTop((current) => (current === nextTop ? current : nextTop));
      setViewportHeight((current) => (current === nextHeight ? current : nextHeight));
    };
    const scheduleViewportUpdate = () => {
      if (viewportFrameRef.current !== null) return;
      const requestFrame = globalThis.requestAnimationFrame ?? ((callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 16));
      viewportFrameRef.current = requestFrame(() => {
        viewportFrameRef.current = null;
        updateViewport();
      });
    };
    updateViewport();
    const scrollTarget = scrollParentRef?.current ?? window;
    scrollTarget.addEventListener("scroll", scheduleViewportUpdate, { passive: true });
    window.addEventListener("resize", scheduleViewportUpdate);

    return () => {
      resizeObserver.disconnect();
      scrollTarget.removeEventListener("scroll", scheduleViewportUpdate);
      window.removeEventListener("resize", scheduleViewportUpdate);
      if (viewportFrameRef.current !== null) {
        const cancelFrame = globalThis.cancelAnimationFrame ?? window.clearTimeout;
        cancelFrame(viewportFrameRef.current);
        viewportFrameRef.current = null;
      }
    };
  }, [scrollParentRef]);

  const columnCount = columns === "auto" ? getAutoListingGridColumns(rootWidth) : columns;
  const totalRows = Math.ceil(items.length / columnCount);
  const rows = useMemo(() => {
    return Array.from({ length: totalRows }, (_, rowIndex) => {
      const startIndex = rowIndex * columnCount;
      const rowItems = items.slice(startIndex, startIndex + columnCount);

      return {
        key: rowItems.map((item) => item.id).join("|"),
        startIndex,
        items: rowItems,
        rowIndex,
      };
    });
  }, [columnCount, items, totalRows]);

  const rowOffsets = useMemo(() => {
    const offsets = [0];

    for (const row of rows) {
      const measuredHeight = measuredRowHeights[row.key];
      const rowHeight = Math.max(estimateItemHeight, measuredHeight ?? 0);
      offsets.push(offsets[offsets.length - 1] + rowHeight + gap);
    }

    return offsets;
  }, [estimateItemHeight, gap, measuredRowHeights, rows]);

  const totalHeight = Math.max(0, rowOffsets[totalRows] - gap);
  const { startRow, endRow } = useMemo(
    () => getVirtualRowsFromOffsets(rowOffsets, totalRows, viewportTop, viewportHeight, overscanRows),
    [overscanRows, rowOffsets, totalRows, viewportHeight, viewportTop],
  );

  const visibleRows = rows.slice(startRow, endRow);
  const visibleItemCount = visibleRows.reduce((count, row) => count + row.items.length, 0);

  const handleRowHeight = useCallback((rowKey: string, height: number) => {
    setMeasuredRowHeights((current) => {
      if (current[rowKey] === height) return current;
      return { ...current, [rowKey]: height };
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className="relative"
      style={{ minHeight: totalHeight }}
      data-testid={testId}
      data-total-count={items.length}
      data-virtualized-count={visibleItemCount}
    >
      {visibleRows.map((row) => (
        <MeasuredGridRow
          key={row.key}
          className={className}
          rowKey={row.key}
          top={rowOffsets[row.rowIndex]}
          onHeight={handleRowHeight}
        >
          {row.items.map((item, itemOffset) => renderItem(item, row.startIndex + itemOffset))}
        </MeasuredGridRow>
      ))}
    </div>
  );
}

function MeasuredGridRow({
  children,
  className,
  onHeight,
  rowKey,
  top,
}: {
  children: ReactNode;
  className: string;
  onHeight: (rowKey: string, height: number) => void;
  rowKey: string;
  top: number;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const node = rowRef.current;
    if (!node) return;

    const publishHeight = (height: number) => {
      const roundedHeight = Math.ceil(height);
      if (roundedHeight > 0) onHeight(rowKey, roundedHeight);
    };

    publishHeight(node.getBoundingClientRect().height);

    const resizeObserver = new ResizeObserver((entries) => {
      publishHeight(entries[0]?.contentRect.height ?? node.getBoundingClientRect().height);
    });
    resizeObserver.observe(node);

    return () => resizeObserver.disconnect();
  }, [onHeight, rowKey]);

  return (
    <div
      ref={rowRef}
      className={className}
      style={{
        left: 0,
        position: "absolute",
        right: 0,
        top,
      }}
    >
      {children}
    </div>
  );
}
