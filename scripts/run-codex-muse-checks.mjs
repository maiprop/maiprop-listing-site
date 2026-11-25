import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const suites = [
  'routing-tests.mjs',
  'github-tests.mjs',
  'collector-tests.mjs',
  'adversarial-tests.mjs',
  'network-tests.mjs',
  'final-regressions-tests.mjs',
  'cli-tests.mjs',
].map((name) => resolve(root, 'scripts', 'codex-muse-checks', name));

const env = { ...process.env, CANDIDATE_WORKSPACE: root };

const nodeResult = spawnSync(
  process.execPath,
  ['--test', '--test-concurrency=1', ...suites],
  { cwd: root, env, stdio: 'inherit', timeout: 70000 },
);

if (nodeResult.error) {
  process.stderr.write(`Node checks failed to spawn: ${nodeResult.error.message}\n`);
  process.exit(1);
}
if (typeof nodeResult.signal === 'string' && nodeResult.signal.length > 0) {
  process.stderr.write(`Node checks terminated by signal ${nodeResult.signal}\n`);
  process.exit(1);
}
if (nodeResult.status !== 0) {
  process.exit(nodeResult.status ?? 1);
}

const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
const blackbox = resolve(root, 'scripts', 'codex-muse-checks', 'blackbox.py');
const pythonResult = spawnSync(
  pythonCommand,
  ['-B', blackbox, root, process.execPath],
  { cwd: root, env, stdio: 'inherit', timeout: 90000 },
);

if (pythonResult.error) {
  process.stderr.write(`Python checks failed to spawn: ${pythonResult.error.message}\n`);
  process.exit(1);
}
if (typeof pythonResult.signal === 'string' && pythonResult.signal.length > 0) {
  process.stderr.write(`Python checks terminated by signal ${pythonResult.signal}\n`);
  process.exit(1);
}
if (pythonResult.status !== 0) {
  process.exit(pythonResult.status ?? 1);
}
