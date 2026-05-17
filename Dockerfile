# Multi-stage Dockerfile for the Vite app.
#
# Production image:
#   docker build -t maiprop-listing-site .
#   docker run -p 8080:8080 maiprop-listing-site
#
# Development image with Node and Deno:
#   docker build --target dev -t maiprop-listing-site-dev .
#   docker run -p 8080:8080 --env-file .env maiprop-listing-site-dev

ARG NODE_VERSION=20.19.5
ARG DENO_VERSION=2.7.12

FROM denoland/deno:bin-${DENO_VERSION} AS deno-bin

FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app
ENV HUSKY=0

FROM base AS deps
COPY package.json package-lock.json ./
COPY scripts/check-runtime.mjs ./scripts/check-runtime.mjs
RUN npm run check:runtime && npm ci

FROM deps AS build
ARG APP_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
ARG APP_SUPABASE_PUBLIC=sb_publishable_ci_placeholder_not_real
ARG APP_SUPABASE_PROJECT=abcdefghijklmnop
COPY . .
RUN VITE_SUPABASE_URL="${APP_SUPABASE_URL}" \
    VITE_SUPABASE_PUBLISHABLE_KEY="${APP_SUPABASE_PUBLIC}" \
    VITE_SUPABASE_PROJECT_ID="${APP_SUPABASE_PROJECT}" \
    npm run build

FROM deps AS dev
COPY --from=deno-bin /deno /usr/local/bin/deno
ENV DENO_INSTALL=/home/node/.deno
ENV PATH="${DENO_INSTALL}/bin:${PATH}"
COPY . .
RUN chown -R node:node /app
USER node
EXPOSE 8080
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8080"]

FROM nginxinc/nginx-unprivileged:1.27-alpine AS production
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
