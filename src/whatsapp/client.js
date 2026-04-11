const { Client, LocalAuth } = require('whatsapp-web.js');
const config = require('../config');

class WhatsAppClient {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: config.paths.auth }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    this.isReady = false;
    this.adminWhatsAppId = null;
    this.setupEvents();
  }

  setupEvents() {
    this.client.on('qr', (qr) => this.handleQR(qr));
    this.client.on('ready', () => this.handleReady());
    this.client.on('disconnected', (reason) => this.handleDisconnect(reason));
    this.client.on('auth_failure', (msg) => console.error('Auth failure:', msg));
  }

  handleQR(qr) {
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    
    console.log('\n📱 *SCAN THIS QR CODE WITH WHATSAPP*');
    console.log('👉 Open this link in your browser:');
    console.log(qrImageUrl);
    console.log('(Scan the image from your phone)\n');
  }

  async handleReady() {
    console.log(`✅ ${config.carWashName} Bot ready!`);
    this.isReady = true;
    
    if (config.adminNumber) {
      await this.setupAdmin();
    }
  }

  async setupAdmin() {
    try {
      const cleanNumber = config.adminNumber.replace(/[^0-9]/g, '');
      const contactId = await this.client.getNumberId(cleanNumber);
      
      if (contactId?._serialized) {
        this.adminWhatsAppId = contactId._serialized;
        global.adminWhatsAppId = this.adminWhatsAppId;
        console.log(`✅ Admin: ${this.adminWhatsAppId}`);
        
        if (config.isDevelopment()) {
          await this.client.sendMessage(
            this.adminWhatsAppId,
            `🤖 *${config.carWashName} Bot Online*\nMode: ${config.env}\nSend any message for admin menu.`
          );
        }
      } else {
        console.warn(`⚠️ Admin ${cleanNumber} not found. Have they messaged the bot?`);
      }
    } catch (err) {
      console.error('❌ Admin lookup failed:', err.message);
    }
  }

  handleDisconnect(reason) {
    console.log('Disconnected:', reason);
    this.isReady = false;
    setTimeout(() => this.initialize(), 5000);
  }

  initialize() {
    return this.client.initialize();
  }

  destroy() {
    return this.client.destroy();
  }

  sendMessage(to, message) {
    return this.client.sendMessage(to, message);
  }

  getClient() {
    return this.client;
  }

  isAdmin(userId) {
    return this.adminWhatsAppId && userId === this.adminWhatsAppId;
  }
}

module.exports = WhatsAppClient;