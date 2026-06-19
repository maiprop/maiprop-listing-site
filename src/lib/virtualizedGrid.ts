export function getAutoListingGridColumns(width: number) {
  if (width >= 1536) return 6;
  if (width >= 1180) return 5;
  if (width >= 960) return 4;
  if (width >= 700) return 3;
  if (width >= 420) return 2;
  return 1;
}

export function getVirtualWindow(
  itemCount: number,
  columnCount: number,
  viewportTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscanRows: number,
) {
  const totalRows = Math.ceil(itemCount / columnCount);
  const firstRow = Math.max(0, Math.floor(viewportTop / rowHeight) - overscanRows);
  const lastRow = Math.min(
    totalRows,
    Math.ceil((viewportTop + viewportHeight) / rowHeight) + overscanRows,
  );

  return {
    startIndex: firstRow * columnCount,
    endIndex: Math.min(itemCount, lastRow * columnCount),
    offsetY: firstRow * rowHeight,
    totalRows,
  };
}

export function getVirtualRowsFromOffsets(
  rowOffsets: number[],
  totalRows: number,
  viewportTop: number,
  viewportHeight: number,
  overscanRows: number,
) {
  if (totalRows <= 0) return { startRow: 0, endRow: 0 };

  const viewportBottom = viewportTop + viewportHeight;

  let firstLow = 0;
  let firstHigh = totalRows;
  while (firstLow < firstHigh) {
    const mid = Math.floor((firstLow + firstHigh) / 2);
    if ((rowOffsets[mid + 1] ?? 0) < viewportTop) {
      firstLow = mid + 1;
    } else {
      firstHigh = mid;
    }
  }

  let lastLow = firstLow;
  let lastHigh = totalRows;
  while (lastLow < lastHigh) {
    const mid = Math.floor((lastLow + lastHigh) / 2);
    if ((rowOffsets[mid] ?? 0) <= viewportBottom) {
      lastLow = mid + 1;
    } else {
      lastHigh = mid;
    }
  }

  return {
    startRow: Math.max(0, firstLow - overscanRows),
    endRow: Math.min(totalRows, lastLow + overscanRows),
  };
}
