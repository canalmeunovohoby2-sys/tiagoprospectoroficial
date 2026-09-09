FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update -o Acquire::Retries=5 -o Acquire::http::Timeout=30 \
  && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    apt-transport-https \
    curl \
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
  && npx playwright install-deps chromium

RUN npm run build

EXPOSE 8787

CMD ["node", "dist/server.js"]
