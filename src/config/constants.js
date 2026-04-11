const PRICES = {
  small: { basic: 200, full: 400, inside: 200 },
  large: { basic: 300, full: 600, inside: 300 }
};

const SERVICES = {
  basic: 'Basic Wash (outside only)',
  full: 'Full Wash (outside + inside)',
  inside: 'Inside Only'
};

const VEHICLE_TYPES = {
  small: { label: 'Small Vehicle', desc: 'Cars, Hatchbacks, Sedans' },
  large: { label: 'Large Vehicle', desc: 'SUVs, Trucks, Vans' }
};

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const TIME_SLOTS = {
  MORNING: { start: 9, end: 12, icon: '🌅' },
  AFTERNOON: { start: 12, end: 17, icon: '☀️' },
  EVENING: { start: 17, end: 20, icon: '🌆' }
};

module.exports = {
  PRICES,
  SERVICES,
  VEHICLE_TYPES,
  SESSION_TIMEOUT,
  TIME_SLOTS
};