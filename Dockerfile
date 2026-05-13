# DTS worker image — runs scripts/worker.ts as a long-running Node process.
# Built remotely on Fly.io, so target platform = linux/amd64.

FROM node:20-alpine

WORKDIR /app

# Install OpenSSL (Prisma needs it on Alpine for its query engine).
RUN apk add --no-cache openssl

# Install deps. Lockfile-aware install for reproducibility.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Generate Prisma client AFTER the schema is in place but BEFORE we copy the
# rest of the source — this keeps the docker layer cache happy when only app
# code changes (most common case).
COPY prisma ./prisma
RUN npx prisma generate

# Now copy the rest of the source.
COPY . .

# Worker is headless — no exposed port.
CMD ["npm", "run", "worker"]
