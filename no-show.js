// no-show.js
const { getOverdueConfirmedBookings, markNoShow } = require('./database.js');

async function checkNoShows() {
    console.log('Checking for no-shows...', new Date().toISOString());
    const overdue = await getOverdueConfirmedBookings();
    if (overdue.length === 0) {
        console.log('No overdue bookings.');
        return;
    }
    for (let booking of overdue) {
        await markNoShow(booking.id);
        console.log(`Marked booking #${booking.id} (${booking.customer_name}) as no-show.`);
    }
}

checkNoShows().then(() => process.exit(0));