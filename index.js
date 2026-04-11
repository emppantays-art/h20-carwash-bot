const HealthServer = require('./src/server');
const WhatsAppClient = require('./src/whatsapp/client');
const MessageHandler = require('./src/whatsapp/handlers');

async function main() {
  // Start health check server (for Render)
  const server = new HealthServer();
  await server.start();

  // Initialize WhatsApp
  const whatsapp = new WhatsAppClient();
  const handler = new MessageHandler(whatsapp);

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down...`);
    await whatsapp.destroy();
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  // Start WhatsApp
  await whatsapp.initialize();
}

main().catch(console.error);