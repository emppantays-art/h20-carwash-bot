FROM node:20-slim

# Install Chromium (lightweight, not Google Chrome)
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

# Puppeteer settings (Chrome is pre-installed)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy and install dependencies (using npm install, not ci)
COPY package*.json ./
RUN npm install --omit=dev

# Copy app code
COPY index.js ./
COPY database.js ./
COPY src/ ./src/

# Create auth directories
RUN mkdir -p .wwebjs_auth .wwebjs_auth_prod && chmod -R 777 .wwebjs_auth .wwebjs_auth_prod

# Health check port
EXPOSE 3000

USER node
CMD ["node", "index.js"]