/* eslint-disable react-refresh/only-export-components -- These exports are lazy React component wrappers around Recharts. */
import { lazy, type ComponentType, type ReactNode } from "react";

type ChartComponentProps = Record<string, unknown> & {
  children?: ReactNode;
};

function lazyRechart(name: string) {
  return lazy(async () => {
    const mod = await import("recharts");
    return {
      default: mod[name as keyof typeof mod] as ComponentType<ChartComponentProps>,
    };
  });
}

export const ResponsiveContainer = lazyRechart("ResponsiveContainer");
export const AreaChart = lazyRechart("AreaChart");
export const Area = lazyRechart("Area");
export const BarChart = lazyRechart("BarChart");
export const Bar = lazyRechart("Bar");
export const XAxis = lazyRechart("XAxis");
export const YAxis = lazyRechart("YAxis");
export const Tooltip = lazyRechart("Tooltip");
export const Cell = lazyRechart("Cell");
export const PieChart = lazyRechart("PieChart");
export const Pie = lazyRechart("Pie");
export const Legend = lazyRechart("Legend");

export function ChartFallback({ height = 180 }: { height?: number }) {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted"
      style={{ height }}
      aria-hidden="true"
    />
  );
}
