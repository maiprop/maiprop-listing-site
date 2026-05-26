import type { ReactNode } from "react";
import { X } from "lucide-react";

const ACTIVE_FILTER_CHIP_CLASS =
  "flex min-w-0 max-w-full items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors shrink-0";
const ACCENT_FILTER_CHIP_CLASS =
  "flex min-w-0 max-w-full items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent hover:bg-accent/20 transition-colors shrink-0";

export const ActiveFilterChip = ({
  children,
  onClick,
  accent = false,
}: {
  children: ReactNode;
  onClick: () => void;
  accent?: boolean;
}) => (
  <button onClick={onClick} className={accent ? ACCENT_FILTER_CHIP_CLASS : ACTIVE_FILTER_CHIP_CLASS}>
    <span className="min-w-0 truncate">{children}</span> <X className="w-3 h-3 shrink-0" />
  </button>
);
