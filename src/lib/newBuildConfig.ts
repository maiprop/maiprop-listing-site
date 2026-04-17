import { ClipboardList, HardHat, Building2, Layers, Home, CheckCircle2 } from "lucide-react";

export function formatNewBuildPrice(n: number): string {
  return "€" + n.toLocaleString("el-GR");
}

export const CONSTRUCTION_PHASES = [
  { key: "planning",           label: "Planning & Permits", icon: ClipboardList },
  { key: "foundation",         label: "Foundation",         icon: HardHat },
  { key: "under_construction", label: "Structural Work",    icon: Building2 },
  { key: "topping_out",        label: "Topping Out",        icon: Layers },
  { key: "shell_complete",     label: "Fitting Out",        icon: Home },
  { key: "new",                label: "Completed",          icon: CheckCircle2 },
];

export const ENERGY_BADGE_COLORS: Record<string, string> = {
  "A+": "bg-green-500", "A": "bg-green-400", "B+": "bg-lime-500",
  "B": "bg-lime-400", "C": "bg-yellow-400", "D": "bg-orange-400",
  "E": "bg-red-400", "Z": "bg-red-600", "H": "bg-red-700",
};
