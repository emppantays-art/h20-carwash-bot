FROM node:20-slim

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    libxshmfence1 \
    libgbm1 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY index.js ./
COPY database.js ./
COPY src/ ./src/

RUN mkdir -p .wwebjs_auth .wwebjs_auth_prod && chmod -R 777 .wwebjs_auth .wwebjs_auth_prod

EXPOSE 3000
USER node
CMD ["node", "index.js"]