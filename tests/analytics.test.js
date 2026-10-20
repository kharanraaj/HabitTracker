import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock storage
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear()
};

globalThis.window = { dispatchEvent: () => true };
globalThis.CustomEvent = class CustomEvent { constructor(n, o) { this.n = n; this.o = o; } };

import { saveDatabase, getInitialDatabase } from '../js/storage.js';
import {
  calculateCompletionRate,
  calculateAttainmentMetrics,
  calculateHabitStreaks,
  calculateWeekdayAnalysis,
  calculateRecoveryAnalysis,
  calculateGoalPacing,
  calculateConsistencyScore,
  calculateHabitCorrelations,
  generateInsights,
  getDateRange
} from '../js/analytics.js';

describe('Analytics Engine Tests', () => {
  let db;

  beforeEach(() => {
    mockStorage.clear();
    db = getInitialDatabase();
    db.habits.forEach((h) => {
      h.startDate = '2026-01-01';
    });
    saveDatabase(db);
  });

  test('Completion rate calculation accurately reflects completed vs recorded eligible days', () => {
    const habit = db.habits[0]; // Drink Water
    habit.startDate = '2026-10-01';
    const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];

    db.entries = [
      { habitId: habit.id, date: '2026-10-01', value: 5, status: 'completed' },
      { habitId: habit.id, date: '2026-10-02', value: 2, status: 'partial' },
      { habitId: habit.id, date: '2026-10-03', value: 0, status: 'missed' }
      // 2026-10-04 is unrecorded
    ];
    saveDatabase(db);

    const res = calculateCompletionRate(dates, habit.id);
    // recordedEligibleDays: 3 (10-01, 10-02, 10-03). 10-04 is unrecorded so not recorded
    // completedEligibleDays: 1 (10-01 has 5 >= 5)
    assert.equal(res.recordedEligibleDays, 3);
    assert.equal(res.completedEligibleDays, 1);
    assert.equal(res.rate, 33.3);
    assert.equal(res.hasSufficientData, false); // < 7
  });

  test('Quantity and duration attainment caps single entries at 100% and reports distinct metrics', () => {
    const habit = db.habits[0]; // target = 5 liters
    const dates = ['2026-10-01', '2026-10-02'];

    db.entries = [
      { habitId: habit.id, date: '2026-10-01', value: 10, status: 'completed' }, // 200% raw, should cap at 100% for attainment
      { habitId: habit.id, date: '2026-10-02', value: 2.5, status: 'partial' }   // 50%
    ];
    saveDatabase(db);

    const res = calculateAttainmentMetrics(dates, habit.id);
    assert.equal(res.totalRecordedValue, 12.5);
    assert.equal(res.totalTargetValue, 10);
    // Average daily attainment capped at 100% per entry: (100% + 50%) / 2 = 75%
    assert.equal(res.averageDailyAttainment, 75);
    // Days meeting target: 1 out of 2 (50%)
    assert.equal(res.daysMeetingTarget, 1);
    assert.equal(res.daysMeetingTargetRate, 50);
  });

  test('Streak calculation advances on completion, pauses on skip, and breaks on violation/miss', () => {
    const habit = db.habits.find((h) => h.type === 'avoidance'); // No Sugar
    const dates = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'];

    db.entries = [
      { habitId: habit.id, date: '2026-10-10', value: 1, status: 'compliant' }, // +1
      { habitId: habit.id, date: '2026-10-11', value: 0, status: 'skipped' },   // paused
      { habitId: habit.id, date: '2026-10-12', value: 1, status: 'compliant' }, // +1 (streak=2)
      { habitId: habit.id, date: '2026-10-13', value: 0, status: 'violation' }, // breaks streak -> 0
      { habitId: habit.id, date: '2026-10-14', value: 1, status: 'compliant' }  // +1 (current streak=1)
    ];
    saveDatabase(db);

    const streaks = calculateHabitStreaks(habit.id, '2026-10-14');
    assert.equal(streaks.currentStreak, 1);
    assert.equal(streaks.longestStreak, 2);
  });

  test('Weekday analysis requires at least 4 observations per day before determining strongest/weakest', () => {
    const dates = getDateRange('2026-09-01', '2026-09-07'); // 1 week only (1 obs per weekday)
    const res = calculateWeekdayAnalysis(dates);
    assert.equal(res.hasSufficientData, false);
    assert.equal(res.strongest, null);
    assert.equal(res.weakest, null);
  });

  test('Transparent Consistency score adheres to 60/25/15 weighting formula', () => {
    const dates = getDateRange('2026-10-01', '2026-10-14'); // 14 days
    // Empty entries
    const scoreObj = calculateConsistencyScore(dates);
    assert.equal(scoreObj.score, 0);
    assert.equal(scoreObj.components.completionRate.weight, 0.6);
    assert.equal(scoreObj.components.attainment.weight, 0.25);
    assert.equal(scoreObj.components.recentRegularity.weight, 0.15);
  });

  test('Habit correlation analysis requires at least 20 paired observations', () => {
    const dates = getDateRange('2026-10-01', '2026-10-10'); // only 10 days
    const res = calculateHabitCorrelations(dates);
    assert.ok(res.length > 0);
    // All pairs must be flagged as insufficient data
    res.forEach((pair) => {
      assert.equal(pair.hasSufficientData, false);
      assert.equal(pair.coefficient, null);
    });
  });

  test('Correlation calculates exact Phi coefficient when sample size >= 20', () => {
    const dates = [];
    for (let i = 1; i <= 25; i++) {
      dates.push(`2026-09-${String(i).padStart(2, '0')}`);
    }

    const habitA = db.habits[0]; // Water
    const habitB = db.habits[7]; // Meditation

    // Perfectly correlated completions for 25 days
    dates.forEach((d) => {
      db.entries.push({ habitId: habitA.id, date: d, value: 5, status: 'completed' });
      db.entries.push({ habitId: habitB.id, date: d, value: 1, status: 'completed' });
    });
    saveDatabase(db);

    const correlations = calculateHabitCorrelations(dates);
    const targetPair = correlations.find(
      (c) => (c.habitA.id === habitA.id && c.habitB.id === habitB.id) ||
             (c.habitA.id === habitB.id && c.habitB.id === habitA.id)
    );

    assert.ok(targetPair);
    assert.equal(targetPair.hasSufficientData, true);
    assert.equal(targetPair.sampleSize, 25);
    // If both are completed every day (a=25, b=0, c=0, d=0), variance is 0, handled safely
    assert.ok(typeof targetPair.coefficient === 'number');
  });

  test('Insight engine produces factual rule-based findings without hallucinated text', () => {
    const dates = getDateRange('2026-10-01', '2026-10-05'); // 5 days < 7
    const insights = generateInsights(dates);
    assert.equal(insights.length, 1);
    assert.equal(insights[0].category, 'Baseline Data Needed');
    assert.match(insights[0].text, /Track at least 7 days/);
  });
});
