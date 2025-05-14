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

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential pkg-config python-is-python3

# Add ARG for PUBLIC_BASE_URL at the top of the build stage
ARG PUBLIC_BASE_URL
# Set PUBLIC_BASE_URL as an ENV variable so vite build can access it
ENV PUBLIC_BASE_URL=${PUBLIC_BASE_URL}

# Install node modules
COPY .npmrc bun.lock package.json ./
# Ensure svelte-kit sync runs before build. Modify package.json or run explicitly.
# For now, assuming `bun install` triggers svelte-kit sync or your build script handles it.
RUN bun install

# Copy application code
COPY . .

# Build application
# The PUBLIC_BASE_URL ENV var will be available here
RUN bun --bun run build

# Remove development dependencies
RUN rm -rf node_modules && \
    bun install --ci


# Final stage for app image
FROM base

# Copy built application
COPY --from=build /app/build /app/build
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD [ "bun", "./build/index.js" ]
