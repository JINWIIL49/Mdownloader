# ==========================================
# Stage 1: Build the Vite React Frontend
# ==========================================
FROM node:20-slim AS frontend-builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# ==========================================
# Stage 2: Unified Python backend + Node proxy
# ==========================================
FROM python:3.11-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# System deps: ffmpeg for media merging, libsm6/libxext6/libgl1/libglib2.0-0 for OpenCV,
# nodejs for the Node proxy server, curl+unzip for Deno
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsm6 \
    libxext6 \
    libgl1 \
    libglib2.0-0 \
    nodejs \
    npm \
    curl \
    unzip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Deno (required by yt-dlp for JS challenge solving since 2025)
RUN curl -fsSL https://deno.land/install.sh | sh && \
    mv /root/.deno/bin/deno /usr/local/bin/deno && \
    rm -rf /root/.deno

# Python dependencies
COPY python-backend/requirements.txt ./python-backend/requirements.txt
RUN pip install --no-cache-dir -r python-backend/requirements.txt

# Pre-cache yt-dlp EJS challenge solver (avoids first-run downloads at runtime)
RUN python3 -m yt_dlp --cache-dir /app/.cache/yt-dlp \
    --js-runtimes node \
    --remote-components ejs:github \
    --check-formats "https://www.youtube.com/watch?v=dQw4w9WgXcQ" || true

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/dist ./dist

# Copy Node proxy entry point and package.json (for ESM type declaration)
COPY render-server.js ./render-server.js
COPY package.json ./package.json

# Copy Python backend
COPY python-backend/ ./python-backend/

# Writable temp dir for downloads
RUN chmod -R 777 /app

# Render / Heroku / Railway provide $PORT at runtime (default 10000 on Render free tier)
CMD ["node", "render-server.js"]
