FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

RUN npx playwright install --with-deps chromium

RUN npm run build

EXPOSE 8787

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

CMD ["node", "dist/server.js"]
