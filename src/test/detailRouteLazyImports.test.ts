import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("detail route responsiveness contracts", () => {
  it("does not mount property-detail map and report chunks before their panel enters the viewport", () => {
    const source = readSource("src/pages/PropertyDetail.tsx");

    expect(source).toContain('import { DeferredDetailPanel } from "@/components/DeferredDetailPanel"');
    expect(source).toMatch(/<DeferredDetailPanel[\s\S]*?<PropertyMiniMap/);
    expect(source).toMatch(/<DeferredDetailPanel[\s\S]*?<NeighbourhoodReport/);
  });

  it("keeps new-build map, report, and valuation modules out of the initial route chunk", () => {
    const source = readSource("src/pages/NewBuildDetail.tsx");

    expect(source).not.toMatch(/^import PropertyMiniMap from "@\/components\/PropertyMiniMap";/m);
    expect(source).not.toMatch(/^import NeighbourhoodReport from "@\/components\/NeighbourhoodReport";/m);
    expect(source).not.toMatch(/^import PropertyValuation from "@\/components\/PropertyValuation";/m);
    expect(source).toContain('const PropertyMiniMap = lazy(() => import("@/components/PropertyMiniMap"))');
    expect(source).toContain('const NeighbourhoodReport = lazy(() => import("@/components/NeighbourhoodReport"))');
    expect(source).toContain('const PropertyValuation = lazy(() => import("@/components/PropertyValuation"))');
  });

  it("keeps open-house map, report, and valuation modules out of the initial route chunk", () => {
    const source = readSource("src/pages/OpenHouseDetail.tsx");

    expect(source).not.toMatch(/^import PropertyMiniMap from "@\/components\/PropertyMiniMap";/m);
    expect(source).not.toMatch(/^import NeighbourhoodReport from "@\/components\/NeighbourhoodReport";/m);
    expect(source).not.toMatch(/^import PropertyValuation from "@\/components\/PropertyValuation";/m);
    expect(source).toContain('const PropertyMiniMap = lazy(() => import("@/components/PropertyMiniMap"))');
    expect(source).toContain('const NeighbourhoodReport = lazy(() => import("@/components/NeighbourhoodReport"))');
    expect(source).toContain('const PropertyValuation = lazy(() => import("@/components/PropertyValuation"))');
  });
});
