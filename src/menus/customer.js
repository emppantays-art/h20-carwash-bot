const config = require('../config');
const { formatVehicleSize, formatServiceType, formatCurrency } = require('../utils/formatters');
const { VEHICLE_TYPES } = require('../config/constants');

class CustomerMenus {
  static welcome() {
    return `🚗 *Welcome to ${config.carWashName}!* 🚗

*Services & Prices:*

🚗 *Small Vehicle* (Car/Hatchback):
   1️⃣ Basic Wash (Outside) - ₹200
   2️⃣ Full Wash (In+Out) - ₹400
   3️⃣ Inside Only - ₹200

🚙 *Large Vehicle* (SUV/Truck/Van):
   1️⃣ Basic Wash (Outside) - ₹300
   2️⃣ Full Wash (In+Out) - ₹600
   3️⃣ Inside Only - ₹300

*Quick Commands:*
📅 Send *BOOK* to make appointment
🔍 Send *SLOTS* to check availability
❓ Send *HELP* to see this menu`;
  }

  static vehicleSelection() {
    return `🚗 *Select Your Vehicle Type*

1️⃣ ${VEHICLE_TYPES.small.label}
   └ ${VEHICLE_TYPES.small.desc}
   └ Prices: ₹200 - ₹400

2️⃣ ${VEHICLE_TYPES.large.label}
   └ ${VEHICLE_TYPES.large.desc}
   └ Prices: ₹300 - ₹600

Reply with *1* or *2*`;
  }

  static serviceSelection(vehicleSize) {
    const prices = {
      basic: config.getPrice(vehicleSize, 'basic'),
      full: config.getPrice(vehicleSize, 'full'),
      inside: config.getPrice(vehicleSize, 'inside')
    };

    return `✨ *Select Service for ${formatVehicleSize(vehicleSize)}*

1️⃣ *Basic Wash* (Outside only)
   ${formatCurrency(prices.basic)}
   ✓ Exterior wash & dry

2️⃣ *Full Wash* (Complete)
   ${formatCurrency(prices.full)}
   ✓ Exterior + Interior cleaning

3️⃣ *Inside Only*
   ${formatCurrency(prices.inside)}
   ✓ Interior vacuum & wipe

Reply with *1*, *2*, or *3*`;
  }

  static timeSlots(date, availableSlots) {
    let text = `📅 *Available Slots for ${date}*\n\n`;
    
    const grouped = this.groupSlotsByTime(availableSlots);
    
    Object.entries(grouped).forEach(([period, slots]) => {
      if (slots.length > 0) {
        const icons = { morning: '🌅', afternoon: '☀️', evening: '🌆' };
        text += `*${icons[period]} ${period.charAt(0).toUpperCase() + period.slice(1)}*\n`;
        slots.forEach((slot, idx) => {
          const globalIdx = availableSlots.indexOf(slot) + 1;
          text += `${globalIdx}. ${slot}\n`;
        });
        text += '\n';
      }
    });
    
    text += `Reply with the *number* of your preferred time slot`;
    return text;
  }

  static groupSlotsByTime(slots) {
    return {
      morning: slots.filter(t => parseInt(t) < 12),
      afternoon: slots.filter(t => parseInt(t) >= 12 && parseInt(t) < 17),
      evening: slots.filter(t => parseInt(t) >= 17)
    };
  }

  static bookingConfirmation(bookingId, session, selectedTime) {
    return `✅ *BOOKING CONFIRMED!*

📋 *Booking ID:* #${bookingId}
👤 *Name:* ${session.customerName}
📞 *Phone:* ${session.customerPhone}
🚗 *Vehicle:* ${formatVehicleSize(session.vehicleSize)}
🛠️ *Service:* ${formatServiceType(session.serviceType)}
💰 *Price:* ${formatCurrency(session.price)}
📅 *Date:* ${session.date}
⏰ *Time:* ${selectedTime}

📍 *Location:* [Your Address]
💵 *Payment:* Cash/UPI/Card on arrival

⚠️ *Important:* Arrive 10 mins early. 1 hour late = slot cancelled.

To book again, send *BOOK*`;
  }

  static sessionExpired() {
    return '⌛ Session expired. Send *BOOK* to start again.';
  }

  static slotTakenRefresh() {
    return '⚠️ That slot was just taken! Refreshing...';
  }
}

module.exports = CustomerMenus;