# Stage 1: Build Frontend (Vite)
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for UI
COPY package*.json ./
COPY ui/package*.json ./ui/

WORKDIR /app/ui
RUN npm install

WORKDIR /app
COPY . .

# Build Vite frontend bundle to ui/dist
WORKDIR /app/ui
RUN npm run build

# Stage 2: Production Server Runtime
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80
ENV WORKSPACE_ROOT=/workspace
ENV DATA_DIR=/app/data

# Install server dependencies
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install --omit=dev

WORKDIR /app

# Copy server code, scripts, schemas, and built UI
COPY server/ ./server/
COPY scripts/ ./scripts/
COPY schemas/ ./schemas/
COPY package*.json ./
COPY --from=builder /app/ui/dist ./ui/dist

EXPOSE 80

CMD ["node", "server/src/index.js"]
