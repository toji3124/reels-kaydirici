FROM node:20-bookworm-slim

# Sistem bağımlılıkları (Python, FFmpeg, Curl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# En güncel yt-dlp Linux sürümünü yükle
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Node bağımlılıklarını kur
COPY package*.json ./
RUN npm install --omit=dev

# Uygulama dosyalarını kopyala
COPY server.js ./
COPY public ./public
COPY thumbnails ./thumbnails

# Klasörleri oluştur
RUN mkdir -p downloads/instagram downloads/tiktok downloads/youtube downloads/twitter thumbnails

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
