import React, { Suspense } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => {
  const Area = () => <g data-testid="area-child" />;
  const XAxis = () => <g data-testid="x-axis-child" />;
  const YAxis = () => <g data-testid="y-axis-child" />;
  const Tooltip = () => <g data-testid="tooltip-child" />;
  const Bar = () => <g data-testid="bar-child" />;
  const Cell = () => <g data-testid="cell-child" />;
  const Pie = () => <g data-testid="pie-child" />;
  const Legend = () => <g data-testid="legend-child" />;

  const AreaChart = ({ children }: { children?: React.ReactNode }) => {
    const childTypes = React.Children.toArray(children)
      .filter(React.isValidElement)
      .map((child) => child.type);

    return (
      <svg
        data-testid="area-chart"
        data-area-count={childTypes.filter((type) => type === Area).length}
        data-axis-count={childTypes.filter((type) => type === XAxis || type === YAxis).length}
      >
        {children}
      </svg>
    );
  };

  const BarChart = ({ children }: { children?: React.ReactNode }) => {
    const childTypes = React.Children.toArray(children)
      .filter(React.isValidElement)
      .map((child) => child.type);

    return (
      <svg
        data-testid="bar-chart"
        data-bar-count={childTypes.filter((type) => type === Bar).length}
      >
        {children}
      </svg>
    );
  };

  return {
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    Cell,
    PieChart: ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>,
    Pie,
    Legend,
  };
});

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "@/components/charts/LazyRecharts";

describe("LazyRecharts wrappers", () => {
  it("preserves Recharts child component identity for chart internals", async () => {
    render(
      <Suspense fallback={<div>Loading chart</div>}>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={[{ label: "Today", count: 3 }]}>
            <XAxis dataKey="label" />
            <YAxis />
            <Area dataKey="count" />
          </AreaChart>
        </ResponsiveContainer>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={[{ label: "Today", enquiries: 1 }]}>
            <XAxis dataKey="label" />
            <Bar dataKey="enquiries" />
          </BarChart>
        </ResponsiveContainer>
      </Suspense>,
    );

    await waitFor(() => expect(screen.queryByText("Loading chart")).not.toBeInTheDocument());

    expect(screen.getByTestId("area-chart")).toHaveAttribute("data-area-count", "1");
    expect(screen.getByTestId("area-chart")).toHaveAttribute("data-axis-count", "2");
    expect(screen.getByTestId("bar-chart")).toHaveAttribute("data-bar-count", "1");
  });
});
