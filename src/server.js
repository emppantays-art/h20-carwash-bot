const express = require('express');
const config = require('./config');

class HealthServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.get('/', (req, res) => {
      res.send(`🤖 ${config.carWashName} Bot is running`);
    });

    this.app.get('/health', (req, res) => {
      res.status(200).json({ 
        status: 'ok', 
        env: config.env,
        timestamp: new Date().toISOString()
      });
    });
  }

  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(config.port, '0.0.0.0', () => {
        console.log(`✅ Health check server listening on port ${config.port}`);
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

module.exports = HealthServer;