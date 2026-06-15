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
