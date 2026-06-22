# ==============================================================================
# GrindSpace Docker Production Configuration
# Multi-stage build to keep the image slim and secure
# ==============================================================================

# --- Stage 1: Build Dependencies ---
FROM node:20-bookworm-slim AS builder

# Install build dependencies for native modules (like sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy dependency manifests
COPY package*.json ./

# Clean-install production dependencies (ignores devDependencies)
RUN npm ci --omit=dev

# --- Stage 2: Production Runner ---
FROM node:20-bookworm-slim

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /usr/src/app

# Copy production node_modules from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./

# Copy application source code
COPY . .

# Expose internal port
EXPOSE 3000

# Run server.js on startup
CMD ["node", "server.js"]
