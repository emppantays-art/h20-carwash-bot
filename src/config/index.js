require('dotenv').config({ path: `.env.${process.env.ENV || 'development'}` });

const { PRICES } = require('./constants');

module.exports = {
  env: process.env.ENV || 'development',
  port: process.env.PORT || 3000,
  carWashName: process.env.CAR_WASH_NAME || 'Premium Car Wash',
  adminNumber: process.env.ADMIN_NUMBER,
  sessionTimeout: 30 * 60 * 1000,
  
  isProduction() {
    return this.env === 'production';
  },
  
  isDevelopment() {
    return this.env === 'development';
  },
  
  getPrice(vehicleSize, serviceType) {
    return PRICES[vehicleSize]?.[serviceType] || 0;
  },
  
  paths: {
    auth: process.env.ENV === 'production' ? './.wwebjs_auth_prod' : './.wwebjs_auth'
  }
};