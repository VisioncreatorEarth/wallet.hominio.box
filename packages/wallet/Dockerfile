# syntax = docker/dockerfile:1

# Adjust BUN_VERSION as desired
ARG BUN_VERSION=1.2.9
FROM oven/bun:${BUN_VERSION}-slim AS base

LABEL fly_launch_runtime="SvelteKit"

# SvelteKit app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"


# Throw-away build stage to reduce size of final image
FROM base AS build
WORKDIR /app

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential pkg-config python-is-python3

# Add ARG for PUBLIC_BASE_URL at the top of the build stage
ARG PUBLIC_BASE_URL
# Set PUBLIC_BASE_URL as an ENV variable so vite build can access it
ENV PUBLIC_BASE_URL=${PUBLIC_BASE_URL}

# Copy package-specific files and root lockfile/npmrc
# Assumes the Docker build context is the MONOREPO ROOT
COPY packages/wallet/package.json ./package.json
COPY bun.lock ./bun.lock
COPY .npmrc ./.npmrc

# Install dependencies based on root lockfile
# Ensure svelte-kit sync runs (usually part of prepare script in package.json, triggered by install)
# We need to set the CWD for bun install to the app directory where package.json now is
RUN bun install # Temporarily removed --frozen-lockfile for diagnostics

# Copy application code from packages/wallet context into the /app directory
COPY packages/wallet/. ./

# Build application
# The PUBLIC_BASE_URL ENV var will be available here
RUN bun --bun run build

# Remove development dependencies and reinstall production ones
RUN rm -rf node_modules && \
    bun install --frozen-lockfile --production


# Final stage for app image
FROM base
WORKDIR /app

# Copy built application and production node_modules
COPY --from=build /app/build ./build/
COPY --from=build /app/node_modules ./node_modules/
COPY --from=build /app/package.json ./

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD [ "bun", "./build/index.js" ]
