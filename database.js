// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'h20.db');
const db = new sqlite3.Database(dbPath);

// Initialize tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS time_slots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slot_date TEXT NOT NULL,
        slot_time TEXT NOT NULL,
        status TEXT DEFAULT 'available',
        UNIQUE(slot_date, slot_time)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS bookings (
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
    )`);

    // Prevent double-booking at database level
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_booking_per_slot ON bookings(slot_id)`);
});

// Generate slots for a given date
function generateSlotsForDate(date) {
    return new Promise((resolve, reject) => {
        const startHour = 10;
        const endHour = 19;
        const minutesList = [0, 20, 40];
        const stmt = db.prepare(`INSERT OR IGNORE INTO time_slots (slot_date, slot_time, status) VALUES (?, ?, 'available')`);
        
        for (let hour = startHour; hour < endHour; hour++) {
            for (let min of minutesList) {
                const time = `${hour.toString().padStart(2,'0')}:${min.toString().padStart(2,'0')}`;
                stmt.run(date, time);
            }
        }
        
        stmt.finalize((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// Check if slot is available
function isSlotAvailable(date, time) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT id FROM time_slots WHERE slot_date = ? AND slot_time = ? AND status = 'available'`, 
            [date, time], 
            (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.id : null);
            }
        );
    });
}

// Book a slot with transaction safety
function bookSlot(slotId, customerName, whatsappId, vehicleSize, serviceType, price, customerPhone) {
    return new Promise((resolve, reject) => {
        // Use serialized mode for this booking operation to prevent race conditions
        db.serialize(() => {
            db.run("BEGIN IMMEDIATE TRANSACTION");
            
            // Double-check slot is still available (locked by transaction)
            db.get(
                `SELECT status FROM time_slots WHERE id = ?`, 
                [slotId], 
                (err, row) => {
                    if (err) {
                        db.run("ROLLBACK");
                        return reject(err);
                    }
                    
                    if (!row || row.status !== 'available') {
                        db.run("ROLLBACK");
                        return reject(new Error('SLOT_TAKEN'));
                    }

                    // Update slot to booked
                    db.run(
                        `UPDATE time_slots SET status = 'booked' WHERE id = ?`, 
                        [slotId], 
                        function(err2) {
                            if (err2) {
                                db.run("ROLLBACK");
                                return reject(err2);
                            }

                            // Insert booking
                            const sql = `INSERT INTO bookings 
                                (slot_id, customer_name, whatsapp_id, customer_phone, vehicle_size, service_type, price, status) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')`;
                            
                            db.run(
                                sql, 
                                [slotId, customerName, whatsappId, customerPhone, vehicleSize, serviceType, price], 
                                function(err3) {
                                    if (err3) {
                                        db.run("ROLLBACK");
                                        // Check if it's the unique constraint error
                                        if (err3.message.includes('UNIQUE constraint failed')) {
                                            return reject(new Error('SLOT_TAKEN'));
                                        }
                                        return reject(err3);
                                    }
                                    
                                    db.run("COMMIT");
                                    resolve({ bookingId: this.lastID, slotId });
                                }
                            );
                        }
                    );
                }
            );
        });
    });
}

// Cancel a booking
function cancelBooking(bookingId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT slot_id FROM bookings WHERE id = ?`, [bookingId], (err, row) => {
            if (err) return reject(err);
            if (!row) return reject(new Error('Booking not found'));
            
            db.run("BEGIN TRANSACTION");
            
            db.run(`UPDATE time_slots SET status = 'available' WHERE id = ?`, [row.slot_id], (err2) => {
                if (err2) {
                    db.run("ROLLBACK");
                    return reject(err2);
                }
                
                db.run(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`, [bookingId], (err3) => {
                    if (err3) {
                        db.run("ROLLBACK");
                        return reject(err3);
                    }
                    
                    db.run("COMMIT");
                    resolve();
                });
            });
        });
    });
}

// Mark as no-show
function markNoShow(bookingId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT slot_id FROM bookings WHERE id = ?`, [bookingId], (err, row) => {
            if (err) return reject(err);
            if (!row) return reject(new Error('Booking not found'));
            
            db.run("BEGIN TRANSACTION");
            
            db.run(`UPDATE time_slots SET status = 'available' WHERE id = ?`, [row.slot_id], (err2) => {
                if (err2) {
                    db.run("ROLLBACK");
                    return reject(err2);
                }
                
                db.run(`UPDATE bookings SET status = 'no_show' WHERE id = ?`, [bookingId], (err3) => {
                    if (err3) {
                        db.run("ROLLBACK");
                        return reject(err3);
                    }
                    
                    db.run("COMMIT");
                    resolve();
                });
            });
        });
    });
}

// Get available slots
function getAvailableSlots(date) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT slot_time FROM time_slots WHERE slot_date = ? AND status = 'available' ORDER BY slot_time`, 
            [date], 
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(r => r.slot_time));
            }
        );
    });
}

// Get bookings for date
function getBookingsForDate(date) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT b.id, b.customer_name, b.customer_phone, b.vehicle_size, 
                   b.service_type, b.price, ts.slot_time, b.status
            FROM bookings b
            JOIN time_slots ts ON b.slot_id = ts.id
            WHERE ts.slot_date = ?
            ORDER BY ts.slot_time
        `;
        db.all(sql, [date], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Get all upcoming bookings
function getAllUpcomingBookings() {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT b.id, b.customer_name, b.customer_phone, b.vehicle_size, 
                   b.service_type, b.price, ts.slot_date, ts.slot_time, b.status
            FROM bookings b
            JOIN time_slots ts ON b.slot_id = ts.id
            WHERE b.status = 'confirmed' AND ts.slot_date >= date('now')
            ORDER BY ts.slot_date, ts.slot_time
        `;
        db.all(sql, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Update booking date (admin edit)
function updateBookingDate(bookingId, newDate) {
    return new Promise((resolve, reject) => {
        // This is complex - you'd need to find a slot on newDate with same time
        // For now, just update the slot reference if exists, or reject
        reject(new Error('Date change requires slot availability check - not implemented in this version'));
    });
}

function updateBookingTime(bookingId, newTime) {
    return new Promise((resolve, reject) => {
        reject(new Error('Time change requires slot availability check - use cancel+rebook for now'));
    });
}

function updateBookingService(bookingId, newService) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE bookings SET service_type = ? WHERE id = ?`,
            [newService, bookingId],
            function(err) {
                if (err) reject(err);
                else if (this.changes === 0) reject(new Error('Booking not found'));
                else resolve();
            }
        );
    });
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
    updateBookingService
};