# Development Dockerfile — for local dev and CI reproducibility.
# NOT used in production (Cloudflare Pages handles builds + hosting).
#
# Usage:
#   docker build -t maiprop-dev .
#   docker run -p 8080:8080 --env-file .env maiprop-dev

FROM node:20.19.5-slim AS base

WORKDIR /app

ARG DENO_VERSION=2.7.12

# Install Deno for edge function development.
RUN apt-get update && apt-get install -y curl unzip && \
    curl -fsSL https://deno.land/install.sh | sh -s "v${DENO_VERSION}" && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Expose dev server port
EXPOSE 8080

# Default: start dev server
CMD ["npm", "run", "dev"]
