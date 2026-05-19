const SUPERVISOR_MARKER_RE = /(?:^|\s)[^.]*\bsupervisor-\d+\b[^.]*\.?/gi;

export const stripSupervisorTestMarkers = (value?: string | null): string => {
  if (!value) return "";
  return value.replace(SUPERVISOR_MARKER_RE, " ").replace(/\s+/g, " ").trim();
};
