const chrono = require('chrono-node');

const parseHumanDate = (input) => {
  if (!input || typeof input !== 'string') return null;
  
  input = input.trim();
  
  // Try chrono-node first
  const parsedDate = chrono.parseDate(input, new Date(), { forwardDate: true });
  if (parsedDate) return parsedDate.toISOString().split('T')[0];
  
  // Try ISO format YYYY-MM-DD
  const isoMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const date = new Date(input);
    if (!isNaN(date.getTime())) return input;
  }
  
  return null;
};

const isValidFutureDate = (dateStr) => {
  const today = new Date().toISOString().split('T')[0];
  return dateStr >= today;
};

module.exports = {
  parseHumanDate,
  isValidFutureDate
};