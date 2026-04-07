require('dotenv').config({ path: `.env.${process.env.ENV || 'development'}` });

const rawAdminNumber = process.env.ADMIN_NUMBER || '';
const adminNumber = rawAdminNumber.replace(/[^0-9]/g, '');

const config = {
  env: process.env.ENV || 'development',
  carWashName: process.env.CAR_WASH_NAME || 'H20 Car Wash',
  adminNumber: adminNumber,
  databaseUrl: process.env.DATABASE_URL || 'sqlite:./bookings.db',
  webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN,
  isProduction: () => config.env === 'production',
  isDevelopment: () => config.env === 'development'
};

module.exports = config;