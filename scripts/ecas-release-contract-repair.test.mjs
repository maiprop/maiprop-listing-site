import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const workflowSource = (name) =>
  readFileSync(resolve(root, ".github", "workflows", name), "utf8");
const workflow = (name) => yaml.load(workflowSource(name));

function needsOf(job) {
  if (!job?.needs) return [];
  return Array.isArray(job.needs) ? job.needs : [job.needs];
}

function transitivelyNeeds(jobs, start, target, seen = new Set()) {
  if (seen.has(start)) return false;
  seen.add(start);
  for (const dependency of needsOf(jobs[start])) {
    if (dependency === target) return true;
    if (transitivelyNeeds(jobs, dependency, target, seen)) return true;
  }
  return false;
}

function step(job, name) {
  return job.steps.find((candidate) => candidate.name === name);
}

describe("ECAS Cloudflare release contract repair", () => {
  it("completes staging Cloudflare identity, credential, and baseline preflight before Supabase mutation", () => {
    const jobs = workflow("stage-release.yml").jobs;
    const preflight = jobs["cloudflare-staging-preflight"];
    const supabase = jobs["supabase-staging"];

    expect(preflight).toBeTruthy();
    expect(transitivelyNeeds(jobs, "supabase-staging", "cloudflare-staging-preflight"))
      .toBe(true);
    expect(transitivelyNeeds(jobs, "cloudflare-staging", "cloudflare-staging-preflight"))
      .toBe(true);
    expect(JSON.stringify(preflight)).toContain(
      "CLOUDFLARE_STAGING_PAGES_PROJECT_ID",
    );
    expect(JSON.stringify(preflight)).toContain(
      "CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN",
    );
    expect(JSON.stringify(preflight)).toContain("canonical_deployment");
    expect(JSON.stringify(preflight)).not.toMatch(
      /supabase\s+(?:db\s+push|functions\s+deploy)|--request\s+(?:POST|PATCH|PUT|DELETE)/i,
    );
    expect(supabase.uses).toBe(
      "./.github/workflows/reusable-supabase-staging.yml",
    );
  });

  it("completes production Cloudflare rollback and credential preflight before any backend mutation", () => {
    const jobs = workflow("deploy-production-release.yml").jobs;
    const preflight = jobs["cloudflare-production-preflight"];

    expect(preflight).toBeTruthy();
    for (const mutationJob of [
      "deploy-production-database",
      "deploy-production-edge",
      "deploy-production-cloudflare",
    ]) {
      expect(
        transitivelyNeeds(
          jobs,
          mutationJob,
          "cloudflare-production-preflight",
        ),
        mutationJob,
      ).toBe(true);
    }
    expect(JSON.stringify(preflight)).toContain("CLOUDFLARE_PAGES_PROJECT_ID");
    expect(JSON.stringify(preflight)).toContain("CLOUDFLARE_PAGES_EDIT_TOKEN");
    expect(JSON.stringify(preflight)).toContain("rollback");
    expect(JSON.stringify(preflight)).not.toMatch(
      /supabase\s+(?:db\s+push|functions\s+deploy)|pages\s+deploy|--request\s+(?:POST|PATCH|PUT|DELETE)/i,
    );
  });

  it("provides one fail-closed idempotent staging bootstrap lane without production mutation authority", () => {
    const parsed = workflow("bootstrap-cloudflare-staging-pages.yml");
    const source = workflowSource("bootstrap-cloudflare-staging-pages.yml");
    const bootstrap = parsed.jobs.bootstrap;
    const deploy = step(bootstrap, "Deploy first function-enabled staging artifact");
    const verify = step(bootstrap, "Verify exact canonical staging runtime and API");

    expect(parsed.on).toEqual({
      workflow_dispatch: { inputs: expect.any(Object) },
    });
    expect(bootstrap.if).toContain("STAGING_PAGES_BOOTSTRAP_ENABLED");
    expect(bootstrap.if).toContain("github.ref == 'refs/heads/main'");
    expect(bootstrap.if).toContain("github.run_attempt == 1");
    expect(bootstrap.if).toContain("github.actor == github.triggering_actor");
    expect(source).toContain("STAGING_TRUSTED_CONTROL_SHA");
    expect(source).toContain("github-staging-lease");
    expect(source).toContain("verify-release-artifact-binding.mjs");
    expect(source).not.toContain("--same-run");
    expect(source).toContain("run_attempt == 1");
    expect(source).toContain("actor.login == .triggering_actor.login");
    expect(source).toContain('STAGING_PROJECT: "maiprop-listing-site-staging"');
    expect(source).toContain('PRODUCTION_PROJECT: "maiprop-listing-site"');
    expect(source).not.toContain("CLOUDFLARE_PAGES_EDIT_TOKEN");
    expect(deploy.if).toContain("bootstrap_required == 'true'");
    expect(deploy.with.apiToken).toBe(
      "${{ secrets.CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN }}",
    );
    expect(deploy.with.command).toContain("pages deploy dist");
    expect(deploy.with.command).toContain("--commit-hash=${{ inputs.release_sha }}");
    expect(verify.run).toContain("uses_functions");
    expect(verify.run).toContain("release:verify-live-marker");
    expect(verify.run).toContain("release:verify-runtime-config");
    expect(verify.run).toContain("https://maiprop-listing-site-staging.pages.dev");
    expect(source).not.toMatch(/supabase\s+(?:db\s+push|functions\s+deploy)/i);
  });

  it("keeps transient artifacts within the 90-day provider cap and durably archives production source", () => {
    const ci = workflow("ci.yml");
    const stage = workflow("stage-release.yml");
    const production = workflow("deploy-production-release.yml");
    const candidateUploads = ci.jobs.quality.steps.filter(
      (candidate) =>
        String(candidate.uses ?? "").startsWith("actions/upload-artifact@") &&
        String(candidate.with?.name ?? "").includes("production-release-candidate-"),
    );
    const bindingUploads = ci.jobs["release-candidate-built"].steps.filter(
      (candidate) =>
        String(candidate.uses ?? "").startsWith("actions/upload-artifact@") &&
        String(candidate.with?.name ?? "").includes("production-release-candidate-binding-"),
    );
    const nMinusOneUpload = step(
      stage.jobs["capture-production-n-minus-one"],
      "Upload immutable production N-1 source",
    );

    expect(candidateUploads).toHaveLength(1);
    expect(bindingUploads).toHaveLength(1);
    expect(candidateUploads[0].with["retention-days"]).toBe(90);
    expect(bindingUploads[0].with["retention-days"]).toBe(90);
    expect(nMinusOneUpload.with["retention-days"]).toBe(90);

    const archive = production.jobs["archive-production-source"];
    expect(archive).toBeTruthy();
    expect(archive.permissions).toEqual({ actions: "read", contents: "write" });
    expect(archive.needs).toEqual([
      "validate",
      "cloudflare-production-preflight",
    ]);
    expect(JSON.stringify(archive)).toContain("production-source-release.mjs");
    expect(JSON.stringify(archive)).toContain("production-source-");
    expect(JSON.stringify(archive)).toContain("immutable == true");
    expect(JSON.stringify(archive)).toContain(
      "GitHub did not publish an immutable release",
    );
    expect(JSON.stringify(archive)).toContain(
      "Release candidate contains a special filesystem entry",
    );
    expect(JSON.stringify(archive)).toContain(
      "Production source archive contains a special filesystem entry",
    );
    expect(JSON.stringify(archive)).not.toContain(
      "GITHUB_RELEASE_GOVERNANCE_TOKEN",
    );
    expect(
      step(archive, "Publish or verify immutable SHA-bound source release").run,
    ).toContain('elif [ "$release_status" = "404" ]; then');
    const publish = step(
      archive,
      "Publish or verify immutable SHA-bound source release",
    ).run;
    expect(publish).toContain(".upload_url");
    expect(publish).toContain(
      "https://uploads.github.com/repos/${GITHUB_REPOSITORY}/releases/${release_id}/assets",
    );
    expect(publish).toContain('--data-binary @"$asset_path"');
    expect(publish).toContain(
      '"$ASSET_PATH" "$ASSET_NAME" "application/gzip"',
    );
    expect(publish).not.toContain(
      '"repos/${GITHUB_REPOSITORY}/releases/${release_id}/assets?name=',
    );
    expect(JSON.stringify(archive)).toContain("2026-03-10");
    expect(production.jobs["deploy-production-database"].needs).toContain(
      "archive-production-source",
    );

    const capture = JSON.stringify(stage.jobs["capture-production-n-minus-one"]);
    expect(capture).toContain("production-source-");
    expect(capture).toContain("immutable == true");
    expect(capture).toContain("production-source-release.mjs");
    expect(capture).toContain(
      "Immutable production source contains a special filesystem entry",
    );
    expect(
      step(
        stage.jobs["capture-production-n-minus-one"],
        "Capture canonical production identity and immutable artifact",
      ).run,
    ).toContain('elif [ "$durable_status" = "404" ]; then');
    expect(capture).toContain("GitHub durable source lookup failed");

    for (const name of [
      "ci.yml",
      "stage-release.yml",
      "deploy-production-release.yml",
      "bootstrap-cloudflare-staging-pages.yml",
    ]) {
      expect(workflowSource(name)).not.toContain("retention-days: 400");
    }

    const runbook = readFileSync(
      resolve(root, "docs", "PRODUCTION_RELEASE_RUNBOOK.md"),
      "utf8",
    );
    expect(runbook).toContain("90 days");
    expect(runbook).toContain("immutable GitHub prerelease");
    expect(runbook).toContain("successful production dispatch");
  });

  it("allows one explicit legacy N-1 reconstruction without presenting it as original production bytes", () => {
    const stage = workflow("stage-release.yml");
    const capture = stage.jobs["capture-production-n-minus-one"];
    const captureStep = step(
      capture,
      "Capture canonical production identity and immutable artifact",
    );

    expect(capture["timeout-minutes"]).toBeGreaterThanOrEqual(30);
    expect(captureStep.env.LEGACY_PRODUCTION_SHA).toBe(
      "db53d1b9adae41edae93fbeb3e612b42dd8fec0b",
    );
    expect(captureStep.env.STAGING_SUPABASE_URL).toContain(
      "STAGING_SUPABASE_URL",
    );
    expect(captureStep.run).toContain(
      '[ "$previous_sha" = "$LEGACY_PRODUCTION_SHA" ]',
    );
    expect(captureStep.run).toContain(
      "legacy-reconstructed-for-staging-compatibility",
    );
    expect(captureStep.run).toContain("git archive --format=tar");
    expect(captureStep.run).toContain("npm run build:cloudflare-pages-worker");
    expect(captureStep.run).toContain("production-history-v1.json");
    expect(captureStep.run).toContain("production-release-artifact.mjs create");
    expect(captureStep.run).toContain("legacy_origin_ci_run_id");

    const runbook = readFileSync(
      resolve(root, "docs", "PRODUCTION_RELEASE_RUNBOOK.md"),
      "utf8",
    );
    expect(runbook).toContain("not byte-identical production evidence");
    expect(runbook).toContain(
      "db53d1b9adae41edae93fbeb3e612b42dd8fec0b",
    );
  });

  it("documents the dedicated staging origin and the optional secret-only site lock contract", () => {
    const env = readFileSync(resolve(root, ".env.staging.example"), "utf8");
    const docs = readFileSync(resolve(root, "docs", "STAGING_SETUP.md"), "utf8");

    expect(env).not.toContain("staging.maiprop-listing-site.pages.dev");
    expect(env).toContain("https://maiprop-listing-site-staging.pages.dev");
    expect(`${env}\n${docs}`).toContain("SITE_LOCK_PASSWORD");
    expect(`${env}\n${docs}`).toMatch(/SITE_LOCK_PASSWORD[^\n]*secret_text/i);
  });
});
