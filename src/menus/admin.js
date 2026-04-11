const config = require('../config');

class AdminMenus {
  static main() {
    return `👑 *Admin Menu*

1️⃣ *New Booking*
   └ Book as customer

2️⃣ *View Upcoming*
   └ See all future bookings

3️⃣ *Manage Bookings*
   └ Cancel, Edit, No-show

4️⃣ *Check Slots*
   └ Availability by date

*Quick Commands:*
• BOOKINGS (all upcoming)
• BOOKINGS 2026-04-10 (specific date)
• CANCEL 123
• NOSHOW 123

Reply with *1-4* or use commands above`;
  }

  static manage() {
    return `⚙️ *Manage Bookings*

1️⃣ View by Date
2️⃣ Cancel Booking
3️⃣ Mark No-Show
4️⃣ Edit Service
5️⃣ Back to Main Menu

Reply with *1-5*`;
  }

  static newBookingNotification(bookingId, session, selectedTime) {
    return `🆕 *NEW BOOKING #${bookingId}*

👤 ${session.customerName}
📞 ${session.customerPhone}
🚗 ${session.vehicleSize} | ${session.serviceType}
📅 ${session.date} | ⏰ ${selectedTime}
💰 ₹${session.price}

Commands: CANCEL ${bookingId} | NOSHOW ${bookingId}`;
  }

  static bookingsList(bookings, date = null) {
    if (bookings.length === 0) {
      return date ? `📭 No bookings on ${date}.` : '📭 No upcoming bookings.';
    }
    
    let text = date ? `📋 *${date}*\n\n` : '📋 *Upcoming Bookings*\n\n';
    bookings.forEach(b => {
      text += `#${b.id} | ${date ? b.slot_time : `${b.slot_date} ${b.slot_time}`} | ${b.customer_name} | ${b.status}\n`;
    });
    return text;
  }

  static error(msg) {
    return `❌ ${msg}`;
  }

  static success(msg) {
    return `✅ ${msg}`;
  }
}

module.exports = AdminMenus;