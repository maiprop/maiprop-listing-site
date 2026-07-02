import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import localEnvLoader from "./_load-local-env.cjs";

describe("loadLocalEnv", () => {
  it("loads local env files without overriding exported shell values", async () => {
    const dir = await mkdtemp(join(tmpdir(), "maiprop-env-"));
    const existingKey = "MAIPROP_TEST_EXISTING_ENV";
    const localKey = "MAIPROP_TEST_LOCAL_ENV";
    const quotedKey = "MAIPROP_TEST_QUOTED_ENV";

    const previousExisting = process.env[existingKey];
    const previousLocal = process.env[localKey];
    const previousQuoted = process.env[quotedKey];

    try {
      process.env[existingKey] = "from-shell";
      delete process.env[localKey];
      delete process.env[quotedKey];

      await writeFile(
        join(dir, ".env"),
        [
          `${existingKey}=from-file`,
          `${localKey}=from-file`,
          `export ${quotedKey}="quoted value"`,
        ].join("\n"),
      );

      const loaded = localEnvLoader.loadLocalEnv({ cwd: dir, files: [".env"] });

      expect(process.env[existingKey]).toBe("from-shell");
      expect(process.env[localKey]).toBe("from-file");
      expect(process.env[quotedKey]).toBe("quoted value");
      expect(loaded.map((entry) => entry.key)).toEqual([localKey, quotedKey]);
    } finally {
      if (previousExisting === undefined) delete process.env[existingKey];
      else process.env[existingKey] = previousExisting;

      if (previousLocal === undefined) delete process.env[localKey];
      else process.env[localKey] = previousLocal;

      if (previousQuoted === undefined) delete process.env[quotedKey];
      else process.env[quotedKey] = previousQuoted;

      await rm(dir, { force: true, recursive: true });
    }
  });
});
