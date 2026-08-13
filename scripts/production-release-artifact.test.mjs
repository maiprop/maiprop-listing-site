import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createReleaseArtifact,
  verifyReleaseArtifact,
} from "./production-release-artifact.mjs";
import { validateLiveReleaseMarkers } from "./verify-live-release-marker.mjs";

const sha = "0123456789abcdef0123456789abcdef01234567";
const roots = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "maiprop-release-artifact-"));
  roots.push(root);
  const dist = join(root, "dist");
  const supabase = join(root, "supabase");
  mkdirSync(join(dist, "assets"), { recursive: true });
  mkdirSync(join(supabase, "migrations"), { recursive: true });
  mkdirSync(join(supabase, "reconciliation"), { recursive: true });
  mkdirSync(join(supabase, "functions", "_shared"), { recursive: true });
  mkdirSync(join(supabase, "functions", "alpha"), { recursive: true });
  writeFileSync(join(dist, "index.html"), "<html>release</html>");
  writeFileSync(join(dist, "_worker.js"), "export default {};");
  writeFileSync(join(dist, "assets", "app.js"), "console.log('release');");
  writeFileSync(join(root, "sbom.cdx.json"), '{"bomFormat":"CycloneDX"}');
  writeFileSync(
    join(supabase, "config.toml"),
    [
      'project_id = "qvvicunqcrwpioqnvzxf"',
      "[functions.alpha]",
      "verify_jwt = true",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(supabase, "migrations", "20260729120000_alpha.sql"),
    "select 1;\n",
  );
  writeFileSync(
    join(supabase, "reconciliation", "production-history-v1.json"),
    '{"schema_version":1}\n',
  );
  writeFileSync(
    join(supabase, "reconciliation", "production-history-v1.sql"),
    "select json_build_object('ok', true);\n",
  );
  writeFileSync(
    join(supabase, "functions", "deno.json"),
    '{"nodeModulesDir":"auto"}\n',
  );
  writeFileSync(join(supabase, "functions", "deno.lock"), '{"version":"5"}\n');
  writeFileSync(
    join(supabase, "functions", "_shared", "helper.ts"),
    "export const value = 1;\n",
  );
  writeFileSync(
    join(supabase, "functions", "alpha", "index.ts"),
    "Deno.serve(() => new Response('ok'));\n",
  );
  return { root, dist, supabase, out: join(root, "candidate") };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("immutable production release artifact", () => {
  it("packages and manifests the exact deployable Supabase project", () => {
    const { root, dist, supabase, out } = fixture();
    const manifest = createReleaseArtifact({
      distDir: dist,
      sbomPath: join(root, "sbom.cdx.json"),
      supabaseDir: supabase,
      outDir: out,
      releaseSha: sha,
      sourceTree: sha,
      runId: "123",
      runAttempt: "2",
    });

    expect(manifest.supabase_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.supabase_files.map((record) => record.path)).toEqual([
      "supabase/config.toml",
      "supabase/functions/_shared/helper.ts",
      "supabase/functions/alpha/index.ts",
      "supabase/functions/deno.json",
      "supabase/functions/deno.lock",
      "supabase/migrations/20260729120000_alpha.sql",
      "supabase/reconciliation/production-history-v1.json",
      "supabase/reconciliation/production-history-v1.sql",
    ]);
    expect(
      manifest.files.find((record) => record.path === "supabase/config.toml"),
    ).toEqual(manifest.supabase_files[0]);
    expect(
      readFileSync(join(out, "supabase", "config.toml"), "utf8"),
    ).toContain("qvvicunqcrwpioqnvzxf");
    expect(verifyReleaseArtifact(out)).toEqual(manifest);
  });

  it("accepts CLI-stamped historical migration names with UUID suffixes", () => {
    const { root, dist, supabase, out } = fixture();
    const migration = "20260216201611_fb487914-ce34-4cc3-8fd3-eb1ca344b71c.sql";
    writeFileSync(join(supabase, "migrations", migration), "select 2;\n");

    const manifest = createReleaseArtifact({
      distDir: dist,
      sbomPath: join(root, "sbom.cdx.json"),
      supabaseDir: supabase,
      outDir: out,
      releaseSha: sha,
      sourceTree: sha,
      runId: "123",
      runAttempt: "2",
    });

    expect(manifest.supabase_files.map((record) => record.path)).toContain(
      `supabase/migrations/${migration}`,
    );
    expect(verifyReleaseArtifact(out)).toEqual(manifest);
  });

  it("packages ESM modules in Supabase Edge Function source", () => {
    const { root, dist, supabase, out } = fixture();
    const esmModule = join(
      supabase,
      "functions",
      "alpha",
      "openapi.test.mjs",
    );
    writeFileSync(esmModule, "export const contract = true;\n");

    const manifest = createReleaseArtifact({
      distDir: dist,
      sbomPath: join(root, "sbom.cdx.json"),
      supabaseDir: supabase,
      outDir: out,
      releaseSha: sha,
      sourceTree: sha,
      runId: "123",
      runAttempt: "2",
    });

    expect(manifest.supabase_files.map((record) => record.path)).toContain(
      "supabase/functions/alpha/openapi.test.mjs",
    );
    expect(verifyReleaseArtifact(out)).toEqual(manifest);
  });

  it("rejects unexpected deploy source paths", () => {
    const { root, dist, supabase, out } = fixture();
    writeFileSync(
      join(supabase, "functions", "alpha", ".env"),
      "SUPABASE_SERVICE_ROLE_KEY=not-a-real-key\n",
    );

    expect(() =>
      createReleaseArtifact({
        distDir: dist,
        sbomPath: join(root, "sbom.cdx.json"),
        supabaseDir: supabase,
        outDir: out,
        releaseSha: sha,
        sourceTree: sha,
        runId: "123",
        runAttempt: "2",
      }),
    ).toThrow(/unexpected Supabase source path/i);
  });

  it("rejects symbolic links in deploy source", () => {
    const { root, dist, supabase, out } = fixture();
    const outside = join(root, "outside");
    mkdirSync(outside);
    symlinkSync(outside, join(supabase, "functions", "linked"), "junction");

    expect(() =>
      createReleaseArtifact({
        distDir: dist,
        sbomPath: join(root, "sbom.cdx.json"),
        supabaseDir: supabase,
        outDir: out,
        releaseSha: sha,
        sourceTree: sha,
        runId: "123",
        runAttempt: "2",
      }),
    ).toThrow(/symbolic links/i);
  });

  it("creates and verifies a manifest tied to SHA, tree, run, and attempt", () => {
    const { root, dist, supabase, out } = fixture();
    const manifest = createReleaseArtifact({
      distDir: dist,
      sbomPath: join(root, "sbom.cdx.json"),
      supabaseDir: supabase,
      outDir: out,
      releaseSha: sha,
      sourceTree: sha,
      runId: "123",
      runAttempt: "2",
    });

    expect(manifest.release_sha).toBe(sha);
    expect(manifest.source_tree).toBe(sha);
    expect(manifest.source_run_id).toBe("123");
    expect(manifest.source_run_attempt).toBe("2");
    expect(manifest.payload_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.artifact_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.files.some((file) => file.path === "dist/_worker.js")).toBe(
      true,
    );
    expect(verifyReleaseArtifact(out)).toEqual(manifest);

    const marker = JSON.parse(
      readFileSync(join(out, "dist", "deploy-version.json"), "utf8"),
    );
    expect(marker).toMatchObject({
      release_sha: sha,
      payload_sha256: manifest.payload_sha256,
    });
    expect(manifest.schema_version).toBe(2);
    expect(marker.schema_version).toBe(1);
    expect(
      validateLiveReleaseMarkers({
        manifest,
        staticMarker: marker,
        apiMarker: structuredClone(marker),
      }),
    ).toEqual(marker);
  });

  it.each([
    ["tampered application file", "dist/assets/app.js", "tampered"],
    ["tampered worker", "dist/_worker.js", "tampered worker"],
    ["tampered release marker", "dist/deploy-version.json", "{}"],
    [
      "tampered Supabase migration",
      "supabase/migrations/20260729120000_alpha.sql",
      "select 2;",
    ],
    [
      "tampered migration reconciliation manifest",
      "supabase/reconciliation/production-history-v1.json",
      "{}",
    ],
  ])("rejects %s", (_label, path, contents) => {
    const { root, dist, supabase, out } = fixture();
    createReleaseArtifact({
      distDir: dist,
      sbomPath: join(root, "sbom.cdx.json"),
      supabaseDir: supabase,
      outDir: out,
      releaseSha: sha,
      sourceTree: sha,
      runId: "123",
      runAttempt: "1",
    });
    writeFileSync(join(out, ...path.split("/")), contents);

    expect(() => verifyReleaseArtifact(out)).toThrow(/mismatch|marker/i);
  });

  it("rejects missing and extra files", () => {
    const { root, dist, supabase, out } = fixture();
    createReleaseArtifact({
      distDir: dist,
      sbomPath: join(root, "sbom.cdx.json"),
      supabaseDir: supabase,
      outDir: out,
      releaseSha: sha,
      sourceTree: sha,
      runId: "123",
      runAttempt: "1",
    });

    rmSync(join(out, "dist", "assets", "app.js"));
    expect(() => verifyReleaseArtifact(out)).toThrow(/file set/i);

    createReleaseArtifact({
      distDir: dist,
      sbomPath: join(root, "sbom.cdx.json"),
      supabaseDir: supabase,
      outDir: out,
      releaseSha: sha,
      sourceTree: sha,
      runId: "123",
      runAttempt: "1",
    });
    writeFileSync(join(out, "dist", "unexpected.txt"), "extra");
    expect(() => verifyReleaseArtifact(out)).toThrow(/file set/i);
  });
});
