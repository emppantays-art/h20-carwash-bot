const config = require('../config');
const CustomerMenus = require('../menus/customer');

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.adminSessions = new Map();
    this.timers = new Map();
  }

  create(userId, data = {}) {
    this.clear(userId);
    const session = {
      userId,
      step: data.step || 'ask_vehicle',
      isAdminBooking: data.isAdminBooking || false,
      createdAt: Date.now(),
      ...data
    };
    
    this.sessions.set(userId, session);
    this.resetTimer(userId);
    return session;
  }

  get(userId) {
    return this.sessions.get(userId) || this.adminSessions.get(userId);
  }

  update(userId, data) {
    const session = this.get(userId);
    if (session) {
      Object.assign(session, data);
      this.resetTimer(userId);
    }
    return session;
  }

  clear(userId) {
    if (this.timers.has(userId)) {
      clearTimeout(this.timers.get(userId));
      this.timers.delete(userId);
    }
    this.sessions.delete(userId);
    this.adminSessions.delete(userId);
  }

  resetTimer(userId, client = null) {
    if (this.timers.has(userId)) {
      clearTimeout(this.timers.get(userId));
    }

    const timer = setTimeout(() => {
      this.clear(userId);
      if (client) {
        client.sendMessage(userId, CustomerMenus.sessionExpired());
      }
    }, config.sessionTimeout);

    this.timers.set(userId, timer);
  }

  setAdminSession(userId, data) {
    this.adminSessions.set(userId, data);
    this.resetTimer(userId);
  }

  deleteAdminSession(userId) {
    this.adminSessions.delete(userId);
  }
}

module.exports = new SessionManager();