const database = require('../../database');
const AdminMenus = require('../menus/admin');
const { isValidDateFormat, isValidBookingId, isValidServiceOption } = require('../utils/validators');

class AdminCommands {
  constructor(client, sessionManager) {
    this.client = client;
    this.sessions = sessionManager;
  }

  async getAllBookings(chatId) {
    try {
      const bookings = await database.getAllUpcomingBookings();
      await this.client.sendMessage(chatId, AdminMenus.bookingsList(bookings));
    } catch (err) {
      await this.client.sendMessage(chatId, AdminMenus.error(err.message));
    }
  }

  async getBookingsByDate(chatId, date) {
    if (!isValidDateFormat(date)) {
      await this.client.sendMessage(chatId, AdminMenus.error('Format: BOOKINGS YYYY-MM-DD'));
      return;
    }

    try {
      const bookings = await database.getBookingsForDate(date);
      await this.client.sendMessage(chatId, AdminMenus.bookingsList(bookings, date));
    } catch (err) {
      await this.client.sendMessage(chatId, AdminMenus.error(err.message));
    }
  }

  async cancelBooking(chatId, bookingId) {
    if (!isValidBookingId(bookingId)) {
      await this.client.sendMessage(chatId, AdminMenus.error('Usage: CANCEL <id>'));
      return;
    }

    try {
      await database.cancelBooking(parseInt(bookingId));
      await this.client.sendMessage(chatId, AdminMenus.success(`Booking #${bookingId} cancelled. Slot freed.`));
    } catch (err) {
      await this.client.sendMessage(chatId, AdminMenus.error(err.message));
    }
  }

  async markNoShow(chatId, bookingId) {
    if (!isValidBookingId(bookingId)) {
      await this.client.sendMessage(chatId, AdminMenus.error('Usage: NOSHOW <id>'));
      return;
    }

    try {
      await database.markNoShow(parseInt(bookingId));
      await this.client.sendMessage(chatId, AdminMenus.success(`Booking #${bookingId} marked as no-show.`));
    } catch (err) {
      await this.client.sendMessage(chatId, AdminMenus.error(err.message));
    }
  }

  async checkSlots(chatId, date) {
    if (!isValidDateFormat(date)) {
      await this.client.sendMessage(chatId, AdminMenus.error('Format: SLOTS YYYY-MM-DD'));
      return;
    }

    try {
      await database.generateSlotsForDate(date);
      const available = await database.getAvailableSlots(date);
      if (available.length === 0) {
        await this.client.sendMessage(chatId, `😔 No slots on ${date}.`);
      } else {
        await this.client.sendMessage(chatId, `✅ *${date}*\n${available.join('\n')}`);
      }
    } catch (err) {
      await this.client.sendMessage(chatId, AdminMenus.error(err.message));
    }
  }

  async updateService(chatId, bookingId, option) {
    if (!isValidBookingId(bookingId) || !isValidServiceOption(option)) {
      await this.client.sendMessage(chatId, AdminMenus.error('Format: ID NUMBER (1-3)'));
      return;
    }

    const map = { '1': 'basic', '2': 'full', '3': 'inside' };
    try {
      await database.updateBookingService(parseInt(bookingId), map[option]);
      await this.client.sendMessage(chatId, AdminMenus.success(`Booking #${bookingId} updated`));
    } catch (err) {
      await this.client.sendMessage(chatId, AdminMenus.error(err.message));
    }
  }
}

module.exports = AdminCommands;