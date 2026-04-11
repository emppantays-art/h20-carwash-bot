const CustomerMenus = require('../menus/customer');
const AdminMenus = require('../menus/admin');
const BookingFlow = require('../services/bookingFlow');
const AdminCommands = require('../services/adminCommands');
const AdminFlow = require('../services/adminFlow');
const sessionManager = require('../services/sessionManager');
const { isValidDateFormat } = require('../utils/validators');

class MessageHandler {
  constructor(whatsappClient) {
    this.client = whatsappClient;
    this.bookingFlow = new BookingFlow(this.client, sessionManager);
    this.adminCommands = new AdminCommands(this.client, sessionManager);
    this.adminFlow = new AdminFlow(this.client, sessionManager, this.adminCommands);
    
    this.setupHandler();
  }

  setupHandler() {
    this.client.getClient().on('message', async (message) => {
      if (!this.client.isReady || message.fromMe) return;
      
      await this.handleMessage(message);
    });
  }

  async handleMessage(message) {
    const userId = message.from;
    let text = message.body?.trim().toLowerCase() || '';
    
    // Reset timer for active sessions
    if (sessionManager.get(userId)) {
      sessionManager.resetTimer(userId, this.client.getClient());
    }

    // Check active customer booking session first
    const hasActiveSession = await this.bookingFlow.handleStep(userId, text, message);
    if (hasActiveSession) return;

    // Check if admin
    if (this.client.isAdmin(userId)) {
      await this.handleAdminMessage(userId, text, message);
      return;
    }

    // Handle customer public commands
    await this.handleCustomerMessage(userId, text, message);
  }

  async handleAdminMessage(userId, text, message) {
    // Direct commands first
    if (text === 'bookings') {
      await this.adminCommands.getAllBookings(userId);
      return;
    }

    if (text.startsWith('bookings ')) {
      const date = text.split(' ')[1];
      await this.adminCommands.getBookingsByDate(userId, date);
      return;
    }

    if (text.startsWith('cancel ')) {
      const id = text.split(' ')[1];
      await this.adminCommands.cancelBooking(userId, id);
      return;
    }

    if (text.startsWith('noshow ')) {
      const id = text.split(' ')[1];
      await this.adminCommands.markNoShow(userId, id);
      return;
    }

    if (text.startsWith('slots ')) {
      const date = text.split(' ')[1];
      await this.adminCommands.checkSlots(userId, date);
      return;
    }

    // Menu state machine
    const adminSession = sessionManager.get(userId);
    
    if (!adminSession?.step || adminSession.step === 'main_menu') {
      const result = await this.adminFlow.handleMainMenu(userId, text);
      if (result === 'NEW_BOOKING') {
        await this.bookingFlow.start(userId, true);
      }
      return;
    }

    if (adminSession.step === 'manage_menu') {
      await this.adminFlow.handleManageMenu(userId, text);
      return;
    }

    // Handle sub-steps (view_by_date, cancel_booking, etc.)
    await this.adminFlow.handleManageSteps(userId, text);
  }

  async handleCustomerMessage(userId, text, message) {
    // Commands
    if (text === 'book' || text === 'booking') {
      await this.bookingFlow.start(userId);
      return;
    }

    if (text === 'slots') {
      await message.reply("📅 Send: SLOTS YYYY-MM-DD\ne.g., SLOTS 2026-04-10");
      return;
    }

    if (text.startsWith('slots ')) {
      const date = text.split(' ')[1];
      if (!isValidDateFormat(date)) {
        await message.reply("❌ Format: SLOTS YYYY-MM-DD");
        return;
      }
      await this.adminCommands.checkSlots(userId, date);
      return;
    }

    if (text === 'help' || text === 'menu') {
      await this.client.sendMessage(userId, CustomerMenus.welcome());
      return;
    }

    // Default
    await this.client.sendMessage(userId, CustomerMenus.welcome());
  }
}

module.exports = MessageHandler;