FROM node:20-slim

# Install Python, build tools, and Chromium
RUN apt-get update && apt-get install -y \
    python3 \
    python3-distutils \
    build-essential \
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

# Environment settings
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PYTHON=/usr/bin/python3

WORKDIR /app

# Copy and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY index.js ./
COPY database.js ./
COPY src/ ./src/

# Create directories and set permissions for node user
RUN mkdir -p .wwebjs_auth .wwebjs_auth_prod && \
    chmod -R 777 .wwebjs_auth .wwebjs_auth_prod && \
    chown -R node:node /app

# Switch to non-root user
USER node

# Expose health check port
EXPOSE 3000

# Start the bot
CMD ["node", "index.js"]