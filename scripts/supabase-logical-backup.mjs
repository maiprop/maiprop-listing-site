#!/usr/bin/env node
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const getArgValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
};

const outDir = resolve(getArgValue("--out-dir", "backups/supabase"));
const useLinked = args.has("--linked");
const keepPlaintext = args.has("--keep-plaintext");
const dryRun = args.has("--dry-run");
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "";
const passphrase = process.env.MAIPROP_BACKUP_PASSPHRASE || "";

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupBase = `maiprop-supabase-logical-${timestamp}`;

const run = (command, commandArgs) => {
  const printableArgs = commandArgs.map((arg) => (arg === dbUrl ? "<redacted-db-url>" : arg));
  process.stderr.write(`[backup] ${command} ${printableArgs.join(" ")}\n`);
  if (dryRun) return;
  const child = spawnSync(command, commandArgs, { stdio: "inherit", shell: process.platform === "win32" });
  if (child.status !== 0) {
    throw new Error(`${command} ${printableArgs.join(" ")} failed with status ${child.status}`);
  }
};

const supabaseDumpArgs = (file, extra = []) => {
  const target = useLinked ? ["--linked"] : ["--db-url", dbUrl];
  return ["supabase", "db", "dump", ...target, "--file", file, ...extra];
};

const encryptFile = async (source, destination) => {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const out = createWriteStream(destination);
  out.write(Buffer.from("MAIPROP_BACKUP_V1\n"));
  out.write(Buffer.from(`${salt.toString("hex")}\n`));
  out.write(Buffer.from(`${iv.toString("hex")}\n`));
  await pipeline(createReadStream(source), cipher, out, { end: false });
  out.write(Buffer.from(`\n${cipher.getAuthTag().toString("hex")}\n`));
  out.end();
};

if (!useLinked && !dbUrl) {
  throw new Error("Set SUPABASE_DB_URL or DATABASE_URL, or pass --linked for a linked Supabase project.");
}
if (!keepPlaintext && !passphrase) {
  throw new Error("Set MAIPROP_BACKUP_PASSPHRASE, or pass --keep-plaintext for a local-only dry run.");
}

mkdirSync(outDir, { recursive: true });
const workDir = await mkdtemp(join(tmpdir(), "maiprop-supabase-backup-"));
const schemaPath = join(workDir, `${backupBase}.schema.sql`);
const dataPath = join(workDir, `${backupBase}.data.sql`);
const combinedPath = join(workDir, `${backupBase}.sql`);
const encryptedPath = join(outDir, `${backupBase}.sql.enc`);
const plaintextPath = join(outDir, `${backupBase}.sql`);
const manifestPath = join(outDir, `${backupBase}.manifest.json`);

try {
  run("npx", supabaseDumpArgs(schemaPath));
  run("npx", supabaseDumpArgs(dataPath, ["--data-only", "--use-copy"]));

  if (!dryRun) {
    writeFileSync(
      combinedPath,
      [
        "-- maiprop logical backup",
        `-- created_at=${new Date().toISOString()}`,
        "-- section=schema",
        "",
        existsSync(schemaPath) ? await import("node:fs").then((fs) => fs.readFileSync(schemaPath, "utf8")) : "",
        "",
        "-- section=data",
        "",
        existsSync(dataPath) ? await import("node:fs").then((fs) => fs.readFileSync(dataPath, "utf8")) : "",
      ].join("\n"),
    );

    if (keepPlaintext) {
      writeFileSync(plaintextPath, await import("node:fs").then((fs) => fs.readFileSync(combinedPath)));
    } else {
      await encryptFile(combinedPath, encryptedPath);
    }
    writeFileSync(
      manifestPath,
      `${JSON.stringify({
        created_at: new Date().toISOString(),
        backup_file: keepPlaintext ? basename(plaintextPath) : basename(encryptedPath),
        encrypted: !keepPlaintext,
        source: useLinked ? "linked Supabase project" : "SUPABASE_DB_URL",
        includes: ["schema", "data"],
        restore_runbook: "docs/backups/FREE_TIER_LOGICAL_BACKUPS.md",
      }, null, 2)}\n`,
    );
  }

  process.stdout.write(
    dryRun
      ? "Dry run completed; no backup written.\n"
      : `Logical backup written to ${keepPlaintext ? plaintextPath : encryptedPath}\nManifest written to ${manifestPath}\n`,
  );
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
