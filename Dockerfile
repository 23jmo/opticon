# --- Build stage ---
FROM node:22-slim AS builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# --- Production stage ---
FROM node:22-slim

# Install Python for agent workers
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY workers/requirements.txt ./workers/
RUN python3 -m venv /app/.venv && \
    /app/.venv/bin/pip install --no-cache-dir -r workers/requirements.txt

# Copy built frontend + source (custom server needs lib/ at runtime)
COPY --from=builder /app/frontend/.next ./.next
COPY --from=builder /app/frontend/public ./public
COPY --from=builder /app/frontend/node_modules ./node_modules
COPY --from=builder /app/frontend/package.json ./package.json
COPY --from=builder /app/frontend/server.ts ./server.ts
COPY --from=builder /app/frontend/next.config.ts ./next.config.ts
COPY --from=builder /app/frontend/lib ./lib
COPY --from=builder /app/frontend/auth.ts ./auth.ts
COPY --from=builder /app/frontend/middleware.ts ./middleware.ts
COPY --from=builder /app/frontend/env.ts ./env.ts
COPY --from=builder /app/frontend/tsconfig.json ./tsconfig.json

# Copy workers
COPY workers/ ./workers/

ENV NODE_ENV=production
ENV PYTHON_PATH=/app/.venv/bin/python3
ENV PROJECT_ROOT=/app
ENV PORT=3000

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
