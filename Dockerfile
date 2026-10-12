# ==============================================================================
# CaptionCraft Production Dockerfile
# Optimized for Hugging Face Spaces (Free Tier: 2 vCPU, 16 GB RAM) & Linux VPS
# ==============================================================================

FROM node:22-bookworm-slim

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# 1. Install system dependencies:
#    - Chromium for Remotion headless rendering
#    - FFmpeg for audio/video processing and frame muxing
#    - Python 3 and venv for forced-alignment sidecar (stable-ts)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-dejavu-core \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 2. Configure Python virtual environment and install dependencies
#    Use CPU-only PyTorch wheels to keep image lean (< 250MB vs > 2.5GB for CUDA)
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHON_BIN="/opt/venv/bin/python3"

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir stable-ts

# 3. Pre-cache Whisper 'base' model in both root and user caches
RUN mkdir -p /root/.cache/whisper /home/node/.cache/whisper && \
    python3 -c "import stable_whisper; stable_whisper.load_model('base')" && \
    cp -r /root/.cache/whisper/* /home/node/.cache/whisper/ 2>/dev/null || true

# 4. Configure Remotion & Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/chromium

WORKDIR /app

# 5. Install Node dependencies
COPY package.json package-lock.json ./
RUN npm ci

# 6. Copy application source code
COPY . .

# 7. Accept client build-time arguments for Vite bundling
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
ENV VITE_SUPABASE_PROJECT_ID=${VITE_SUPABASE_PROJECT_ID}

# 8. Build the application for Node.js server target
RUN npm run build

# 9. Grant non-root user permissions (Hugging Face Spaces runs as UID 1000)
RUN chown -R node:node /app /opt/venv /home/node

ENV NODE_ENV=production
# Hugging Face Spaces defaults to port 7860
ENV PORT=7860
EXPOSE 7860

USER node

# 10. Start the Nitro Node.js production server
CMD ["node", ".output/server/index.mjs"]
