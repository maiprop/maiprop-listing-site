# MaiProp Agent Worker

Stateful AI advisor for the MaiProp mobile app.

## Run locally

```bash
npm install
npm run dev
```

Create `agent-worker/.dev.vars` from `.dev.vars.example` and set `OPENAI_API_KEY`.

The mobile app calls this worker when `EXPO_PUBLIC_MAIPROP_AGENT_URL` is set:

```bash
EXPO_PUBLIC_MAIPROP_AGENT_URL=http://localhost:8787
```

## Deploy

```bash
npm run deploy
wrangler secret put OPENAI_API_KEY
```

The worker exposes:

- `GET /health`
- `POST /api/assistant`
- Cloudflare Agents SDK routes under `/agents/mai-prop-advisor/:session`
