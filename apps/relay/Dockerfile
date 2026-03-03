# ─── Build stage ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# ─── Production stage ────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Copy package file and install production deps only
COPY package.json ./
RUN npm install --omit=dev

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Expose SMTP and health check ports
EXPOSE 25 3001

# Run the relay server
CMD ["node", "dist/index.js"]
