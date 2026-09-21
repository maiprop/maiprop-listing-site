import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { AUCTION_SOURCE_OVERLAYS, prepareAuctionSource } from "./prepare-auction-only-source.mjs";

const roots = [];
const git = (cwd, ...args) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "maiprop-auction-source-")); roots.push(root);
  const repository = join(root, "repository"); mkdirSync(repository);
  git(repository, "init", "--quiet");
  git(repository, "config", "user.name", "Test Fixture");
  git(repository, "config", "user.email", "fixture@example.invalid");
  git(repository, "config", "core.autocrlf", "false");
  git(repository, "config", "core.hooksPath", join(root, "no-hooks"));
  const put = (path, contents) => { const file = join(repository, path); mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, contents); };
  for (const path of AUCTION_SOURCE_OVERLAYS) put(path, `live ${path}\n`);
  put("src/pages/Pricing.tsx", "live pricing\n");
  put("supabase/functions/create-checkout/index.ts", "live checkout\n");
  git(repository, "add", "."); git(repository, "commit", "-qm", "live");
  const baseSha = git(repository, "rev-parse", "HEAD");
  for (const path of AUCTION_SOURCE_OVERLAYS) put(path, `fixed ${path}\n`);
  put("src/pages/Pricing.tsx", "unreleased pricing\n");
  put("supabase/functions/create-checkout/index.ts", "unreleased checkout\n");
  git(repository, "add", "."); git(repository, "commit", "-qm", "candidate");
  return { root, repository, baseSha, sourceSha: git(repository, "rev-parse", "HEAD"), output: join(root, "prepared") };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe("auction-only source boundary", () => {
  it("overlays auction fixes while preserving live Pricing and checkout", () => {
    const input = fixture();
    const result = prepareAuctionSource(input);
    expect(readFileSync(join(input.output, "src/pages/Pricing.tsx"), "utf8")).toBe("live pricing\n");
    expect(readFileSync(join(input.output, "supabase/functions/create-checkout/index.ts"), "utf8")).toBe("live checkout\n");
    expect(readFileSync(join(input.output, "functions/api/public/auctions.ts"), "utf8")).toBe("fixed functions/api/public/auctions.ts\n");
    expect(result.base_sha).toBe(input.baseSha);
    expect(result.source_sha).toBe(input.sourceSha);
    expect(result.changed_paths).toEqual([...AUCTION_SOURCE_OVERLAYS].sort());
    expect(result.source_sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("reads committed bytes, never unrelated dirty worktree edits", () => {
    const input = fixture();
    writeFileSync(join(input.repository, "functions/api/public/auctions.ts"), "dirty replacement");
    prepareAuctionSource(input);
    expect(readFileSync(join(input.output, "functions/api/public/auctions.ts"), "utf8")).toBe("fixed functions/api/public/auctions.ts\n");
  });
  it("refuses existing output directories and ambiguous refs", () => {
    const input = fixture(); mkdirSync(input.output);
    expect(() => prepareAuctionSource(input)).toThrow(/exists/);
    expect(() => prepareAuctionSource({ ...input, baseSha: "main" })).toThrow(/40-character/);
  });
  it("preserves committed bytes even when git archive applies export attributes", () => {
    const input = fixture();
    writeFileSync(join(input.repository, ".gitattributes"), "*.md export-subst\n*.txt export-ignore\n");
    writeFileSync(join(input.repository, "release.md"), "$Format:%H$\n");
    writeFileSync(join(input.repository, "retained.txt"), "retained committed source\n");
    git(input.repository, "add", "."); git(input.repository, "commit", "-qm", "archive attributes");
    input.baseSha = git(input.repository, "rev-parse", "HEAD");
    prepareAuctionSource(input);
    expect(readFileSync(join(input.output, "release.md"), "utf8")).toBe("$Format:%H$\n");
    expect(readFileSync(join(input.output, "retained.txt"), "utf8")).toBe("retained committed source\n");
  });
});
