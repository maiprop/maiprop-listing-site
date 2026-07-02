const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!match) return null;

  let value = match[2].trim();
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [match[1], value];
}

function loadLocalEnv(options = {}) {
  const cwd = options.cwd || process.cwd();
  const files = options.files || [".env.local", ".env"];
  const loaded = [];

  for (const file of files) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) continue;

    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;

      const [key, value] = parsed;
      if (process.env[key] !== undefined) continue;

      process.env[key] = value;
      loaded.push({ file, key });
    }
  }

  return loaded;
}

module.exports = { loadLocalEnv, parseEnvLine };
