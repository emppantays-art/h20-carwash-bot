const AdminMenus = require('../menus/admin');
const { isValidDateFormat, isValidBookingId, isValidServiceOption } = require('../utils/validators');

class AdminFlow {
  constructor(client, sessionManager, commands) {
    this.client = client;
    this.sessions = sessionManager;
    this.commands = commands;
  }

  async handleMainMenu(userId, text) {
    switch (text) {
      case '1':
      case 'book':
      case 'booking':
        return 'NEW_BOOKING';
      case '2':
        await this.commands.getAllBookings(userId);
        return true;
      case '3':
        this.sessions.setAdminSession(userId, { step: 'manage_menu' });
        await this.client.sendMessage(userId, AdminMenus.manage());
        return true;
      case '4':
        await this.client.sendMessage(userId, "📅 Send: SLOTS YYYY-MM-DD\ne.g., SLOTS 2026-04-10");
        return true;
      default:
        await this.client.sendMessage(userId, AdminMenus.main());
        return true;
    }
  }

  async handleManageMenu(userId, text) {
    const session = this.sessions.get(userId);
    
    switch (text) {
      case '1':
        session.step = 'view_by_date';
        await this.client.sendMessage(userId, "📅 Enter date (YYYY-MM-DD):");
        return true;
      case '2':
        session.step = 'cancel_booking';
        await this.client.sendMessage(userId, "❌ Enter Booking ID to cancel:");
        return true;
      case '3':
        session.step = 'noshow_booking';
        await this.client.sendMessage(userId, "⚠️ Enter Booking ID for no-show:");
        return true;
      case '4':
        session.step = 'edit_service';
        await this.client.sendMessage(userId, "✏️ Enter: BOOKING_ID SERVICE_NUMBER\n(e.g., 123 2 for Full Wash)");
        return true;
      case '5':
        this.sessions.deleteAdminSession(userId);
        await this.client.sendMessage(userId, AdminMenus.main());
        return true;
      default:
        await this.client.sendMessage(userId, "❌ Reply with 1-5");
        return true;
    }
  }

  async handleManageSteps(userId, text) {
    const session = this.sessions.get(userId);
    const step = session?.step;

    if (step === 'view_by_date') {
      if (!isValidDateFormat(text)) {
        await this.client.sendMessage(userId, "❌ Use YYYY-MM-DD");
      } else {
        await this.commands.getBookingsByDate(userId, text);
      }
      session.step = 'manage_menu';
      await this.client.sendMessage(userId, AdminMenus.manage());
      return true;
    }

    if (step === 'cancel_booking') {
      if (!isValidBookingId(text)) {
        await this.client.sendMessage(userId, "❌ Invalid ID");
      } else {
        await this.commands.cancelBooking(userId, parseInt(text));
      }
      session.step = 'manage_menu';
      await this.client.sendMessage(userId, AdminMenus.manage());
      return true;
    }

    if (step === 'noshow_booking') {
      if (!isValidBookingId(text)) {
        await this.client.sendMessage(userId, "❌ Invalid ID");
      } else {
        await this.commands.markNoShow(userId, parseInt(text));
      }
      session.step = 'manage_menu';
      await this.client.sendMessage(userId, AdminMenus.manage());
      return true;
    }

    if (step === 'edit_service') {
      const parts = text.split(' ');
      const id = parts[0];
      const opt = parts[1];
      
      if (!isValidBookingId(id) || !isValidServiceOption(opt)) {
        await this.client.sendMessage(userId, "❌ Format: ID NUMBER (1-3)");
      } else {
        await this.commands.updateService(userId, id, opt);
      }
      session.step = 'manage_menu';
      await this.client.sendMessage(userId, AdminMenus.manage());
      return true;
    }

    return false;
  }
}

module.exports = AdminFlow;