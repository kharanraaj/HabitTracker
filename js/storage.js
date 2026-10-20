/**
 * Habit Tracker - Storage Engine (storage.js)
 * Persistent storage, versioned schema, safe migrations, import/export validation
 */

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'habit_tracker_master_v1';
export const RECOVERY_BACKUP_KEY = 'habit_tracker_recovery_backup';
export const CORRUPTED_BACKUP_KEY = 'habit_tracker_corrupted_backup';

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  accentColor: 'emerald',
  weekStart: 'monday',
  dateFormat: 'YYYY-MM-DD',
  numberFormat: 'en-US',
  defaultAnalyticsPeriod: 30
};

/**
 * Returns today's local date string in YYYY-MM-DD.
 * Strictly uses local calendar year, month, and day to avoid UTC date boundary shifts.
 */
export function getTodayDateStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert Date object to local YYYY-MM-DD string
 */
export function toLocalDateStr(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse local YYYY-MM-DD string into Date object at midnight local time
 */
export function parseLocalDateStr(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

/**
 * Generate a unique ID (UUID v4 format or fallback)
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Default preloaded habits
 */
export function getDefaultHabits() {
  const todayStr = getTodayDateStr();
  const nowIso = new Date().toISOString();

  // Set default habits start date to 30 days prior so earlier days of current week are not disabled
  const past30Obj = parseLocalDateStr(todayStr);
  past30Obj.setDate(past30Obj.getDate() - 30);
  const defaultStartDate = toLocalDateStr(past30Obj);

  return [
    {
      id: generateUUID(),
      name: 'Drink Water',
      icon: 'water',
      type: 'quantity',
      unit: 'liters',
      target: 5,
      schedule: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      createdAt: nowIso,
      startDate: defaultStartDate,
      endDate: null,
      archivedAt: null,
      order: 1,
      metadata: { description: 'Daily hydration target' }
    },
    {
      id: generateUUID(),
      name: 'Walking',
      icon: 'walking',
      type: 'duration',
      unit: 'minutes',
      target: 120,
      schedule: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      createdAt: nowIso,
      startDate: defaultStartDate,
      endDate: null,
      archivedAt: null,
      order: 2,
      metadata: { description: 'Brisk walking or steps' }
    },
    {
      id: generateUUID(),
      name: 'Workout',
      icon: 'workout',
      type: 'duration',
      unit: 'minutes',
      target: 60,
      schedule: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
      createdAt: nowIso,
      startDate: defaultStartDate,
      endDate: null,
      archivedAt: null,
      order: 3,
      metadata: { description: 'Strength or cardiovascular training' }
    },
    {
      id: generateUUID(),
      name: 'Reading',
      icon: 'reading',
      type: 'duration',
      unit: 'minutes',
      target: 30,
      schedule: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      createdAt: nowIso,
      startDate: defaultStartDate,
      endDate: null,
      archivedAt: null,
      order: 4,
      metadata: { description: 'Books, articles, or research' }
    },
    {
      id: generateUUID(),
      name: 'Studying',
      icon: 'studying',
      type: 'duration',
      unit: 'minutes',
      target: 45,
      schedule: ['mon', 'tue', 'wed', 'thu', 'fri'],
      createdAt: nowIso,
      startDate: defaultStartDate,
      endDate: null,
      archivedAt: null,
      order: 5,
      metadata: { description: 'Focused learning and skill mastery' }
    },
    {
      id: generateUUID(),
      name: 'No Sugar',
      icon: 'sugar',
      type: 'avoidance',
      unit: 'day',
      target: 1,
      schedule: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      createdAt: nowIso,
      startDate: defaultStartDate,
      endDate: null,
      archivedAt: null,
      order: 6,
      metadata: { description: 'Avoid refined and added sugars' }
    },
    {
      id: generateUUID(),
      name: 'Sleep',
      icon: 'sleep',
      type: 'duration',
      unit: 'minutes',
      target: 480, // 8 hours in minutes
      schedule: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      createdAt: nowIso,
      startDate: defaultStartDate,
      endDate: null,
      archivedAt: null,
      order: 7,
      metadata: { description: 'Restorative nighttime sleep' }
    },
    {
      id: generateUUID(),
      name: 'Meditation',
      icon: 'meditation',
      type: 'yes_no',
      unit: 'session',
      target: 1,
      schedule: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      createdAt: nowIso,
      startDate: defaultStartDate,
      endDate: null,
      archivedAt: null,
      order: 8,
      metadata: { description: 'Mindfulness or breath meditation' }
    }
  ];
}

/**
 * Initializes fresh database schema
 */
export function getInitialDatabase() {
  return {
    version: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastExportedAt: null,
    settings: { ...DEFAULT_SETTINGS },
    habits: getDefaultHabits(),
    entries: []
  };
}

/**
 * Load persisted data with safe migration and corruption handling
 */
export function loadDatabase() {
  if (typeof localStorage === 'undefined') {
    return getInitialDatabase();
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const fresh = getInitialDatabase();
    saveDatabase(fresh);
    return fresh;
  }

  try {
    const parsed = JSON.parse(raw);
    const validated = migrateAndValidate(parsed);
    return validated;
  } catch (err) {
    console.error('Failed to parse localStorage data. Preserving corrupted data to backup key.', err);
    try {
      localStorage.setItem(CORRUPTED_BACKUP_KEY, raw);
    } catch (e) {
      // ignore
    }
    const fallback = getInitialDatabase();
    saveDatabase(fallback);
    return fallback;
  }
}

/**
 * Save data with quota safety
 */
export function saveDatabase(data) {
  if (typeof localStorage === 'undefined') return;

  data.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Storage quota exceeded or storage error:', err);
    throw new Error('Local storage quota exceeded. Please export and clean your history.');
  }
}

/**
 * Migrates older schema versions to current SCHEMA_VERSION
 */
function migrateAndValidate(data) {
  if (!data || typeof data !== 'object') {
    return getInitialDatabase();
  }

  // Version 1 validation
  const version = Number(data.version) || 1;
  const habits = Array.isArray(data.habits) ? data.habits : [];
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };

  // Ensure habits have valid structure
  const cleanHabits = habits.map((h, idx) => ({
    id: h.id || generateUUID(),
    name: String(h.name || 'Untitled Habit').trim(),
    icon: h.icon || 'water',
    type: ['yes_no', 'quantity', 'duration', 'avoidance', 'count'].includes(h.type) ? h.type : 'yes_no',
    unit: h.unit || (h.type === 'duration' ? 'minutes' : 'count'),
    target: Number(h.target) > 0 ? Number(h.target) : 1,
    schedule: Array.isArray(h.schedule) && h.schedule.length > 0 ? h.schedule : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    createdAt: h.createdAt || new Date().toISOString(),
    startDate: h.startDate || getTodayDateStr(),
    endDate: h.endDate || null,
    archivedAt: h.archivedAt || null,
    order: Number(h.order) || (idx + 1),
    metadata: h.metadata && typeof h.metadata === 'object' ? h.metadata : {}
  }));

  // Ensure entries have valid structure
  const cleanEntries = entries.map((e) => ({
    id: e.id || generateUUID(),
    habitId: String(e.habitId),
    date: String(e.date),
    value: Number(e.value) || 0,
    status: ['completed', 'partial', 'missed', 'skipped', 'not_recorded', 'compliant', 'violation'].includes(e.status)
      ? e.status
      : 'not_recorded',
    note: String(e.note || ''),
    createdAt: e.createdAt || new Date().toISOString(),
    updatedAt: e.updatedAt || new Date().toISOString()
  }));

  return {
    version: SCHEMA_VERSION,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastExportedAt: data.lastExportedAt || null,
    settings,
    habits: cleanHabits,
    entries: cleanEntries
  };
}

/**
 * Get Settings
 */
export function getSettings() {
  const db = loadDatabase();
  return db.settings;
}

/**
 * Update Settings
 */
export function updateSettings(updates) {
  const db = loadDatabase();
  db.settings = { ...db.settings, ...updates };
  saveDatabase(db);
  return db.settings;
}

/**
 * Export JSON backup
 */
export function exportJSON() {
  const db = loadDatabase();
  db.lastExportedAt = new Date().toISOString();
  saveDatabase(db);
  return JSON.stringify(db, null, 2);
}

/**
 * Validate imported JSON
 */
export function validateImportData(rawJson) {
  const result = {
    valid: false,
    errors: [],
    data: null,
    summary: {
      habitsCount: 0,
      entriesCount: 0,
      version: 0
    }
  };

  try {
    const parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
    if (!parsed || typeof parsed !== 'object') {
      result.errors.push('File does not contain a valid JSON object.');
      return result;
    }

    if (!Array.isArray(parsed.habits)) {
      result.errors.push('Missing "habits" array.');
    }
    if (!Array.isArray(parsed.entries)) {
      result.errors.push('Missing "entries" array.');
    }

    if (result.errors.length > 0) return result;

    const validated = migrateAndValidate(parsed);
    result.valid = true;
    result.data = validated;
    result.summary = {
      habitsCount: validated.habits.length,
      entriesCount: validated.entries.length,
      version: validated.version
    };
    return result;
  } catch (err) {
    result.errors.push(`Invalid JSON formatting: ${err.message}`);
    return result;
  }
}

/**
 * Import JSON backup
 * @param {string|Object} rawJson
 * @param {'merge'|'replace'} strategy
 */
export function importJSON(rawJson, strategy = 'merge') {
  const validation = validateImportData(rawJson);
  if (!validation.valid) {
    throw new Error(validation.errors.join(' '));
  }

  const currentDb = loadDatabase();

  // Always create a recovery backup before replacing
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(RECOVERY_BACKUP_KEY, JSON.stringify(currentDb));
  }

  if (strategy === 'replace') {
    saveDatabase(validation.data);
    return {
      strategy: 'replace',
      habitsCount: validation.data.habits.length,
      entriesCount: validation.data.entries.length
    };
  }

  // Strategy: 'merge'
  const incoming = validation.data;
  const existingHabitIds = new Set(currentDb.habits.map((h) => h.id));
  const mergedHabits = [...currentDb.habits];

  incoming.habits.forEach((inHabit) => {
    if (!existingHabitIds.has(inHabit.id)) {
      mergedHabits.push(inHabit);
      existingHabitIds.add(inHabit.id);
    }
  });

  const entryKey = (habitId, date) => `${habitId}::${date}`;
  const entryMap = new Map();
  currentDb.entries.forEach((e) => entryMap.set(entryKey(e.habitId, e.date), e));

  incoming.entries.forEach((inEntry) => {
    const key = entryKey(inEntry.habitId, inEntry.date);
    const existing = entryMap.get(key);
    if (!existing) {
      entryMap.set(key, inEntry);
    } else {
      // Keep newer updated entry
      if (new Date(inEntry.updatedAt) > new Date(existing.updatedAt)) {
        entryMap.set(key, inEntry);
      }
    }
  });

  currentDb.habits = mergedHabits;
  currentDb.entries = Array.from(entryMap.values());
  saveDatabase(currentDb);

  return {
    strategy: 'merge',
    habitsCount: currentDb.habits.length,
    entriesCount: currentDb.entries.length
  };
}

/**
 * CSV Exports
 */
export function exportEntriesCSV() {
  const db = loadDatabase();
  const habitMap = new Map(db.habits.map((h) => [h.id, h]));

  const headers = ['id', 'habitId', 'habitName', 'habitType', 'date', 'value', 'target', 'unit', 'status', 'note', 'updatedAt'];
  const rows = db.entries.map((e) => {
    const habit = habitMap.get(e.habitId);
    return [
      escapeCsv(e.id),
      escapeCsv(e.habitId),
      escapeCsv(habit ? habit.name : 'Unknown Habit'),
      escapeCsv(habit ? habit.type : ''),
      escapeCsv(e.date),
      e.value,
      habit ? habit.target : '',
      escapeCsv(habit ? habit.unit : ''),
      escapeCsv(e.status),
      escapeCsv(e.note || ''),
      escapeCsv(e.updatedAt)
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}

export function exportHabitsCSV() {
  const db = loadDatabase();
  const headers = ['id', 'name', 'type', 'target', 'unit', 'schedule', 'startDate', 'endDate', 'archivedAt', 'order', 'createdAt'];
  const rows = db.habits.map((h) => [
    escapeCsv(h.id),
    escapeCsv(h.name),
    escapeCsv(h.type),
    h.target,
    escapeCsv(h.unit),
    escapeCsv((h.schedule || []).join(';')),
    escapeCsv(h.startDate),
    escapeCsv(h.endDate || ''),
    escapeCsv(h.archivedAt || ''),
    h.order,
    escapeCsv(h.createdAt)
  ].join(','));

  return [headers.join(','), ...rows].join('\r\n');
}

function escapeCsv(field) {
  if (field === null || field === undefined) return '""';
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Storage size calculation
 */
export function getStorageUsageBytes() {
  if (typeof localStorage === 'undefined') return 0;
  let total = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += (localStorage[key].length + key.length) * 2; // UTF-16 ~2 bytes per char
    }
  }
  return total;
}
