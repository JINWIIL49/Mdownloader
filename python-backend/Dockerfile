FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system runtime packages:
# - ffmpeg: muxes DASH video+audio into a single HD MP4
# - nodejs + npm: bgutil PO Token provider server
# - curl + unzip: needed to install Deno
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        nodejs \
        npm \
        curl \
        unzip \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Deno (required by yt-dlp for JS signature/n-challenge solving since 2025)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL=/root/.deno
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Pre-install EJS challenge solver scripts so they don't need to be downloaded at runtime.
# This caches the scripts into /root/.config/yt-dlp/ inside the image.
RUN python3 -m yt_dlp --js-runtimes node --remote-components-install ejs:github || true

# Copy backend source
COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
