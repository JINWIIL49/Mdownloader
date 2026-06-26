# Dockerfile for Node.js SSR/Vite frontend
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --frozen-lockfile || npm install
COPY . .
RUN npm run build

# --- Production image ---
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/vite.config.ts ./
COPY --from=builder /app/.env* ./

# Expose SSR port
EXPOSE 3000

# Start SSR server (adjust if your entry is different)
CMD ["npm", "run", "preview", "--", "--port", "3000", "--host", "0.0.0.0"]
