import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { Miniflare, Log, LogLevel } = createRequire(require.resolve("wrangler/package.json"))("miniflare");
let worker;
let origin;

try {
  const { outputFiles } = await build({
    stdin: {
      contents: `
        import { cachedJson, jsonResponse } from './functions/api/public/_cache.ts';
        let reads = 0, requests = 0, release;
        export default { async fetch(request, env, ctx) {
          const path = new URL(request.url).pathname;
          if (path === '/reads') return new Response(String(reads));
          if (path === '/requests') return new Response(String(requests));
          if (path === '/release') { release?.(); return new Response('released'); }
          requests++;
          return cachedJson({request, env, waitUntil:ctx.waitUntil.bind(ctx)}, new URL('https://cache.test/open-houses'), async () => {
            reads++;
            await new Promise(resolve => {
              const timer = setTimeout(resolve, 3000);
              release = () => { clearTimeout(timer); resolve(); };
            });
            return jsonResponse({data:[], hasMore:false, nextCursor:null, limit:60, publicationId:42});
          }, {producerTimeoutMs:1600});
        }};
      `,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    write: false,
    platform: "browser",
  });
  worker = new Miniflare({
    modules: true,
    script: outputFiles[0].text,
    // Supported by the pinned workerd; includes cross-request promise isolation.
    compatibilityDate: "2026-05-03",
    log: new Log(LogLevel.WARN),
  });
  origin = await worker.ready;
  const read = async () => {
    const response = await fetch(origin, { signal: AbortSignal.timeout(4000) });
    return { status: response.status, body: await response.text(), cache: response.headers.get("X-Maiprop-Cache") };
  };
  const first = read();
  const waitForCount = async (path, count) => {
    const deadline = Date.now() + 1000;
    while (Number(await (await fetch(new URL(path, origin))).text()) < count) {
      if (Date.now() >= deadline) throw Error('Workers request did not reach the gate');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  await waitForCount('/reads', 1);
  const second = read();
  await waitForCount('/requests', 2);
  await fetch(new URL('/release', origin));
  const responses = await Promise.all([first, second]);
  const reads = await (await fetch(new URL("/reads", origin))).text();
  const cached = await read();
  console.log(JSON.stringify({ responses, reads, cached }));
} finally { await worker?.dispose(); }
