import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const { QueryClient } = require('@tanstack/react-query');
const root = process.cwd();
const dir = path.join(root, '.superpowers/sdd/2026-09-21-verified-remediation-plan');
const [mode, outputName, frozenHead] = process.argv.slice(2);
if (mode !== '--o6-after' || !/^task-8-o6-after-[a-zA-Z0-9-]+\.json$/.test(outputName ?? '') || !/^[0-9a-f]{40}$/.test(frozenHead ?? '')) {
  throw new Error('Expected --o6-after task-8-o6-after-<unique>.json <clean-code-commit-SHA>');
}
const target = path.join(dir, outputName);
if (fs.existsSync(target)) throw new Error(`Refusing to overwrite ${target}`);
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (head !== frozenHead || execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) {
  throw new Error('Probe requires the exact clean committed implementation HEAD');
}
const sha = relative => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const pause = () => new Promise(resolve => setTimeout(resolve, 15));
const source = fs.readFileSync(path.join(root, 'src/hooks/useFavorites.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const original = JSON.parse(fs.readFileSync(path.join(dir, 'overfetch-probe-results.json'), 'utf8'));

// Same favorite/listing fixtures and fifteen millisecond fake request protocol as the original probe.
function fixture(count) {
  const favorites = Array.from({ length: count }, (_, i) => ({ id: `favorite-${i}`, user_id: 'fixture-user', listing_id: `listing-${i}`, price_alert: false, price_when_saved: 200000, created_at: '2026-01-01' }));
  const listings = favorites.map(row => ({ id: row.listing_id, title: 'Synthetic listing', city: 'Fixture city', listing_type: 'sale', property_type: 'apartment', description: 'D'.repeat(1000), listing_images: [{ url: 'https://fixture.invalid/image.jpg' }], price: 200000, sqm: 80 }));
  return { favorites, get_public_listing_catalogue: listings };
}
function mockDatabase(rows, calls) {
  const request = (kind, table) => {
    const predicates = []; const filters = []; let projection = '*'; const orders = [];
    const chain = {
      select(value) { projection = value; return chain; },
      eq(key, value) { predicates.push(row => row[key] === value); filters.push(['eq', key, value]); return chain; },
      in(key, values) { predicates.push(row => values.includes(row[key])); return chain; },
      order(key, options) { orders.push([key, options]); return chain; },
      then(resolve, reject) {
        return (async () => {
          const startedMs = performance.now();
          await pause();
          let data = (rows[table] ?? []).filter(row => predicates.every(predicate => predicate(row)));
          for (const [key, options] of [...orders].reverse()) data.sort((a, b) => (a[key] === b[key] ? 0 : a[key] > b[key] ? 1 : -1) * (options.ascending ? 1 : -1));
          if (projection !== '*') data = data.map(row => Object.fromEntries(projection.split(',').map(key => key.trim()).map(key => [key, row[key]])));
          calls.push({ kind, table, projection, filters, orders, rows: data.length, bytes: bytes(data), startedMs, settledMs: performance.now() });
          return { data, error: null };
        })().then(resolve, reject);
      },
    };
    return chain;
  };
  return { from: table => request('from', table), rpc: table => request('rpc', table) };
}
function actualHooks(database, getClient, configurations) {
  const stubs = {
    '@tanstack/react-query': { useQuery: options => { configurations.push(options); return { data: undefined, isLoading: true }; }, useQueryClient: getClient, useMutation: () => { throw new Error('Unexpected mutation'); } },
    '@/integrations/supabase/client': { supabase: database },
    '@/contexts/AuthContext': { useAuth: () => ({ user: { id: 'fixture-user' } }) },
    '@/lib/queryCachePolicy': { USER_SCOPED_QUERY_STALE_TIME: 60000 },
    '@/lib/mutationSchemas': { favoriteToggleSchema: {}, parseMutationInput: () => { throw new Error('Unexpected mutation'); } },
    'react-i18next': { useTranslation: () => ({ t: value => value }) },
    sonner: { toast: {} },
  };
  const sandbox = { exports: {}, require: name => {
    if (name in stubs) return stubs[name];
    throw new Error(`Unexpected dependency ${name}`);
  } };
  vm.runInNewContext(compiled, sandbox, { filename: 'src/hooks/useFavorites.ts' });
  return sandbox.exports;
}

const summaries = [];
for (const count of [0, 100, 1000]) {
  const rows = fixture(count);
  const calls = []; const configurations = [];
  let client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const hooks = actualHooks(mockDatabase(rows, calls), () => client, configurations);
  for (let i = 0; i < 20; i++) hooks.useIsFavorited(`listing-${i}`);
  const cardConfigs = configurations.splice(0);
  if (cardConfigs.length !== 20 || cardConfigs.some(config => JSON.stringify(config.queryKey) !== JSON.stringify(['favoriteMembership', 'fixture-user']))) throw new Error('Card queries have different keys');
  const startedMs = performance.now();
  await Promise.all(cardConfigs.map(config => client.fetchQuery(config)));
  const cardElapsedMs = performance.now() - startedMs;
  const cardCalls = calls.splice(0);
  if (cardCalls.length !== 1 || cardCalls[0].table !== 'favorites' || cardCalls[0].kind !== 'from') throw new Error(`Wrong cold-card requests for ${count}`);
  client.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  hooks.useFavorites();
  const fullConfig = configurations.splice(0)[0];
  const full = await client.fetchQuery(fullConfig);
  const fullCalls = calls.splice(0);
  if (full.length !== count || fullCalls.length !== (count ? 2 : 1) || fullCalls[0].table !== 'favorites' || (count && fullCalls[1].table !== 'get_public_listing_catalogue')) throw new Error(`Wrong full saved-view requests for ${count}`);
  const before = original.summaries.find(summary => summary.kind === 'actual-favorite-source' && summary.favoriteCount === count);
  if (!before) throw new Error(`Missing original baseline for ${count}`);
  summaries.push({ favoriteCount: count, simultaneousCards: 20, beforeColdCard: { requests: before.calls.length, bytes: before.totalBytes, hydrationRequests: before.calls.filter(call => call.table === 'get_public_listing_catalogue').length }, afterColdCard: { requests: cardCalls.length, bytes: cardCalls.reduce((sum, call) => sum + call.bytes, 0), hydrationRequests: 0, elapsedMs: cardElapsedMs, calls: cardCalls }, afterFullSavedView: { requests: fullCalls.length, bytes: fullCalls.reduce((sum, call) => sum + call.bytes, 0), hydrationRequests: fullCalls.filter(call => call.table === 'get_public_listing_catalogue').length, rows: full.length, calls: fullCalls } });
  client.clear();
}
const sourceHashes = Object.fromEntries(['src/hooks/useFavorites.ts', 'src/pages/Auctions.tsx', 'src/pages/PropertyDetail.tsx', 'src/pages/OpenHouseDetail.tsx', '.superpowers/sdd/2026-09-21-verified-remediation-plan/overfetch-probe-o6-after.mjs', '.superpowers/sdd/2026-09-21-verified-remediation-plan/overfetch-probe-original-o5.mjs', '.superpowers/sdd/2026-09-21-verified-remediation-plan/overfetch-probe-results.json'].map(relative => [relative, sha(relative)]));
const result = { recordedAt: new Date().toISOString(), node: process.version, head, sourceHashes, conditions: { source: 'Actual O6 hook query functions with installed QueryClient; same original synthetic favorites and fake Supabase transport', perRequestDelayMs: 15, externalRequests: 0, productionLatency: false, browserRenderMeasured: false, actualNetworkSerializationMeasured: false, modeledAlternative: false, typescriptVersion: ts.version, reactQueryVersion: require('@tanstack/react-query/package.json').version }, summaries };
fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
