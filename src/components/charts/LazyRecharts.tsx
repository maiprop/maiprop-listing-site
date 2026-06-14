import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Recharts charts inspect child component identity. Lazy-loading individual
// primitives wraps those identities and can leave chart panels blank.
export {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
};

export function ChartFallback({ height = 180 }: { height?: number }) {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted"
      style={{ height }}
      aria-hidden="true"
    />
  );
}
