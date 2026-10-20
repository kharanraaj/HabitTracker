import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Setup minimal browser mocks for Node environment
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear()
};

globalThis.window = {
  dispatchEvent: () => true
};
globalThis.CustomEvent = class CustomEvent {
  constructor(name, options = {}) {
    this.name = name;
    this.detail = options.detail;
  }
};

import {
  SCHEMA_VERSION,
  STORAGE_KEY,
  getTodayDateStr,
  parseLocalDateStr,
  toLocalDateStr,
  loadDatabase,
  saveDatabase,
  exportJSON,
  importJSON,
  validateImportData
} from '../js/storage.js';

import {
  getHabits,
  createHabit,
  updateHabit,
  archiveHabit,
  unarchiveHabit,
  reorderHabit,
  isHabitEligibleOnDate,
  validateHabit
} from '../js/habits.js';

describe('Storage & Habit Engine Tests', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  test('Local calendar dates should avoid UTC boundary shifts', () => {
    const todayStr = getTodayDateStr();
    assert.match(todayStr, /^\d{4}-\d{2}-\d{2}$/);

    const testDate = new Date(2026, 9, 20); // 2026-10-20
    const formatted = toLocalDateStr(testDate);
    assert.equal(formatted, '2026-10-20');

    const parsed = parseLocalDateStr('2026-10-20');
    assert.equal(parsed.getFullYear(), 2026);
    assert.equal(parsed.getMonth(), 9);
    assert.equal(parsed.getDate(), 20);
  });

  test('Initial database load should generate 8 default editable habits with valid types', () => {
    const db = loadDatabase();
    assert.equal(db.version, SCHEMA_VERSION);
    assert.equal(db.habits.length, 8);

    const names = db.habits.map((h) => h.name);
    assert.ok(names.includes('Drink Water'));
    assert.ok(names.includes('Walking'));
    assert.ok(names.includes('Workout'));
    assert.ok(names.includes('Reading'));
    assert.ok(names.includes('Studying'));
    assert.ok(names.includes('No Sugar'));
    assert.ok(names.includes('Sleep'));
    assert.ok(names.includes('Meditation'));

    const types = new Set(db.habits.map((h) => h.type));
    assert.ok(types.has('quantity'));
    assert.ok(types.has('duration'));
    assert.ok(types.has('avoidance'));
    assert.ok(types.has('yes_no'));
  });

  test('Habit validation rejects invalid names, non-positive targets, and empty schedules', () => {
    const err1 = validateHabit({ name: '', type: 'yes_no', target: 1, schedule: ['mon'] });
    assert.ok(err1.length > 0);

    const err2 = validateHabit({ name: 'Valid', type: 'quantity', target: -5, schedule: ['mon'] });
    assert.ok(err2.length > 0);

    const err3 = validateHabit({ name: 'Valid', type: 'quantity', target: 5, schedule: [] });
    assert.ok(err3.length > 0);

    const valid = validateHabit({ name: 'Valid', type: 'quantity', target: 5, schedule: ['mon', 'tue'] });
    assert.equal(valid.length, 0);
  });

  test('Habit updates preserve stable UUIDs and do not overwrite past historical entries', () => {
    const db = loadDatabase();
    const habit = db.habits[0];
    const originalId = habit.id;

    // Simulate entry
    db.entries.push({
      id: 'entry-1',
      habitId: originalId,
      date: '2026-10-15',
      value: 4,
      status: 'completed',
      note: 'Past record',
      createdAt: '2026-10-15T00:00:00Z',
      updatedAt: '2026-10-15T00:00:00Z'
    });
    saveDatabase(db);

    // Update habit target and rename
    const updated = updateHabit(originalId, {
      name: 'Hydration 2.0',
      target: 6
    });

    assert.equal(updated.id, originalId);
    assert.equal(updated.name, 'Hydration 2.0');
    assert.equal(updated.target, 6);

    // Verify past entry still references originalId with original value
    const freshDb = loadDatabase();
    const pastEntry = freshDb.entries.find((e) => e.habitId === originalId);
    assert.ok(pastEntry);
    assert.equal(pastEntry.value, 4);
  });

  test('Archiving and unarchiving correctly alters active status and preserves records', () => {
    const db = loadDatabase();
    const habit = db.habits[0];

    archiveHabit(habit.id);
    let active = getHabits({ includeArchived: false });
    assert.equal(active.find((h) => h.id === habit.id), undefined);

    let all = getHabits({ includeArchived: true });
    assert.ok(all.find((h) => h.id === habit.id).archivedAt !== null);

    unarchiveHabit(habit.id);
    active = getHabits({ includeArchived: false });
    assert.ok(active.find((h) => h.id === habit.id));
  });

  test('JSON export and import validation handles corruption and schema checks safely', () => {
    const exportedStr = exportJSON();
    const validation = validateImportData(exportedStr);
    assert.equal(validation.valid, true);
    assert.equal(validation.summary.habitsCount, 8);

    // Malformed JSON check
    const badValidation = validateImportData('{"habits": "not an array"}');
    assert.equal(badValidation.valid, false);

    // Strategy merge
    const res = importJSON(exportedStr, 'merge');
    assert.equal(res.strategy, 'merge');
    assert.equal(res.habitsCount, 8);
  });

  test('Schedule eligibility properly checks weekdays and future boundaries', () => {
    const habit = {
      id: 'h1',
      name: 'Weekday Habit',
      type: 'yes_no',
      target: 1,
      schedule: ['mon', 'wed', 'fri'],
      startDate: '2026-10-01',
      endDate: null,
      archivedAt: null
    };

    // 2026-10-19 is a Monday
    const eligMon = isHabitEligibleOnDate(habit, '2026-10-19');
    assert.equal(eligMon.eligible, true);

    // 2026-10-20 is a Tuesday (not in schedule)
    const eligTue = isHabitEligibleOnDate(habit, '2026-10-20');
    assert.equal(eligTue.eligible, false);
    assert.equal(eligTue.reason, 'unscheduled');

    // Future date check: 2026-12-02 is a Wednesday in schedule, but future
    const eligFuture = isHabitEligibleOnDate(habit, '2026-12-02');
    assert.equal(eligFuture.eligible, true);
    assert.equal(eligFuture.isFuture, true);
  });
});
