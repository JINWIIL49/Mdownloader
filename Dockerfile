# ==========================================
# Stage 1: Build the Vite React Frontend
# ==========================================
FROM node:20-slim AS frontend-builder
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy frontend source and build
COPY . .
RUN npx vite build

# ==========================================
# Stage 2: Build and run the Unified Python Backend + Node SSR Server
# ==========================================
FROM python:3.11-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Install system dependencies (ffmpeg, openCV library support, Node.js + npm, and curl + unzip for Deno)
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
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Deno (required by yt-dlp for JS signature/n-challenge solving since 2025)
RUN curl -fsSL https://deno.land/install.sh | sh && \
    mv /root/.deno/bin/deno /usr/local/bin/deno && \
    rm -rf /root/.deno

# Install python requirements
COPY python-backend/requirements.txt ./python-backend/requirements.txt
RUN pip install --no-cache-dir -r python-backend/requirements.txt

# Pre-install EJS challenge solver scripts so they don't need to be downloaded at runtime.
# By passing a dummy youtube URL and a custom cache directory, yt-dlp will download the solver
# from github and cache it under /app/.cache/yt-dlp/challenge-solver/lib.json.
RUN python3 -m yt_dlp --cache-dir /app/.cache/yt-dlp --js-runtimes node --remote-components ejs:github --check-formats https://www.youtube.com/watch?v=dQw4w9WgXcQ || true

# Copy node_modules and built dist folder from Stage 1
COPY --from=frontend-builder /app/node_modules ./node_modules
COPY --from=frontend-builder /app/dist ./dist

# Copy api folder, proxy server, and package.json
COPY api ./api
COPY render-server.js ./render-server.js
COPY package.json ./package.json

# Copy python-backend code
COPY python-backend/ ./python-backend/

# Ensure all directories and files under /app are writable by any non-root runner user (e.g. on Render)
RUN chmod -R 777 /app

# Render passes the PORT env var automatically (defaults to 10000)
CMD ["node", "render-server.js"]
