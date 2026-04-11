const { SERVICES, VEHICLE_TYPES } = require('../config/constants');

const formatVehicleSize = (size) => VEHICLE_TYPES[size]?.label || size;
const formatServiceType = (type) => SERVICES[type] || type;

const formatCurrency = (amount) => `₹${amount}`;
const formatPhone = (phone) => {
  const cleaned = phone.replace(/[^0-9]/g, '');
  return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
};

const formatBookingId = (id) => `#${id}`;

module.exports = {
  formatVehicleSize,
  formatServiceType,
  formatCurrency,
  formatPhone,
  formatBookingId
};