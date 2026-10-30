import { lstatSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { routeTask, assertPatchWithinTask } from './codex-muse-routing.mjs';
import { collectMaiPropCiEvidence } from './codex-muse-github.mjs';

const MAX_JSON_BYTES = 1048576;
const MAX_NESTING = 64;

function fail(message) {
  const safe = typeof message === 'string' && message.length > 0 ? message : 'request rejected';
  try {
    process.stderr.write(`${JSON.stringify({ production_ready: false, error: safe })}\n`);
  } catch {
    try {
      process.stderr.write('{"production_ready":false}\n');
    } catch {
      /* stderr is best-effort */
    }
  }
  process.exitCode = 1;
}

function isOptionLike(value) {
  return typeof value === 'string' && value.startsWith('-');
}

function skipWhitespace(text, state) {
  while (state.index < text.length) {
    const c = text[state.index];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      state.index += 1;
    } else {
      break;
    }
  }
}

function expectLiteral(text, state, literal) {
  if (text.startsWith(literal, state.index)) {
    state.index += literal.length;
    return;
  }
  throw new Error('malformed');
}

function parseNumberToken(text, state) {
  const rest = text.slice(state.index);
  const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(rest);
  if (!match) {
    throw new Error('malformed');
  }
  state.index += match[0].length;
}

function parseStringToken(text, state) {
  if (text[state.index] !== '"') {
    throw new Error('malformed');
  }
  const start = state.index;
  state.index += 1;
  while (state.index < text.length) {
    const ch = text[state.index];
    if (ch === '"') {
      const raw = text.slice(start, state.index + 1);
      state.index += 1;
      let decoded;
      try {
        decoded = JSON.parse(raw);
      } catch {
        throw new Error('malformed');
      }
      if (typeof decoded !== 'string') {
        throw new Error('malformed');
      }
      return decoded;
    }
    if (ch === '\\') {
      state.index += 1;
      if (state.index >= text.length) {
        throw new Error('malformed');
      }
      const esc = text[state.index];
      if (esc === 'u') {
        if (state.index + 4 >= text.length) {
          throw new Error('malformed');
        }
        state.index += 5;
      } else {
        state.index += 1;
      }
      continue;
    }
    if (ch < ' ') {
      throw new Error('malformed');
    }
    state.index += 1;
  }
  throw new Error('malformed');
}

function parseValueToken(text, state, depth) {
  if (depth > MAX_NESTING) {
    throw new Error('excessive nesting');
  }
  skipWhitespace(text, state);
  if (state.index >= text.length) {
    throw new Error('malformed');
  }
  const c = text[state.index];
  if (c === '{') {
    parseObjectToken(text, state, depth + 1);
    return;
  }
  if (c === '[') {
    parseArrayToken(text, state, depth + 1);
    return;
  }
  if (c === '"') {
    parseStringToken(text, state);
    return;
  }
  if (c === 't') {
    expectLiteral(text, state, 'true');
    return;
  }
  if (c === 'f') {
    expectLiteral(text, state, 'false');
    return;
  }
  if (c === 'n') {
    expectLiteral(text, state, 'null');
    return;
  }
  if (c === '-' || (c >= '0' && c <= '9')) {
    parseNumberToken(text, state);
    return;
  }
  throw new Error('malformed');
}

function parseObjectToken(text, state, depth) {
  if (depth > MAX_NESTING) {
    throw new Error('excessive nesting');
  }
  state.index += 1;
  skipWhitespace(text, state);
  if (state.index < text.length && text[state.index] === '}') {
    state.index += 1;
    return;
  }
  const seen = new Set();
  for (;;) {
    skipWhitespace(text, state);
    if (state.index >= text.length || text[state.index] !== '"') {
      throw new Error('malformed');
    }
    const key = parseStringToken(text, state);
    if (seen.has(key)) {
      throw new Error('duplicate key');
    }
    seen.add(key);
    skipWhitespace(text, state);
    if (state.index >= text.length || text[state.index] !== ':') {
      throw new Error('malformed');
    }
    state.index += 1;
    parseValueToken(text, state, depth);
    skipWhitespace(text, state);
    if (state.index >= text.length) {
      throw new Error('malformed');
    }
    const next = text[state.index];
    if (next === ',') {
      state.index += 1;
      continue;
    }
    if (next === '}') {
      state.index += 1;
      return;
    }
    throw new Error('malformed');
  }
}

function parseArrayToken(text, state, depth) {
  if (depth > MAX_NESTING) {
    throw new Error('excessive nesting');
  }
  state.index += 1;
  skipWhitespace(text, state);
  if (state.index < text.length && text[state.index] === ']') {
    state.index += 1;
    return;
  }
  for (;;) {
    parseValueToken(text, state, depth);
    skipWhitespace(text, state);
    if (state.index >= text.length) {
      throw new Error('malformed');
    }
    const next = text[state.index];
    if (next === ',') {
      state.index += 1;
      continue;
    }
    if (next === ']') {
      state.index += 1;
      return;
    }
    throw new Error('malformed');
  }
}

function assertNoDuplicateKeysAndBoundedNesting(text) {
  const state = { index: 0 };
  parseValueToken(text, state, 0);
  skipWhitespace(text, state);
  if (state.index !== text.length) {
    throw new Error('malformed');
  }
}

function readBoundedJsonFile(path) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    throw new Error('input file is missing or unreadable');
  }
  if (typeof stat.isSymbolicLink === 'function' && stat.isSymbolicLink()) {
    throw new Error('symlink inputs are rejected');
  }
  if (typeof stat.isDirectory === 'function' && stat.isDirectory()) {
    throw new Error('directory inputs are rejected');
  }
  if (typeof stat.isFile === 'function' && !stat.isFile()) {
    throw new Error('regular file input is required');
  }
  let fd = -1;
  try {
    fd = openSync(path, 'r');
    const live = fstatSync(fd);
    if (typeof live.isFile === 'function' && !live.isFile()) {
      throw new Error('regular file input is required');
    }
    const capacity = MAX_JSON_BYTES + 1;
    const buffer = Buffer.alloc(capacity);
    let total = 0;
    for (;;) {
      const remaining = capacity - total;
      if (remaining <= 0) {
        break;
      }
      let read = 0;
      try {
        read = readSync(fd, buffer, total, remaining, null);
      } catch {
        throw new Error('input file is missing or unreadable');
      }
      if (read === 0) {
        break;
      }
      total += read;
      if (total > MAX_JSON_BYTES) {
        throw new Error('input exceeds the one MiB bound');
      }
    }
    const text = buffer.subarray(0, total).toString('utf8');
    try {
      assertNoDuplicateKeysAndBoundedNesting(text);
    } catch {
      throw new Error('invalid JSON input');
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('invalid JSON input');
    }
  } finally {
    if (fd !== -1) {
      try {
        closeSync(fd);
      } catch {
        /* close is best-effort */
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    fail('unknown command');
    return;
  }
  const command = args[0];
  if (isOptionLike(command)) {
    fail('unknown command');
    return;
  }
  if (command === 'route') {
    if (args.length !== 2 || isOptionLike(args[1])) {
      fail('route requires exactly one input file');
      return;
    }
    let task;
    try {
      task = readBoundedJsonFile(args[1]);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'invalid JSON input');
      return;
    }
    let result;
    try {
      result = routeTask(task);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'invalid task');
      return;
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === 'check-reported-patch') {
    if (args.length !== 3 || isOptionLike(args[1]) || isOptionLike(args[2])) {
      fail('check-reported-patch requires exactly two input files');
      return;
    }
    let task;
    let changes;
    try {
      task = readBoundedJsonFile(args[1]);
      changes = readBoundedJsonFile(args[2]);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'invalid JSON input');
      return;
    }
    let result;
    try {
      result = assertPatchWithinTask(task, changes);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'invalid reported patch');
      return;
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === 'observe-ci') {
    if (args.length !== 2 || isOptionLike(args[1])) {
      fail('observe-ci requires exactly one input file');
      return;
    }
    let request;
    try {
      request = readBoundedJsonFile(args[1]);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'invalid JSON input');
      return;
    }
    let result;
    try {
      result = await collectMaiPropCiEvidence(request);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'invalid observer request');
      return;
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  fail('unknown command');
}

await main();
