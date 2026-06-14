import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, delimiter, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

const REQUIRED = {
  node: { major: 20, minMinor: 19, minPatch: 0, label: pkg.engines.node },
  npm: { major: 10, minMinor: 8, minPatch: 0, label: pkg.engines.npm },
};

const unique = (items) => [...new Set(items.filter(Boolean))];

export function parseVersion(raw) {
  const match = String(raw).trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: String(raw).trim(),
  };
}

const atLeast = (version, { major, minMinor, minPatch }) => {
  if (!version || version.major !== major) return false;
  if (version.minor !== minMinor) return version.minor > minMinor;
  return version.patch >= minPatch;
};

const executableNames = (name, platform = process.platform) => {
  if (platform === "win32") return name === "node" ? ["node.exe", "node"] : ["npm.cmd", "npm"];
  return [name];
};

const findExecutable = (binDir, name, platform) => {
  for (const executable of executableNames(name, platform)) {
    const candidate = join(binDir, executable);
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

const defaultRunVersion = (command, args = ["--version"]) => {
  const result = spawnSync(command, args, { encoding: "utf8", shell: false });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
};

const findNpmCli = (binDir) => {
  const candidate = join(binDir, "node_modules", "npm", "bin", "npm-cli.js");
  return existsSync(candidate) ? candidate : null;
};

export function candidateBinDirs({
  env = process.env,
  pathDelimiter = delimiter,
  platform = process.platform,
} = {}) {
  const pathValue = env.PATH ?? env.Path ?? "";
  const explicit = [
    env.MAIPROP_NODE20_HOME,
    env.VOLTA_HOME ? join(env.VOLTA_HOME, "bin") : null,
  ];
  const windowsKnown = platform === "win32" && env.USERPROFILE
    ? [
        join(env.USERPROFILE, "scoop", "apps", "nodejs20", "current"),
        join(env.USERPROFILE, "scoop", "apps", "nodejs-lts", "current"),
      ]
    : [];

  return unique([
    ...explicit,
    ...windowsKnown,
    ...pathValue.split(pathDelimiter),
  ]);
}

export function findProjectRuntime({
  env = process.env,
  platform = process.platform,
  pathDelimiter = delimiter,
  runVersion = defaultRunVersion,
} = {}) {
  const inspected = [];

  for (const binDir of candidateBinDirs({ env, pathDelimiter, platform })) {
    const nodePath = findExecutable(binDir, "node", platform);
    const npmPath = findExecutable(binDir, "npm", platform);
    if (!nodePath || !npmPath) continue;

    const nodeVersion = parseVersion(runVersion(nodePath));
    const npmCliPath = findNpmCli(binDir);
    const npmVersion = parseVersion(
      npmCliPath ? runVersion(nodePath, [npmCliPath, "--version"]) : runVersion(npmPath),
    );
    inspected.push({
      binDir,
      node: nodeVersion?.raw ?? "unknown",
      npm: npmVersion?.raw ?? "unknown",
    });

    if (atLeast(nodeVersion, REQUIRED.node) && atLeast(npmVersion, REQUIRED.npm)) {
      return {
        ok: true,
        runtime: { binDir, nodePath, npmPath, npmCliPath, nodeVersion, npmVersion },
        inspected,
      };
    }
  }

  return { ok: false, inspected };
}

export function buildProjectRuntimeEnv(runtime, env = process.env, pathDelimiter = delimiter) {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  return {
    ...env,
    [pathKey]: `${runtime.binDir}${pathDelimiter}${env[pathKey] ?? ""}`,
    MAIPROP_ACTIVE_NODE: runtime.nodePath,
    MAIPROP_ACTIVE_NPM: runtime.npmPath,
  };
}

export function resolveRuntimeCommand(command, runtime) {
  const name = basename(command).toLowerCase();
  if (name === "node" || name === "node.exe") return runtime.nodePath;
  if (name === "npm" || name === "npm.cmd") return runtime.npmPath;
  return command;
}

export function resolveRuntimeInvocation(command, runtime) {
  const name = basename(command).toLowerCase();
  if (name === "node" || name === "node.exe") {
    return { command: runtime.nodePath, argsPrefix: [], shell: false };
  }
  if ((name === "npm" || name === "npm.cmd") && runtime.npmCliPath) {
    return { command: runtime.nodePath, argsPrefix: [runtime.npmCliPath], shell: false };
  }
  const resolvedCommand = resolveRuntimeCommand(command, runtime);
  return {
    command: resolvedCommand,
    argsPrefix: [],
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(resolvedCommand),
  };
}

const printDoctor = (runtimeResult) => {
  process.stdout.write(`Required Node: ${REQUIRED.node.label}\n`);
  process.stdout.write(`Required npm: ${REQUIRED.npm.label}\n`);

  if (runtimeResult.ok) {
    process.stdout.write(`Resolved Node: ${runtimeResult.runtime.nodeVersion.raw} at ${runtimeResult.runtime.nodePath}\n`);
    process.stdout.write(`Resolved npm: ${runtimeResult.runtime.npmVersion.raw} at ${runtimeResult.runtime.npmPath}\n`);
    process.stdout.write("Project runtime launcher OK\n");
    return;
  }

  process.stderr.write("No compatible local Node/npm runtime was found.\n");
  process.stderr.write("Install/use Node 20.19.5 with npm 10.8.2 via Volta, nvm/fnm, Scoop nodejs20, or the project Dockerfile.\n");
  process.stderr.write("You can also set MAIPROP_NODE20_HOME to the directory containing node and npm.\n");
  if (runtimeResult.inspected.length > 0) {
    process.stderr.write("Inspected candidates:\n");
    for (const candidate of runtimeResult.inspected) {
      process.stderr.write(`- ${candidate.binDir}: node ${candidate.node}, npm ${candidate.npm}\n`);
    }
  }
};

const main = () => {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();

  const runtimeResult = findProjectRuntime();
  if (args.length === 0 || args[0] === "--doctor") {
    printDoctor(runtimeResult);
    process.exitCode = runtimeResult.ok ? 0 : 1;
    return;
  }

  if (!runtimeResult.ok) {
    printDoctor(runtimeResult);
    process.exitCode = 1;
    return;
  }

  const [command, ...commandArgs] = args;
  const invocation = resolveRuntimeInvocation(command, runtimeResult.runtime);
  const child = spawnSync(invocation.command, [...invocation.argsPrefix, ...commandArgs], {
    env: buildProjectRuntimeEnv(runtimeResult.runtime),
    shell: invocation.shell,
    stdio: "inherit",
  });

  if (child.error) {
    process.stderr.write(`${child.error.message}\n`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = child.status ?? 1;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("project-runtime.mjs")
) {
  main();
}
