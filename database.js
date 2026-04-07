// database.js (better-sqlite3 version)
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'h20.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for better concurrency
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Initialize tables (same schema as yours)
db.exec(`
  CREATE TABLE IF NOT EXISTS time_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_date TEXT NOT NULL,
    slot_time TEXT NOT NULL,
    status TEXT DEFAULT 'available',
    UNIQUE(slot_date, slot_time)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id INTEGER NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    whatsapp_id TEXT,
    vehicle_size TEXT,
    service_type TEXT,
    price INTEGER,
    booking_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'confirmed',
    FOREIGN KEY(slot_id) REFERENCES time_slots(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_booking_per_slot ON bookings(slot_id);
`);

// Helper to generate slots for a date (idempotent)
function generateSlotsForDate(date) {
  const startHour = 10;
  const endHour = 19;
  const minutesList = [0, 20, 40];
  const slots = [];
  for (let hour = startHour; hour < endHour; hour++) {
    for (let min of minutesList) {
      slots.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
    }
  }
  const insertStmt = db.prepare(`INSERT OR IGNORE INTO time_slots (slot_date, slot_time, status) VALUES (?, ?, 'available')`);
  const insertMany = db.transaction((date, slots) => {
    for (const time of slots) insertStmt.run(date, time);
  });
  insertMany(date, slots);
}

// Check if a specific slot is available, returns slot_id or null
function isSlotAvailable(date, time) {
  const row = db.prepare(`SELECT id FROM time_slots WHERE slot_date = ? AND slot_time = ? AND status = 'available'`).get(date, time);
  return row ? row.id : null;
}

// Book a slot – atomic transaction (synchronous)
function bookSlot(slotId, customerName, whatsappId, vehicleSize, serviceType, price, customerPhone) {
  return db.transaction(() => {
    // Double-check slot is still available
    const slot = db.prepare(`SELECT status FROM time_slots WHERE id = ? AND status = 'available'`).get(slotId);
    if (!slot) throw new Error('SLOT_TAKEN');

    // Update slot to booked
    db.prepare(`UPDATE time_slots SET status = 'booked' WHERE id = ?`).run(slotId);

    // Insert booking
    const info = db.prepare(`
      INSERT INTO bookings (slot_id, customer_name, whatsapp_id, customer_phone, vehicle_size, service_type, price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(slotId, customerName, whatsappId, customerPhone, vehicleSize, serviceType, price);

    return { bookingId: info.lastInsertRowid, slotId };
  })();
}

// Cancel a booking
function cancelBooking(bookingId) {
  db.transaction(() => {
    const booking = db.prepare(`SELECT slot_id FROM bookings WHERE id = ?`).get(bookingId);
    if (!booking) throw new Error('Booking not found');
    db.prepare(`UPDATE time_slots SET status = 'available' WHERE id = ?`).run(booking.slot_id);
    db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(bookingId);
  })();
}

// Mark as no-show
function markNoShow(bookingId) {
  db.transaction(() => {
    const booking = db.prepare(`SELECT slot_id FROM bookings WHERE id = ?`).get(bookingId);
    if (!booking) throw new Error('Booking not found');
    db.prepare(`UPDATE time_slots SET status = 'available' WHERE id = ?`).run(booking.slot_id);
    db.prepare(`UPDATE bookings SET status = 'no_show' WHERE id = ?`).run(bookingId);
  })();
}

// Get available slots for a date
function getAvailableSlots(date) {
  const rows = db.prepare(`SELECT slot_time FROM time_slots WHERE slot_date = ? AND status = 'available' ORDER BY slot_time`).all(date);
  return rows.map(r => r.slot_time);
}

// Get bookings for a specific date
function getBookingsForDate(date) {
  return db.prepare(`
    SELECT b.id, b.customer_name, b.customer_phone, b.vehicle_size, b.service_type, b.price, ts.slot_time, b.status
    FROM bookings b
    JOIN time_slots ts ON b.slot_id = ts.id
    WHERE ts.slot_date = ?
    ORDER BY ts.slot_time
  `).all(date);
}

// Get all upcoming bookings (today and future)
function getAllUpcomingBookings() {
  const today = new Date().toISOString().slice(0, 10);
  return db.prepare(`
    SELECT b.id, b.customer_name, b.customer_phone, b.vehicle_size, b.service_type, b.price,
           ts.slot_date, ts.slot_time, b.status
    FROM bookings b
    JOIN time_slots ts ON b.slot_id = ts.id
    WHERE b.status = 'confirmed' AND ts.slot_date >= ?
    ORDER BY ts.slot_date, ts.slot_time
  `).all(today);
}

// Update booking date (simple – changes the slot's date; assumes same time is free on new date)
function updateBookingDate(bookingId, newDate) {
  const booking = db.prepare(`SELECT slot_id FROM bookings WHERE id = ?`).get(bookingId);
  if (!booking) throw new Error('Booking not found');
  db.prepare(`UPDATE time_slots SET slot_date = ? WHERE id = ?`).run(newDate, booking.slot_id);
}

// Update booking time (changes the slot's time; assumes same date slot is free)
function updateBookingTime(bookingId, newTime) {
  const booking = db.prepare(`SELECT slot_id FROM bookings WHERE id = ?`).get(bookingId);
  if (!booking) throw new Error('Booking not found');
  db.prepare(`UPDATE time_slots SET slot_time = ? WHERE id = ?`).run(newTime, booking.slot_id);
}

// Update booking service type and recalc price
function updateBookingService(bookingId, newService) {
  const booking = db.prepare(`SELECT vehicle_size FROM bookings WHERE id = ?`).get(bookingId);
  if (!booking) throw new Error('Booking not found');
  const prices = {
    small: { basic: 200, full: 400, inside: 200 },
    large: { basic: 300, full: 600, inside: 300 }
  };
  const newPrice = prices[booking.vehicle_size][newService];
  if (!newPrice) throw new Error('Invalid service type');
  db.prepare(`UPDATE bookings SET service_type = ?, price = ? WHERE id = ?`).run(newService, newPrice, bookingId);
}

// Optional: get overdue confirmed bookings (for no‑show auto‑canceller)
function getOverdueConfirmedBookings() {
  return db.prepare(`
    SELECT b.id, b.customer_name, b.customer_phone, ts.slot_date, ts.slot_time
    FROM bookings b
    JOIN time_slots ts ON b.slot_id = ts.id
    WHERE b.status = 'confirmed'
      AND (ts.slot_date < date('now') OR (ts.slot_date = date('now') AND ts.slot_time <= time('now', '-1 hour')))
  `).all();
}

module.exports = {
  generateSlotsForDate,
  isSlotAvailable,
  bookSlot,
  cancelBooking,
  markNoShow,
  getAvailableSlots,
  getBookingsForDate,
  getAllUpcomingBookings,
  updateBookingDate,
  updateBookingTime,
  updateBookingService,
  getOverdueConfirmedBookings
};