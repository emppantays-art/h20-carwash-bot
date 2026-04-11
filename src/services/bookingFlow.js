const database = require('../../database');
const CustomerMenus = require('../menus/customer');
const { parseHumanDate, isValidFutureDate } = require('../utils/dateParser');
const { isValidPhone, isValidVehicleOption, isValidServiceOption } = require('../utils/validators');
const { formatPhone } = require('../utils/formatters');
const config = require('../config');

class BookingFlow {
  constructor(client, sessionManager) {
    this.client = client;
    this.sessions = sessionManager;
  }

  async start(userId, isAdminBooking = false) {
    this.sessions.create(userId, { step: 'ask_vehicle', isAdminBooking });
    await this.client.sendMessage(userId, CustomerMenus.vehicleSelection());
  }

  async handleStep(userId, text, message) {
    const session = this.sessions.get(userId);
    if (!session) return false;

    const handlers = {
      ask_vehicle: () => this.handleVehicle(userId, text, session),
      ask_name: () => this.handleName(userId, text, session),
      ask_phone: () => this.handlePhone(userId, text, session),
      ask_service: () => this.handleService(userId, text, session),
      ask_date: () => this.handleDate(userId, text, session),
      ask_slot_choice: () => this.handleSlotChoice(userId, text, session)
    };

    const handler = handlers[session.step];
    if (handler) {
      await handler();
      return true;
    }
    
    return false;
  }

  async handleVehicle(userId, text, session) {
    if (!isValidVehicleOption(text)) {
      await this.client.sendMessage(userId, "❌ Please reply with *1* (Small) or *2* (Large).");
      await this.client.sendMessage(userId, CustomerMenus.vehicleSelection());
      return;
    }

    const sizes = { '1': 'small', '2': 'large' };
    this.sessions.update(userId, { 
      vehicleSize: sizes[text],
      step: 'ask_name'
    });
    
    await this.client.sendMessage(userId, `✅ ${sizes[text] === 'small' ? 'Small' : 'Large'} vehicle selected.\n\nWhat's your name?`);
  }

  async handleName(userId, text, session) {
    if (text.length < 2) {
      await this.client.sendMessage(userId, "❌ Please enter your full name (at least 2 characters):");
      return;
    }

    this.sessions.update(userId, { 
      customerName: text,
      step: 'ask_phone'
    });
    
    await this.client.sendMessage(userId, `Thanks ${text}! 📱 Please share your phone number:`);
  }

  async handlePhone(userId, text, session) {
    if (!isValidPhone(text)) {
      await this.client.sendMessage(userId, "❌ Please enter a valid 10-digit phone number:");
      return;
    }

    this.sessions.update(userId, { 
      customerPhone: formatPhone(text),
      step: 'ask_service'
    });
    
    await this.client.sendMessage(userId, CustomerMenus.serviceSelection(session.vehicleSize));
  }

  async handleService(userId, text, session) {
    if (!isValidServiceOption(text)) {
      await this.client.sendMessage(userId, "❌ Please reply with *1*, *2*, or *3*.");
      await this.client.sendMessage(userId, CustomerMenus.serviceSelection(session.vehicleSize));
      return;
    }

    const services = { '1': 'basic', '2': 'full', '3': 'inside' };
    const serviceType = services[text];
    const price = config.getPrice(session.vehicleSize, serviceType);

    this.sessions.update(userId, { 
      serviceType,
      price,
      step: 'ask_date'
    });
    
    await this.client.sendMessage(userId, 
      `✅ ${serviceType === 'basic' ? 'Basic Wash' : serviceType === 'full' ? 'Full Wash' : 'Inside Only'} selected (${config.carWashName})\n\n` +
      `📅 Which date would you like?\nExamples: "tomorrow", "April 10", or "2026-04-10"`
    );
  }

  async handleDate(userId, text, session) {
    const date = parseHumanDate(text);
    
    if (!date) {
      await this.client.sendMessage(userId, "❌ I didn't understand. Try:\n• tomorrow\n• April 10\n• 2026-04-10");
      return;
    }

    if (!isValidFutureDate(date)) {
      await this.client.sendMessage(userId, "❌ Please select a future date.");
      return;
    }

    try {
      await database.generateSlotsForDate(date);
      const availableSlots = await database.getAvailableSlots(date);

      if (availableSlots.length === 0) {
        await this.client.sendMessage(userId, `😔 No slots available on ${date}.\n\nPlease try another date.`);
        return;
      }

      this.sessions.update(userId, { 
        date,
        availableSlots,
        step: 'ask_slot_choice'
      });
      
      await this.client.sendMessage(userId, CustomerMenus.timeSlots(date, availableSlots));
    } catch (err) {
      console.error('Slot fetch error:', err);
      await this.client.sendMessage(userId, "❌ Error loading slots. Please try again.");
    }
  }

  async handleSlotChoice(userId, text, session) {
    const choice = parseInt(text);
    
    if (isNaN(choice) || choice < 1 || choice > session.availableSlots.length) {
      await this.client.sendMessage(userId, `❌ Please reply with a number between *1* and *${session.availableSlots.length}*`);
      await this.client.sendMessage(userId, CustomerMenus.timeSlots(session.date, session.availableSlots));
      return;
    }

    const selectedTime = session.availableSlots[choice - 1];

    try {
      const slotId = await database.isSlotAvailable(session.date, selectedTime);
      
      if (!slotId) {
        await this.handleSlotTaken(userId, session);
        return;
      }

      const booking = await database.bookSlot(
        slotId,
        session.customerName,
        userId,
        session.vehicleSize,
        session.serviceType,
        session.price,
        session.customerPhone
      );

      await this.client.sendMessage(userId, CustomerMenus.bookingConfirmation(booking.bookingId, session, selectedTime));
      
      // Notify admin
      if (global.adminWhatsAppId) {
        const AdminMenus = require('../menus/admin');
        await this.client.sendMessage(
          global.adminWhatsAppId,
          AdminMenus.newBookingNotification(booking.bookingId, session, selectedTime)
        );
      }

      this.sessions.clear(userId);
    } catch (err) {
      if (err.message === 'SLOT_TAKEN' || err.message?.includes('UNIQUE constraint')) {
        await this.handleSlotTaken(userId, session);
      } else {
        console.error('Booking error:', err);
        await this.client.sendMessage(userId, `❌ Booking failed: ${err.message}`);
        this.sessions.clear(userId);
      }
    }
  }

  async handleSlotTaken(userId, session) {
    await this.client.sendMessage(userId, CustomerMenus.slotTakenRefresh());
    try {
      const freshSlots = await database.getAvailableSlots(session.date);
      if (freshSlots.length === 0) {
        await this.client.sendMessage(userId, `😔 No more slots on ${session.date}. Try another date.`);
        this.sessions.update(userId, { step: 'ask_date' });
        return;
      }
      this.sessions.update(userId, { availableSlots: freshSlots });
      await this.client.sendMessage(userId, CustomerMenus.timeSlots(session.date, freshSlots));
    } catch (err) {
      await this.client.sendMessage(userId, "❌ Please send *BOOK* to start over.");
      this.sessions.clear(userId);
    }
  }
}

module.exports = BookingFlow;