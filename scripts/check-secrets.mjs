#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";

const root = process.cwd();
const execFile = promisify(execFileCallback);

const ignoredDirs = new Set([
  ".git",
  ".lighthouseci",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

const ignoredFiles = new Set([
  "package-lock.json",
]);

const allowedLineFragments = [
  "<redacted>",
  "<token>",
  "<your",
  "example",
  "placeholder",
  "not_real",
  "dummy",
  "fake",
  "test-token",
];

const detectors = [
  { name: "OpenAI API key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/g },
  { name: "GitHub classic token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{24,}\b/g },
  { name: "GitHub fine-grained token", pattern: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g },
  { name: "GitLab token", pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "Stripe secret/restricted key", pattern: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { name: "Supabase secret key", pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g },
  { name: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g },
  { name: "Lighthouse CI token", pattern: /\b[A-Za-z0-9_-]{8,}:\d{6,}:[A-Za-z0-9_-]{12,}\b/g },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { name: "SendGrid API key", pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g },
];

function isIgnoredPath(path) {
  const parts = relative(root, path).split(sep);
  return parts.some((part) => ignoredDirs.has(part)) || ignoredFiles.has(parts.at(-1) ?? "");
}

function isAllowedLine(line) {
  const normalized = line.toLowerCase();
  return allowedLineFragments.some((fragment) => normalized.includes(fragment));
}

function mask(secret) {
  if (secret.length <= 8) return "<redacted>";
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

async function* walk(dir) {
  if (isIgnoredPath(dir)) return;

  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (isIgnoredPath(path)) continue;
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

async function listGitTrackedFiles() {
  try {
    const { stdout } = await execFile("git", ["ls-files", "-z"], {
      cwd: root,
      maxBuffer: 20 * 1024 * 1024,
    });
    return stdout
      .split("\0")
      .filter(Boolean)
      .map((path) => join(root, path));
  } catch {
    return null;
  }
}

const findings = [];
const gitFiles = await listGitTrackedFiles();
const candidateFiles = gitFiles ?? [];

if (!gitFiles) {
  for await (const file of walk(root)) {
    candidateFiles.push(file);
  }
}

for (const file of candidateFiles) {
  if (isIgnoredPath(file)) continue;

  let text;
  try {
    text = await readFile(file, "utf8");
  } catch {
    continue;
  }

  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isAllowedLine(line)) return;

    for (const detector of detectors) {
      detector.pattern.lastIndex = 0;
      for (const match of line.matchAll(detector.pattern)) {
        findings.push({
          detector: detector.name,
          file: relative(root, file),
          line: index + 1,
          value: mask(match[0]),
        });
      }
    }
  });
}

if (findings.length > 0) {
  console.error("[check-secrets] Potential committed secrets found:");
  for (const finding of findings) {
    console.error(`- ${finding.detector} at ${finding.file}:${finding.line} (${finding.value})`);
  }
  process.exit(1);
}

console.log("[check-secrets] OK");
