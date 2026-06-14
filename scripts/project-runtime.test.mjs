import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProjectRuntimeEnv,
  candidateBinDirs,
  findProjectRuntime,
  parseVersion,
  resolveRuntimeCommand,
} from "./project-runtime.mjs";

const makeFakeRuntime = (name, platform = "win32") => {
  const root = join(tmpdir(), `maiprop-runtime-${name}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, "node_modules", "npm", "bin"), { recursive: true });
  writeFileSync(join(root, platform === "win32" ? "node.exe" : "node"), "");
  writeFileSync(join(root, platform === "win32" ? "npm.cmd" : "npm"), "");
  writeFileSync(join(root, "node_modules", "npm", "bin", "npm-cli.js"), "");
  return root;
};

describe("project runtime launcher", () => {
  it("parses semver versions with or without a v prefix", () => {
    expect(parseVersion("v20.20.2")).toMatchObject({ major: 20, minor: 20, patch: 2 });
    expect(parseVersion("10.8.2")).toMatchObject({ major: 10, minor: 8, patch: 2 });
    expect(parseVersion("not-a-version")).toBeNull();
  });

  it("prioritizes the explicit project runtime home before PATH entries", () => {
    const override = makeFakeRuntime("override");
    const pathRuntime = makeFakeRuntime("path");

    expect(
      candidateBinDirs({
        env: {
          MAIPROP_NODE20_HOME: override,
          PATH: pathRuntime,
        },
        pathDelimiter: delimiter,
        platform: "win32",
      }).slice(0, 2),
    ).toEqual([override, pathRuntime]);
  });

  it("finds a compatible Node 20/npm 10 pair and skips incompatible candidates", () => {
    const incompatible = makeFakeRuntime("node24");
    const compatible = makeFakeRuntime("node20");

    const result = findProjectRuntime({
      env: { PATH: [incompatible, compatible].join(delimiter) },
      platform: "win32",
      pathDelimiter: delimiter,
      runVersion: (command, args = ["--version"]) => {
        if (args[0]?.endsWith("npm-cli.js")) {
          return command.startsWith(incompatible) ? "11.9.0" : "10.8.2";
        }
        if (command.startsWith(incompatible)) {
          return command.endsWith("node.exe") ? "v24.14.0" : "11.9.0";
        }
        return command.endsWith("node.exe") ? "v20.20.2" : "10.8.2";
      },
    });

    expect(result.ok).toBe(true);
    expect(result.runtime.binDir).toBe(compatible);
    expect(result.runtime.nodeVersion.raw).toBe("v20.20.2");
    expect(result.runtime.npmVersion.raw).toBe("10.8.2");
  });

  it("builds a runtime PATH and resolves node/npm to pinned executable paths", () => {
    const compatible = makeFakeRuntime("env");
    const runtime = {
      binDir: compatible,
      nodePath: join(compatible, "node.exe"),
      npmPath: join(compatible, "npm.cmd"),
      npmCliPath: join(compatible, "node_modules", "npm", "bin", "npm-cli.js"),
    };

    expect(buildProjectRuntimeEnv(runtime, { PATH: "C:\\Other" }).PATH).toBe(`${compatible}${delimiter}C:\\Other`);
    expect(resolveRuntimeCommand("node", runtime)).toBe(runtime.nodePath);
    expect(resolveRuntimeCommand("npm", runtime)).toBe(runtime.npmPath);
    expect(resolveRuntimeCommand("vitest", runtime)).toBe("vitest");
  });
});
