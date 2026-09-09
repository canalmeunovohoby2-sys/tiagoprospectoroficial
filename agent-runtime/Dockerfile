FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN rm -rf /var/lib/apt/lists/* \
  && apt-get update -o Acquire::Retries=5 -o Acquire::http::Timeout=30 -o Acquire::ForceIPv4=true \
  && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    apt-transport-https \
    curl \
  && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
  && sh -c 'echo "deb [arch=amd64] https://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list' \
  && (for i in 1 2 3 4; do \
       rm -rf /var/lib/apt/lists/*; \
       if apt-get update -o Acquire::Retries=5 -o Acquire::http::Timeout=30 -o Acquire::ForceIPv4=true; then break; fi; \
       echo "google-chrome repo update retry $i"; sleep 5; \
     done) \
  && apt-get install -y \
    google-chrome-stable \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libfreetype6 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libharfbuzz0b \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    libxrender1 \
    libxtst6 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y nodejs \
  && npm install -g npm@latest

COPY package*.json ./
RUN npm ci --ignore-scripts
# ffmpeg-static baixa o binário no install script, que o --ignore-scripts acima pula:
# garante o binário compilado para gerar o MP4 (FASE 14) em produção.
RUN node node_modules/ffmpeg-static/install.js

COPY . .

RUN npm install playwright \
  && npx playwright install chromium \
  && npx playwright install-deps chromium || true

RUN npm run build

EXPOSE 8787

CMD ["node", "dist/server.js"]
