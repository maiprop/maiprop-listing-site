import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = join(process.cwd(), "scripts", "audit-coverage-inventory.mjs");

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "maiprop-audit-coverage-"));
  for (const dir of [
    "coverage",
    "docs",
    "src/pages",
    "src/components",
    "src/hooks",
    "src/lib",
    "src/contexts",
    "src/test",
    "supabase/functions/demo-function",
  ]) {
    mkdirSync(join(root, dir), { recursive: true });
  }

  writeFileSync(join(root, "src", "pages", "Home.tsx"), "export const Home = () => null;\n");
  writeFileSync(join(root, "src", "test", "Home.test.tsx"), "import '../pages/Home';\n");
  writeFileSync(join(root, "supabase", "functions", "demo-function", "index.ts"), "Deno.serve(() => new Response('ok'));\n");
  writeFileSync(
    join(root, "coverage", "coverage-summary.json"),
    JSON.stringify({
      total: {
        lines: { pct: 100, covered: 1, total: 1 },
        functions: { pct: 100, covered: 1, total: 1 },
        branches: { pct: 100, covered: 1, total: 1 },
        statements: { pct: 100, covered: 1, total: 1 },
      },
    }),
  );
  mkdirSync(dirname(join(root, "docs", "audit-coverage-inventory.json")), { recursive: true });
  return root;
}

function runScript(root, args) {
  return execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("audit coverage inventory", () => {
  it("fails check mode when the committed inventory is stale", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "docs", "audit-coverage-inventory.json"),
      JSON.stringify({
        generated_at: "2026-01-01T00:00:00.000Z",
        totals: { supabase_functions: 0 },
      }),
    );

    expect(() => runScript(root, ["--check"])).toThrow(/audit-coverage-inventory\.json is stale/);
  });

  it("accepts a freshly generated inventory in check mode", () => {
    const root = makeFixture();

    runScript(root, []);
    const output = runScript(root, ["--check"]);

    expect(output).toContain('"supabase_functions": 1');
  });
});
