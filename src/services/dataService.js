import { INITIAL_DEVOTEES, INITIAL_SABHAS, INITIAL_THOUGHTS, INITIAL_USERS } from './mockData';

const KEYS = {
  USERS: 'ac_users_v1',
  DEVOTEES: 'ac_devotees_v2',
  SABHAS: 'ac_sabhas_v1',
  THOUGHTS: 'ac_thoughts_v1',
  ATTENDANCE: 'ac_attendance_logs_v1',
  SESSION: 'ac_session_v1'
};

// Initialize localStorage if empty
const initStorage = () => {
  if (!localStorage.getItem(KEYS.USERS)) {
    localStorage.setItem(KEYS.USERS, JSON.stringify(INITIAL_USERS));
  }
  if (!localStorage.getItem(KEYS.DEVOTEES)) {
    localStorage.setItem(KEYS.DEVOTEES, JSON.stringify(INITIAL_DEVOTEES));
  }
  if (!localStorage.getItem(KEYS.SABHAS)) {
    localStorage.setItem(KEYS.SABHAS, JSON.stringify(INITIAL_SABHAS));
  }
  if (!localStorage.getItem(KEYS.THOUGHTS)) {
    localStorage.setItem(KEYS.THOUGHTS, JSON.stringify(INITIAL_THOUGHTS));
  }
  if (!localStorage.getItem(KEYS.ATTENDANCE)) {
    localStorage.setItem(KEYS.ATTENDANCE, JSON.stringify([]));
  }
};

initStorage();

export const dataService = {
  // Auth Operations
  loginWithPin: async (mobile, pin) => {
    const users = JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
    // Match mobile & PIN (also check default admin & sevak 6-digit PINs)
    const user = users.find(u => u.mobile === mobile && u.pin === pin);
    if (!user) {
      // Fallback check for admin (786109) & sevak (786369) regardless of stored users
      if (pin === '786109') {
        const adminUser = { mobile, pin: '786109', role: 'Admin', name: 'Administrator' };
        localStorage.setItem(KEYS.SESSION, JSON.stringify(adminUser));
        return { success: true, user: adminUser };
      }
      if (pin === '786369') {
        const sevakUser = { mobile, pin: '786369', role: 'Sevak', name: 'Sevak User' };
        localStorage.setItem(KEYS.SESSION, JSON.stringify(sevakUser));
        return { success: true, user: sevakUser };
      }
      throw new Error('Invalid Mobile Number or PIN. Please check your credentials.');
    }
    localStorage.setItem(KEYS.SESSION, JSON.stringify(user));
    return { success: true, user };
  },

  loginWithPassword: async (mobile, password) => {
    const users = JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
    const user = users.find(u => u.mobile === mobile && u.password === password);
    if (!user) {
      throw new Error('Invalid Mobile Number or Password.');
    }
    localStorage.setItem(KEYS.SESSION, JSON.stringify(user));
    return { success: true, user };
  },

  requestOtp: async (mobile) => {
    if (!mobile || mobile.length !== 10) {
      throw new Error('Please enter a valid 10-digit mobile number.');
    }
    return { success: true, otp: '123456', message: 'OTP sent to WhatsApp +91 ' + mobile };
  },

  verifyOtp: async (mobile, otp) => {
    if (otp !== '123456') {
      throw new Error('Invalid OTP. Use demo OTP: 123456');
    }
    return { success: true };
  },

  completeSetup: async (mobile, password, pin) => {
    const users = JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
    const existingIdx = users.findIndex(u => u.mobile === mobile);
    const updatedUser = {
      mobile,
      password,
      pin,
      role: existingIdx >= 0 ? users[existingIdx].role : 'Devotee',
      name: existingIdx >= 0 ? users[existingIdx].name : 'Satsangi Devotee'
    };

    if (existingIdx >= 0) {
      users[existingIdx] = updatedUser;
    } else {
      users.push(updatedUser);
    }
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
    localStorage.setItem(KEYS.SESSION, JSON.stringify(updatedUser));
    return { success: true, user: updatedUser };
  },

  getCurrentSession: () => {
    return JSON.parse(localStorage.getItem(KEYS.SESSION) || 'null');
  },

  logout: () => {
    localStorage.removeItem(KEYS.SESSION);
  },

  // Devotee Operations
  getDevotees: () => {
    return JSON.parse(localStorage.getItem(KEYS.DEVOTEES) || '[]');
  },

  addDevotee: (devotee) => {
    const list = dataService.getDevotees();
    const newDevotee = {
      ...devotee,
      id: `DEV-${1000 + list.length + 1}`,
      attendanceRate: 100,
      status: 'Active',
      flags: []
    };
    list.unshift(newDevotee);
    localStorage.setItem(KEYS.DEVOTEES, JSON.stringify(list));
    return newDevotee;
  },

  updateDevotee: (id, updatedFields) => {
    const list = dataService.getDevotees();
    const idx = list.findIndex(d => d.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updatedFields };
      localStorage.setItem(KEYS.DEVOTEES, JSON.stringify(list));
      return list[idx];
    }
    return null;
  },

  deleteDevotee: (id) => {
    const list = dataService.getDevotees();
    const filtered = list.filter(d => d.id !== id);
    localStorage.setItem(KEYS.DEVOTEES, JSON.stringify(filtered));
  },

  // Sabha & Attendance Operations
  getSabhas: () => {
    return JSON.parse(localStorage.getItem(KEYS.SABHAS) || '[]');
  },

  addSabha: (sabha) => {
    const sabhas = dataService.getSabhas();
    const newSabha = {
      ...sabha,
      id: `SAB-2026-0${sabhas.length + 1}`,
      presentCount: 0,
      totalCount: dataService.getDevotees().length,
      status: 'Scheduled'
    };
    sabhas.unshift(newSabha);
    localStorage.setItem(KEYS.SABHAS, JSON.stringify(sabhas));
    return newSabha;
  },

  markAttendance: (sabhaId, devoteeId, present = true) => {
    const logs = JSON.parse(localStorage.getItem(KEYS.ATTENDANCE) || '[]');
    const existingIdx = logs.findIndex(l => l.sabhaId === sabhaId && l.devoteeId === devoteeId);
    
    if (existingIdx >= 0) {
      logs[existingIdx].present = present;
      logs[existingIdx].timestamp = new Date().toISOString();
    } else {
      logs.push({
        id: `ATT-${Date.now()}`,
        sabhaId,
        devoteeId,
        present,
        timestamp: new Date().toISOString()
      });
    }
    localStorage.setItem(KEYS.ATTENDANCE, JSON.stringify(logs));

    // Update Sabha counter
    const sabhas = dataService.getSabhas();
    const sabha = sabhas.find(s => s.id === sabhaId);
    if (sabha) {
      const sabhaLogs = logs.filter(l => l.sabhaId === sabhaId && l.present);
      sabha.presentCount = sabhaLogs.length;
      localStorage.setItem(KEYS.SABHAS, JSON.stringify(sabhas));
    }
  },

  getAttendanceForSabha: (sabhaId) => {
    const logs = JSON.parse(localStorage.getItem(KEYS.ATTENDANCE) || '[]');
    return logs.filter(l => l.sabhaId === sabhaId);
  },

  // Thoughts / Prasangam
  getThoughts: () => {
    return JSON.parse(localStorage.getItem(KEYS.THOUGHTS) || '[]');
  },

  // CSV Export Utility
  exportToCSV: (filename, rows) => {
    if (!rows || !rows.length) return;
    const separator = ',';
    const keys = Object.keys(rows[0]);
    const csvContent =
      keys.join(separator) +
      '\n' +
      rows
        .map(row => {
          return keys
            .map(k => {
              let cell = row[k] === null || row[k] === undefined ? '' : row[k];
              cell = cell instanceof Date ? cell.toLocaleString() : cell.toString();
              cell = cell.replace(/"/g, '""');
              if (cell.search(/("|,|\n)/g) >= 0) {
                cell = `"${cell}"`;
              }
              return cell;
            })
            .join(separator);
        })
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }
};
