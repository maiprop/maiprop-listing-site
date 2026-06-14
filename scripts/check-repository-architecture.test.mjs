import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkRepositoryArchitecture } from "./check-repository-architecture.mjs";

const makeFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "maiprop-repo-arch-"));
  for (const dir of [
    ".github",
    "apps",
    "packages",
    "infrastructure",
    "supabase",
    "docs",
    "docs/adr",
    "docs/governance",
    "scripts",
  ]) {
    mkdirSync(join(root, dir), { recursive: true });
  }

  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      scripts: {
        "check:repo-architecture": "node scripts/check-repository-architecture.mjs",
      },
    }),
  );
  writeFileSync(
    join(root, ".github", "CODEOWNERS"),
    [
      "* @krenios",
      "/apps/ @krenios",
      "/packages/ @krenios",
      "/infrastructure/ @krenios",
      "/supabase/ @krenios",
    ].join("\n"),
  );
  writeFileSync(join(root, "apps", "README.md"), "# Apps\n");
  writeFileSync(join(root, "packages", "README.md"), "# Packages\n");
  writeFileSync(join(root, "infrastructure", "README.md"), "# Infrastructure\n");
  writeFileSync(
    join(root, "docs", "REPOSITORY_ARCHITECTURE.md"),
    [
      "# Repository Architecture",
      "Current layout",
      "Target layout",
      "/apps/web",
      "/packages/domain",
      "/packages/ui",
      "/packages/data-access",
      "/infrastructure/cloudflare",
      "no physical move without dedicated migration PR",
      "Cloudflare Pages",
      "Supabase",
      "React Query",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "adr", "0005-repository-package-architecture.md"),
    [
      "# ADR-0005: Repository Package Architecture",
      "- **Status:** Accepted",
      "phased",
      "no npm workspaces until package extraction",
      "codemod/import migration",
      "/apps",
      "/packages",
      "/infrastructure",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "governance", "repository-boundaries.json"),
    JSON.stringify({
      version: 1,
      currentMode: "single-package",
      targetLayout: {
        apps: ["apps/web"],
        packages: ["packages/domain", "packages/ui", "packages/data-access"],
        infrastructure: ["infrastructure/cloudflare", "infrastructure/capacitor"],
      },
      boundaries: [
        { id: "app-web", current: ["src"], target: "apps/web", ownerPath: "/apps/" },
        { id: "shared-ui", current: ["src/components/ui"], target: "packages/ui", ownerPath: "/packages/" },
        { id: "domain", current: ["src/lib"], target: "packages/domain", ownerPath: "/packages/" },
        { id: "data-access", current: ["src/hooks", "src/integrations/supabase"], target: "packages/data-access", ownerPath: "/packages/" },
        { id: "cloudflare-pages", current: ["functions", "public/_headers", "public/_redirects"], target: "infrastructure/cloudflare", ownerPath: "/infrastructure/" },
        { id: "supabase-backend", current: ["supabase"], target: "supabase", ownerPath: "/supabase/" },
      ],
    }),
  );

  return root;
};

describe("repository architecture contract", () => {
  it("accepts the staged package-boundary architecture", () => {
    const result = checkRepositoryArchitecture(makeFixture());

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when a target landing zone is missing", () => {
    const root = makeFixture();
    writeFileSync(join(root, "packages", "README.md"), "");

    const result = checkRepositoryArchitecture(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("packages/README.md");
  });

  it("fails when the boundary map omits package targets", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "docs", "governance", "repository-boundaries.json"),
      JSON.stringify({ version: 1, currentMode: "single-package", targetLayout: {}, boundaries: [] }),
    );

    const result = checkRepositoryArchitecture(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("packages/domain");
  });
});
