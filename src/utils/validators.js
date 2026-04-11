const isValidPhone = (phone) => {
  const cleaned = phone.replace(/[^0-9]/g, '');
  return cleaned.length >= 10;
};

const isValidDateFormat = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date);
const isValidBookingId = (id) => !isNaN(parseInt(id)) && parseInt(id) > 0;
const isValidServiceOption = (opt) => ['1', '2', '3'].includes(opt);
const isValidVehicleOption = (opt) => ['1', '2'].includes(opt);

module.exports = {
  isValidPhone,
  isValidDateFormat,
  isValidBookingId,
  isValidServiceOption,
  isValidVehicleOption
};