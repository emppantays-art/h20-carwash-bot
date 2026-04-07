require('dotenv').config({ path: `.env.${process.env.ENV || 'development'}` });
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const chrono = require('chrono-node');
const config = require('./config.js');

const {
    generateSlotsForDate,
    isSlotAvailable,
    bookSlot,
    cancelBooking,
    markNoShow,
    getAvailableSlots,
    getBookingsForDate,
    getAllUpcomingBookings,
    updateBookingService
} = require('./database.js');

// ---------- EXPRESS HEALTH CHECK SERVER (for Render) ----------
const express = require('express');
const healthApp = express();
const PORT = process.env.PORT || 3000;

healthApp.get('/', (req, res) => {
    res.send(`🤖 ${config.carWashName} Bot is running`);
});
healthApp.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', env: config.env });
});

const server = healthApp.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Health check server listening on port ${PORT}`);
});
// --------------------------------------------------------------

const CAR_WASH_NAME = config.carWashName;
const ADMIN_NUMBER = config.adminNumber;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: config.isProduction() ? './.wwebjs_auth_prod' : './.wwebjs_auth'
    }),
    puppeteer: { 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

let isReady = false;
let adminWhatsAppId = null;
const sessions = new Map();        
const adminSessions = new Map();   
const sessionTimers = new Map();   

function getPrice(vehicleSize, serviceType) {
    const prices = {
        small: { basic: 200, full: 400, inside: 200 },
        large: { basic: 300, full: 600, inside: 300 }
    };
    return prices[vehicleSize]?.[serviceType] || 0;
}

function parseHumanDate(input) {
    if (!input || typeof input !== 'string') return null;
    input = input.trim();
    
    let parsedDate = chrono.parseDate(input, new Date(), { forwardDate: true });
    if (parsedDate) return parsedDate.toISOString().split('T')[0];
    
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
        const date = new Date(input);
        if (!isNaN(date.getTime())) return input;
    }
    return null;
}

function formatVehicleSize(size) {
    return size === 'small' ? 'Small' : 'Large';
}

function formatServiceType(type) {
    const services = {
        basic: 'Basic Wash (outside only)',
        full: 'Full Wash (outside + inside)',
        inside: 'Inside Only'
    };
    return services[type] || type;
}

function clearSession(userId) {
    if (sessionTimers.has(userId)) {
        clearTimeout(sessionTimers.get(userId));
    }
    sessions.delete(userId);
    adminSessions.delete(userId);
    sessionTimers.delete(userId);
}

function resetSessionTimer(userId) {
    if (sessionTimers.has(userId)) {
        clearTimeout(sessionTimers.get(userId));
    }
    
    const timer = setTimeout(() => {
        sessions.delete(userId);
        adminSessions.delete(userId);
        sessionTimers.delete(userId);
        client.sendMessage(userId, '⌛ Session expired. Send *BOOK* to start again.');
    }, SESSION_TIMEOUT_MS);
    
    sessionTimers.set(userId, timer);
}

// ---------- TEXT-BASED MENUS ----------

async function sendWelcomeMenu(chatId) {
    const text = 
        `🚗 *Welcome to ${CAR_WASH_NAME}!* 🚗\n\n` +
        `*Services & Prices:*\n\n` +
        `🚗 *Small Vehicle* (Car/Hatchback):\n` +
        `   1️⃣ Basic Wash (Outside) - ₹200\n` +
        `   2️⃣ Full Wash (In+Out) - ₹400\n` +
        `   3️⃣ Inside Only - ₹200\n\n` +
        `🚙 *Large Vehicle* (SUV/Truck/Van):\n` +
        `   1️⃣ Basic Wash (Outside) - ₹300\n` +
        `   2️⃣ Full Wash (In+Out) - ₹600\n` +
        `   3️⃣ Inside Only - ₹300\n\n` +
        `*Quick Commands:*\n` +
        `📅 Send *BOOK* to make appointment\n` +
        `🔍 Send *SLOTS* to check availability\n` +
        `❓ Send *HELP* to see this menu`;
    
    await client.sendMessage(chatId, text);
}

async function sendVehicleMenu(chatId) {
    const text = 
        `🚗 *Select Your Vehicle Type*\n\n` +
        `1️⃣ Small Vehicle\n` +
        `   └ Cars, Hatchbacks, Sedans\n` +
        `   └ Prices: ₹200 - ₹400\n\n` +
        `2️⃣ Large Vehicle\n` +
        `   └ SUVs, Trucks, Vans\n` +
        `   └ Prices: ₹300 - ₹600\n\n` +
        `Reply with *1* or *2*`;
    
    await client.sendMessage(chatId, text);
}

async function sendServiceMenu(chatId, vehicleSize) {
    const priceBasic = getPrice(vehicleSize, 'basic');
    const priceFull = getPrice(vehicleSize, 'full');
    const priceInside = getPrice(vehicleSize, 'inside');
    
    const text = 
        `✨ *Select Service for ${formatVehicleSize(vehicleSize)} Vehicle*\n\n` +
        `1️⃣ *Basic Wash* (Outside only)\n` +
        `   💰 ₹${priceBasic}\n` +
        `   ✓ Exterior wash & dry\n\n` +
        `2️⃣ *Full Wash* (Complete)\n` +
        `   💰 ₹${priceFull}\n` +
        `   ✓ Exterior + Interior cleaning\n\n` +
        `3️⃣ *Inside Only*\n` +
        `   💰 ₹${priceInside}\n` +
        `   ✓ Interior vacuum & wipe\n\n` +
        `Reply with *1*, *2*, or *3*`;
    
    await client.sendMessage(chatId, text);
}

async function sendTimeSlotsMenu(chatId, date, availableSlots) {
    let text = `📅 *Available Slots for ${date}*\n\n`;
    
    // Group by time of day
    const morning = availableSlots.filter(t => parseInt(t) < 12);
    const afternoon = availableSlots.filter(t => parseInt(t) >= 12 && parseInt(t) < 17);
    const evening = availableSlots.filter(t => parseInt(t) >= 17);
    
    if (morning.length > 0) {
        text += `*🌅 Morning*\n`;
        morning.forEach((slot, idx) => {
            const globalIdx = availableSlots.indexOf(slot) + 1;
            text += `${globalIdx}. ${slot}\n`;
        });
        text += `\n`;
    }
    
    if (afternoon.length > 0) {
        text += `*☀️ Afternoon*\n`;
        afternoon.forEach((slot) => {
            const globalIdx = availableSlots.indexOf(slot) + 1;
            text += `${globalIdx}. ${slot}\n`;
        });
        text += `\n`;
    }
    
    if (evening.length > 0) {
        text += `*🌆 Evening*\n`;
        evening.forEach((slot) => {
            const globalIdx = availableSlots.indexOf(slot) + 1;
            text += `${globalIdx}. ${slot}\n`;
        });
        text += `\n`;
    }
    
    text += `Reply with the *number* of your preferred time slot`;
    await client.sendMessage(chatId, text);
}

async function sendAdminMenu(chatId) {
    const text = 
        `👑 *Admin Menu*\n\n` +
        `1️⃣ *New Booking*\n` +
        `   └ Book as customer\n\n` +
        `2️⃣ *View Upcoming*\n` +
        `   └ See all future bookings\n\n` +
        `3️⃣ *Manage Bookings*\n` +
        `   └ Cancel, Edit, No-show\n\n` +
        `4️⃣ *Check Slots*\n` +
        `   └ Availability by date\n\n` +
        `*Quick Commands:*\n` +
        `• BOOKINGS (all upcoming)\n` +
        `• BOOKINGS 2026-04-10 (specific date)\n` +
        `• CANCEL 123\n` +
        `• NOSHOW 123\n\n` +
        `Reply with *1-4* or use commands above`;
    
    await client.sendMessage(chatId, text);
}

async function sendAdminManageMenu(chatId) {
    const text = 
        `⚙️ *Manage Bookings*\n\n` +
        `1️⃣ View by Date\n` +
        `2️⃣ Cancel Booking\n` +
        `3️⃣ Mark No-Show\n` +
        `4️⃣ Edit Service\n` +
        `5️⃣ Back to Main Menu\n\n` +
        `Reply with *1-5*`;
    
    await client.sendMessage(chatId, text);
}

async function sendBookingConfirmation(chatId, bookingId, session, selectedTime) {
    const text = 
        `✅ *BOOKING CONFIRMED!*\n\n` +
        `📋 *Booking ID:* #${bookingId}\n` +
        `👤 *Name:* ${session.customer_name}\n` +
        `📞 *Phone:* ${session.customer_phone}\n` +
        `🚗 *Vehicle:* ${formatVehicleSize(session.vehicle_size)}\n` +
        `🛠️ *Service:* ${formatServiceType(session.service_type)}\n` +
        `💰 *Price:* ₹${session.price}\n` +
        `📅 *Date:* ${session.date}\n` +
        `⏰ *Time:* ${selectedTime}\n\n` +
        `📍 *Location:* [Your Address]\n` +
        `💵 *Payment:* Cash/UPI/Card on arrival\n\n` +
        `⚠️ *Important:* Arrive 10 mins early. 1 hour late = slot cancelled.\n\n` +
        `To book again, send *BOOK*`;
    
    await client.sendMessage(chatId, text);
}

// ---------- SESSION HANDLING ----------

async function handleCustomerSession(userId, text, message) {
    const session = sessions.get(userId);
    if (!session) return false;
    
    resetSessionTimer(userId);
    text = text.trim();

    try {
        switch (session.step) {
            case 'ask_vehicle': {
                if (text === '1') {
                    session.vehicle_size = 'small';
                } else if (text === '2') {
                    session.vehicle_size = 'large';
                } else {
                    await message.reply("❌ Please reply with *1* (Small) or *2* (Large).");
                    await sendVehicleMenu(userId);
                    return true;
                }
                
                session.step = 'ask_name';
                await message.reply(`✅ ${formatVehicleSize(session.vehicle_size)} vehicle selected.\n\nWhat's your name?`);
                return true;
            }

            case 'ask_name': {
                if (text.length < 2) {
                    await message.reply("❌ Please enter your full name (at least 2 characters):");
                    return true;
                }
                session.customer_name = text;
                session.step = 'ask_phone';
                await message.reply(`Thanks ${text}! 📱 Please share your phone number:`);
                return true;
            }

            case 'ask_phone': {
                let phone = text.replace(/[^0-9]/g, '');
                if (phone.length < 10) {
                    await message.reply("❌ Please enter a valid 10-digit phone number:");
                    return true;
                }
                if (phone.length > 10) phone = phone.slice(-10);
                session.customer_phone = phone;
                session.step = 'ask_service';
                
                await sendServiceMenu(userId, session.vehicle_size);
                return true;
            }

            case 'ask_service': {
                let serviceType = null, price = null;
                
                if (text === '1') {
                    serviceType = 'basic';
                    price = getPrice(session.vehicle_size, 'basic');
                } else if (text === '2') {
                    serviceType = 'full';
                    price = getPrice(session.vehicle_size, 'full');
                } else if (text === '3') {
                    serviceType = 'inside';
                    price = getPrice(session.vehicle_size, 'inside');
                } else {
                    await message.reply("❌ Please reply with *1*, *2*, or *3*.");
                    await sendServiceMenu(userId, session.vehicle_size);
                    return true;
                }
                
                session.service_type = serviceType;
                session.price = price;
                session.step = 'ask_date';
                await message.reply(
                    `✅ ${formatServiceType(serviceType)} selected (₹${price})\n\n` +
                    `📅 Which date would you like?\n` +
                    `Examples: "tomorrow", "April 10", or "2026-04-10"`
                );
                return true;
            }

            case 'ask_date': {
                const date = parseHumanDate(text);
                if (!date) {
                    await message.reply("❌ I didn't understand. Try:\n• tomorrow\n• April 10\n• 2026-04-10");
                    return true;
                }
                
                const today = new Date().toISOString().split('T')[0];
                if (date < today) {
                    await message.reply("❌ Please select a future date.");
                    return true;
                }
                
                try {
                    await generateSlotsForDate(date);
                    const availableSlots = await getAvailableSlots(date);
                    
                    if (availableSlots.length === 0) {
                        await message.reply(`😔 No slots available on ${date}.\n\nPlease try another date.`);
                        return true;
                    }
                    
                    session.date = date;
                    session.availableSlots = availableSlots;
                    session.step = 'ask_slot_choice';
                    
                    await sendTimeSlotsMenu(userId, date, availableSlots);
                } catch (err) {
                    console.error('Slot fetch error:', err);
                    await message.reply("❌ Error loading slots. Please try again.");
                }
                return true;
            }

            case 'ask_slot_choice': {
                const choice = parseInt(text);
                if (isNaN(choice) || choice < 1 || choice > session.availableSlots.length) {
                    await message.reply(`❌ Please reply with a number between *1* and *${session.availableSlots.length}*`);
                    await sendTimeSlotsMenu(userId, session.date, session.availableSlots);
                    return true;
                }
                
                const selectedTime = session.availableSlots[choice - 1];
                
                // Verify slot is still available
                let slotId;
                try {
                    slotId = await isSlotAvailable(session.date, selectedTime);
                } catch (err) {
                    await message.reply("❌ Error checking slot. Please try again.");
                    return true;
                }
                
                if (!slotId) {
                    await message.reply("⚠️ That slot was just taken! Refreshing...");
                    try {
                        const freshSlots = await getAvailableSlots(session.date);
                        if (freshSlots.length === 0) {
                            await message.reply(`😔 No slots left on ${session.date}. Try another date.`);
                            session.step = 'ask_date';
                            return true;
                        }
                        session.availableSlots = freshSlots;
                        await sendTimeSlotsMenu(userId, session.date, freshSlots);
                    } catch (err) {
                        await message.reply("❌ Error. Please send *BOOK* to start over.");
                        clearSession(userId);
                    }
                    return true;
                }
                
                // Try to book
                let bookingResult;
                try {
                    bookingResult = await bookSlot(
                        slotId,
                        session.customer_name,
                        userId,
                        session.vehicle_size,
                        session.service_type,
                        session.price,
                        session.customer_phone
                    );
                } catch (err) {
                    if (err.message === 'SLOT_TAKEN' || err.message?.includes('UNIQUE constraint')) {
                        await message.reply("⚠️ Someone just booked that slot! Showing updated availability...");
                        try {
                            const freshSlots = await getAvailableSlots(session.date);
                            if (freshSlots.length === 0) {
                                await message.reply(`😔 No more slots on ${session.date}.`);
                                session.step = 'ask_date';
                                return true;
                            }
                            session.availableSlots = freshSlots;
                            await sendTimeSlotsMenu(userId, session.date, freshSlots);
                        } catch (refreshErr) {
                            await message.reply("❌ Please send *BOOK* to try again.");
                            clearSession(userId);
                        }
                        return true;
                    }
                    
                    console.error('Booking error:', err);
                    await message.reply(`❌ Booking failed: ${err.message}`);
                    clearSession(userId);
                    return true;
                }
                
                // Success
                await sendBookingConfirmation(userId, bookingResult.bookingId, session, selectedTime);
                
                // Notify admin
                if (adminWhatsAppId) {
                    try {
                        await client.sendMessage(
                            adminWhatsAppId,
                            `🆕 *NEW BOOKING #${bookingResult.bookingId}*\n\n` +
                            `👤 ${session.customer_name}\n` +
                            `📞 ${session.customer_phone}\n` +
                            `🚗 ${formatVehicleSize(session.vehicle_size)} | ${formatServiceType(session.service_type)}\n` +
                            `📅 ${session.date} | ⏰ ${selectedTime}\n` +
                            `💰 ₹${session.price}\n\n` +
                            `Commands: CANCEL ${bookingResult.bookingId} | NOSHOW ${bookingResult.bookingId}`
                        );
                    } catch (err) {
                        console.error('Admin notify failed:', err.message);
                    }
                }
                
                clearSession(userId);
                return true;
            }
            
            default:
                clearSession(userId);
                return false;
        }
    } catch (error) {
        console.error('Session error:', error);
        await message.reply("❌ An error occurred. Please send *BOOK* to start again.");
        clearSession(userId);
        return true;
    }
}

// ---------- MAIN HANDLER ----------

client.on('message', async (message) => {
    if (!isReady) return;
    if (message.fromMe) return;

    const userId = message.from;
    let text = message.body?.trim() || '';
    text = text.toLowerCase();

    // Handle active sessions first
    if (sessions.has(userId)) {
        const handled = await handleCustomerSession(userId, text, message);
        if (handled) return;
    }

    const isAdmin = adminWhatsAppId && userId === adminWhatsAppId;
    
    if (isAdmin) {
        resetSessionTimer(userId);
        
        // Admin direct commands
        if (text === 'bookings') {
            try {
                const bookings = await getAllUpcomingBookings();
                if (bookings.length === 0) {
                    await message.reply('📭 No upcoming bookings.');
                } else {
                    let reply = '📋 *Upcoming Bookings*\n\n';
                    bookings.forEach(b => {
                        reply += `#${b.id} | ${b.slot_date} ${b.slot_time} | ${b.customer_name} | ${b.status}\n`;
                    });
                    await message.reply(reply);
                }
            } catch (err) {
                await message.reply(`❌ Error: ${err.message}`);
            }
            return;
        }

        if (text.startsWith('bookings ')) {
            const date = text.split(' ')[1];
            if (!date?.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return message.reply('❌ Format: BOOKINGS YYYY-MM-DD');
            }
            try {
                const bookings = await getBookingsForDate(date);
                if (bookings.length === 0) return message.reply(`📭 No bookings on ${date}.`);
                let reply = `📋 *${date}*\n\n`;
                bookings.forEach(b => {
                    reply += `#${b.id} | ${b.slot_time} | ${b.customer_name} | ₹${b.price} | ${b.status}\n`;
                });
                await message.reply(reply);
            } catch (err) {
                await message.reply(`❌ ${err.message}`);
            }
            return;
        }

        if (text.startsWith('cancel ')) {
            const id = parseInt(text.split(' ')[1]);
            if (isNaN(id)) return message.reply('❌ Usage: CANCEL <id>');
            try {
                await cancelBooking(id);
                await message.reply(`✅ Booking #${id} cancelled. Slot freed.`);
            } catch (err) {
                await message.reply(`❌ ${err.message}`);
            }
            return;
        }

        if (text.startsWith('noshow ')) {
            const id = parseInt(text.split(' ')[1]);
            if (isNaN(id)) return message.reply('❌ Usage: NOSHOW <id>');
            try {
                await markNoShow(id);
                await message.reply(`✅ Booking #${id} marked as no-show.`);
            } catch (err) {
                await message.reply(`❌ ${err.message}`);
            }
            return;
        }

        if (text.startsWith('slots ')) {
            const date = text.split(' ')[1];
            if (!date?.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return message.reply('❌ Format: SLOTS YYYY-MM-DD');
            }
            try {
                await generateSlotsForDate(date);
                const available = await getAvailableSlots(date);
                if (available.length === 0) return message.reply(`😔 No slots on ${date}.`);
                await message.reply(`✅ *${date}*\n${available.join('\n')}`);
            } catch (err) {
                await message.reply(`❌ ${err.message}`);
            }
            return;
        }

        // Admin Menu State Machine
        let adminSession = adminSessions.get(userId);
        
        if (!adminSession) {
            if (text === '1' || text === 'book' || text === 'booking') {
                sessions.set(userId, { step: 'ask_vehicle', isAdminBooking: true });
                resetSessionTimer(userId);
                await sendVehicleMenu(userId);
                return;
            }
            if (text === '2') {
                try {
                    const bookings = await getAllUpcomingBookings();
                    if (bookings.length === 0) await message.reply('📭 No upcoming bookings.');
                    else {
                        let reply = '📋 *Upcoming Bookings*\n\n';
                        bookings.forEach(b => {
                            reply += `#${b.id} | ${b.slot_date} ${b.slot_time} | ${b.customer_name}\n`;
                        });
                        await message.reply(reply);
                    }
                } catch (err) {
                    await message.reply(`❌ ${err.message}`);
                }
                return;
            }
            if (text === '3') {
                adminSessions.set(userId, { step: 'manage_menu' });
                await sendAdminManageMenu(userId);
                return;
            }
            if (text === '4') {
                await message.reply("📅 Send: SLOTS YYYY-MM-DD\ne.g., SLOTS 2026-04-10");
                return;
            }
            
            await sendAdminMenu(userId);
            return;
        }

        if (adminSession.step === 'manage_menu') {
            switch (text) {
                case '1':
                    adminSession.step = 'view_by_date';
                    await message.reply("📅 Enter date (YYYY-MM-DD):");
                    return;
                case '2':
                    adminSession.step = 'cancel_booking';
                    await message.reply("❌ Enter Booking ID to cancel:");
                    return;
                case '3':
                    adminSession.step = 'noshow_booking';
                    await message.reply("⚠️ Enter Booking ID for no-show:");
                    return;
                case '4':
                    adminSession.step = 'edit_service';
                    await message.reply("✏️ Enter: BOOKING_ID SERVICE_NUMBER\n(e.g., 123 2 for Full Wash)");
                    return;
                case '5':
                    adminSessions.delete(userId);
                    await sendAdminMenu(userId);
                    return;
                default:
                    await message.reply("❌ Reply with 1-5");
                    return;
            }
        }

        if (adminSession.step === 'view_by_date') {
            if (!text?.match(/^\d{4}-\d{2}-\d{2}$/)) {
                await message.reply("❌ Use YYYY-MM-DD");
            } else {
                try {
                    const bookings = await getBookingsForDate(text);
                    if (bookings.length === 0) await message.reply('📭 No bookings');
                    else {
                        let reply = `📋 *${text}*\n\n`;
                        bookings.forEach(b => reply += `#${b.id} | ${b.slot_time} | ${b.customer_name}\n`);
                        await message.reply(reply);
                    }
                } catch (err) {
                    await message.reply(`❌ ${err.message}`);
                }
            }
            adminSession.step = 'manage_menu';
            await sendAdminManageMenu(userId);
            return;
        }

        if (adminSession.step === 'cancel_booking') {
            const id = parseInt(text);
            if (isNaN(id)) await message.reply("❌ Invalid ID");
            else {
                try {
                    await cancelBooking(id);
                    await message.reply(`✅ #${id} cancelled`);
                } catch (err) {
                    await message.reply(`❌ ${err.message}`);
                }
            }
            adminSession.step = 'manage_menu';
            await sendAdminManageMenu(userId);
            return;
        }

        if (adminSession.step === 'noshow_booking') {
            const id = parseInt(text);
            if (isNaN(id)) await message.reply("❌ Invalid ID");
            else {
                try {
                    await markNoShow(id);
                    await message.reply(`✅ #${id} marked no-show`);
                } catch (err) {
                    await message.reply(`❌ ${err.message}`);
                }
            }
            adminSession.step = 'manage_menu';
            await sendAdminManageMenu(userId);
            return;
        }

        if (adminSession.step === 'edit_service') {
            const parts = text.split(' ');
            const id = parseInt(parts[0]);
            const opt = parts[1];
            const map = { '1': 'basic', '2': 'full', '3': 'inside' };
            
            if (isNaN(id) || !map[opt]) {
                await message.reply("❌ Format: ID NUMBER (1-3)");
            } else {
                try {
                    await updateBookingService(id, map[opt]);
                    await message.reply(`✅ Booking #${id} updated to ${formatServiceType(map[opt])}`);
                } catch (err) {
                    await message.reply(`❌ ${err.message}`);
                }
            }
            adminSession.step = 'manage_menu';
            await sendAdminManageMenu(userId);
            return;
        }
    }

    // Customer Commands
    if (text === 'book' || text === 'booking') {
        sessions.set(userId, { step: 'ask_vehicle' });
        resetSessionTimer(userId);
        await sendVehicleMenu(userId);
        return;
    }

    if (text === 'slots') {
        await message.reply("📅 Send: SLOTS YYYY-MM-DD\ne.g., SLOTS 2026-04-10");
        return;
    }

    if (text.startsWith('slots ')) {
        const date = text.split(' ')[1];
        if (!date?.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return message.reply("❌ Format: SLOTS YYYY-MM-DD");
        }
        try {
            await generateSlotsForDate(date);
            const available = await getAvailableSlots(date);
            if (available.length === 0) {
                await message.reply(`😔 No slots on ${date}.`);
            } else {
                await message.reply(`✅ *Available on ${date}:*\n${available.join('\n')}\n\nSend *BOOK* to reserve.`);
            }
        } catch (err) {
            await message.reply(`❌ Error: ${err.message}`);
        }
        return;
    }
    
    if (text === 'help' || text === 'menu') {
        await sendWelcomeMenu(userId);
        return;
    }

    // Default
    await sendWelcomeMenu(userId);
});

// ---------- QR CODE HANDLER (clickable URL + ASCII fallback) ----------
client.on('qr', (qr) => {
    // Generate a clickable link to a QR code image
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    console.log('\n📱 *SCAN THIS QR CODE WITH WHATSAPP (LINKED DEVICES)*');
    console.log('👉 Open this link in your browser to see the QR code:');
    console.log(qrImageUrl);
    console.log('(Then scan the image from your phone.)\n');
    
    // Optional ASCII fallback (may be garbled on some terminals)
    try {
        qrcode.generate(qr, { small: true });
    } catch (err) {
        // Ignore – the link is the primary method
    }
});

client.on('ready', async () => {
    console.log(`✅ ${CAR_WASH_NAME} Bot ready!`);
    
    if (ADMIN_NUMBER) {
        try {
            const cleanNumber = ADMIN_NUMBER.replace(/[^0-9]/g, '');
            const contactId = await client.getNumberId(cleanNumber);
            
            if (contactId?._serialized) {
                adminWhatsAppId = contactId._serialized;
                console.log(`✅ Admin: ${adminWhatsAppId}`);
                
                if (config.isDevelopment()) {
                    await client.sendMessage(
                        adminWhatsAppId,
                        `🤖 *${CAR_WASH_NAME} Bot Online*\nMode: ${config.env}\nSend any message for admin menu.`
                    );
                }
            } else {
                console.error(`⚠️ Admin ${cleanNumber} not found. Have they messaged the bot?`);
            }
        } catch (err) {
            console.error('❌ Admin lookup failed:', err.message);
        }
    }
    
    isReady = true;
});

client.on('disconnected', (reason) => {
    console.log('Disconnected:', reason);
    isReady = false;
    setTimeout(() => client.initialize(), 5000);
});

process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await client.destroy();
    server.close(() => process.exit(0));
});

client.initialize();