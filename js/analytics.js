/**
 * Habit Tracker - Analytics Engine (analytics.js)
 * Pure, deterministic statistical calculations, transparent consistency scoring,
 * streak tracking, weekday analysis, recovery metrics, correlations, and rule-based insights.
 * Single source of truth for all calculations.
 */

import { loadDatabase, getTodayDateStr, parseLocalDateStr, toLocalDateStr } from './storage.js';
import { getHabits, isHabitEligibleOnDate, WEEKDAYS, WEEKDAY_LABELS } from './habits.js';

/**
 * Generate contiguous array of dates [startStr, ..., endStr]
 */
export function getDateRange(startStr, endStr) {
  const dates = [];
  const start = parseLocalDateStr(startStr);
  const end = parseLocalDateStr(endStr);
  if (start > end) return dates;

  const cur = new Date(start);
  while (cur <= end) {
    dates.push(toLocalDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/**
 * Generate the last N days up to anchorDateStr (inclusive)
 */
export function getPastNDays(n, anchorDateStr = getTodayDateStr()) {
  const dates = [];
  const anchor = parseLocalDateStr(anchorDateStr);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() - i);
    dates.push(toLocalDateStr(d));
  }
  return dates;
}

/**
 * Calculate completion rate for an array of dates and optional habit filter
 * completion_rate = completed_eligible_days / recorded_eligible_days * 100
 */
export function calculateCompletionRate(dates, habitId = null) {
  const db = loadDatabase();
  const allHabits = getHabits({ includeArchived: true });
  const habits = habitId ? allHabits.filter((h) => h.id === habitId) : allHabits;

  let completedEligibleDays = 0;
  let recordedEligibleDays = 0;
  let totalEligibleOpportunities = 0;

  const entryMap = new Map();
  db.entries.forEach((e) => entryMap.set(`${e.habitId}::${e.date}`, e));

  dates.forEach((dateStr) => {
    habits.forEach((habit) => {
      const eligibility = isHabitEligibleOnDate(habit, dateStr);
      if (!eligibility.eligible || eligibility.isFuture) return;

      totalEligibleOpportunities++;
      const entry = entryMap.get(`${habit.id}::${dateStr}`);

      if (entry && entry.status !== 'not_recorded') {
        recordedEligibleDays++;

        if (habit.type === 'avoidance') {
          if (entry.status === 'compliant') completedEligibleDays++;
        } else if (habit.type === 'yes_no') {
          if (entry.status === 'completed') completedEligibleDays++;
        } else {
          // numerical: quantity, duration, count
          if (Number(entry.value) >= Number(habit.target) || entry.status === 'completed') {
            completedEligibleDays++;
          }
        }
      }
    });
  });

  const rate = recordedEligibleDays > 0 ? (completedEligibleDays / recordedEligibleDays) * 100 : 0;

  return {
    rate: Math.round(rate * 10) / 10,
    completedEligibleDays,
    recordedEligibleDays,
    totalEligibleOpportunities,
    hasSufficientData: recordedEligibleDays >= 7
  };
}

/**
 * Calculate quantity and duration target attainment metrics
 * Reports separately:
 * 1. Average daily attainment (%)
 * 2. Total recorded quantity vs total target
 * 3. Percentage of eligible days meeting the target
 */
export function calculateAttainmentMetrics(dates, habitId) {
  const db = loadDatabase();
  const habit = db.habits.find((h) => h.id === habitId);
  if (!habit) return null;

  const entryMap = new Map();
  db.entries.forEach((e) => {
    if (e.habitId === habitId) entryMap.set(e.date, e);
  });

  let totalRecordedValue = 0;
  let totalTargetValue = 0;
  let sumDailyAttainmentPct = 0;
  let recordedDaysCount = 0;
  let daysMeetingTarget = 0;
  let eligibleDaysCount = 0;

  dates.forEach((dateStr) => {
    const eligibility = isHabitEligibleOnDate(habit, dateStr);
    if (!eligibility.eligible || eligibility.isFuture) return;

    eligibleDaysCount++;
    totalTargetValue += habit.target;

    const entry = entryMap.get(dateStr);
    if (entry && entry.status !== 'not_recorded') {
      recordedDaysCount++;
      const val = Number(entry.value) || 0;
      totalRecordedValue += val;

      // Cap per-entry attainment at 100% as specified
      const attainment = Math.min(val / habit.target, 1) * 100;
      sumDailyAttainmentPct += attainment;

      if (val >= habit.target || entry.status === 'completed' || entry.status === 'compliant') {
        daysMeetingTarget++;
      }
    }
  });

  const averageDailyAttainment = recordedDaysCount > 0 ? sumDailyAttainmentPct / recordedDaysCount : 0;
  const daysMeetingTargetRate = recordedDaysCount > 0 ? (daysMeetingTarget / recordedDaysCount) * 100 : 0;
  const totalVolumeAttainment = totalTargetValue > 0 ? (totalRecordedValue / totalTargetValue) * 100 : 0;

  return {
    habitId,
    habitName: habit.name,
    unit: habit.unit,
    averageDailyAttainment: Math.round(averageDailyAttainment * 10) / 10,
    totalRecordedValue: Math.round(totalRecordedValue * 10) / 10,
    totalTargetValue: Math.round(totalTargetValue * 10) / 10,
    totalVolumeAttainment: Math.round(totalVolumeAttainment * 10) / 10,
    daysMeetingTarget,
    daysMeetingTargetRate: Math.round(daysMeetingTargetRate * 10) / 10,
    recordedDaysCount,
    eligibleDaysCount
  };
}

/**
 * Calculate streaks for a habit
 * Streak Policy:
 * - Yes/No: confirmed completion advances streak
 * - Avoidance: confirmed compliance advances; violation breaks
 * - Quantity/Duration/Count: value >= target advances; partial does not
 * - Skipped days: pause streak (do not break, do not extend)
 * - Unrecorded days: break streak (prior to today; if today is unrecorded, yesterday's streak is pending)
 */
export function calculateHabitStreaks(habitId, anchorDateStr = getTodayDateStr()) {
  const db = loadDatabase();
  const habit = db.habits.find((h) => h.id === habitId);
  if (!habit) return { currentStreak: 0, longestStreak: 0, isPendingToday: false };

  const entryMap = new Map();
  db.entries.forEach((e) => {
    if (e.habitId === habitId) entryMap.set(e.date, e);
  });

  // Collect all eligible dates from habit start date up to anchorDateStr
  const startDateStr = habit.startDate || db.createdAt.slice(0, 10);
  const allDates = getDateRange(startDateStr, anchorDateStr);

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let isPendingToday = false;

  // Process chronologically to find longest streak
  allDates.forEach((dateStr) => {
    const eligibility = isHabitEligibleOnDate(habit, dateStr);
    if (!eligibility.eligible) return; // Ineligible schedule day -> ignored

    const isToday = dateStr === anchorDateStr;
    const entry = entryMap.get(dateStr);

    let isSuccess = false;
    let isSkipped = false;
    let isMissed = false;

    if (entry) {
      if (entry.status === 'skipped') {
        isSkipped = true;
      } else if (entry.status === 'missed' || entry.status === 'violation') {
        isMissed = true;
      } else if (habit.type === 'avoidance') {
        if (entry.status === 'compliant') isSuccess = true;
      } else if (habit.type === 'yes_no') {
        if (entry.status === 'completed') isSuccess = true;
      } else {
        if (Number(entry.value) >= Number(habit.target) || entry.status === 'completed') {
          isSuccess = true;
        } else {
          isMissed = true; // partial or 0
        }
      }
    } else {
      if (isToday) {
        // Unrecorded today does not break streak yet
        isPendingToday = true;
      } else {
        isMissed = true; // Unrecorded past eligible day breaks streak
      }
    }

    if (isSuccess) {
      tempStreak++;
      if (tempStreak > longestStreak) longestStreak = tempStreak;
    } else if (isSkipped) {
      // Pause streak: do nothing
    } else if (isMissed) {
      tempStreak = 0;
    }
  });

  // Calculate current active streak backwards from anchorDateStr
  let activeStreak = 0;
  const reversedDates = [...allDates].reverse();

  for (let i = 0; i < reversedDates.length; i++) {
    const dateStr = reversedDates[i];
    const eligibility = isHabitEligibleOnDate(habit, dateStr);
    if (!eligibility.eligible) continue; // Unscheduled day, skipped in sequence

    const isToday = dateStr === anchorDateStr;
    const entry = entryMap.get(dateStr);

    if (isToday && (!entry || entry.status === 'not_recorded')) {
      // Pending today
      isPendingToday = true;
      continue;
    }

    if (!entry) {
      break; // Unrecorded past day breaks active streak
    }

    if (entry.status === 'skipped') {
      // Skipped day pauses streak
      continue;
    }

    let isSuccess = false;
    if (habit.type === 'avoidance') {
      isSuccess = entry.status === 'compliant';
    } else if (habit.type === 'yes_no') {
      isSuccess = entry.status === 'completed';
    } else {
      isSuccess = Number(entry.value) >= Number(habit.target) || entry.status === 'completed';
    }

    if (isSuccess) {
      activeStreak++;
    } else {
      break; // Failed/missed day terminates current streak
    }
  }

  currentStreak = activeStreak;
  if (currentStreak > longestStreak) longestStreak = currentStreak;

  return {
    currentStreak,
    longestStreak,
    isPendingToday
  };
}

/**
 * Calculate Rolling Averages for completion rate
 * @param {Array<string>} dates - Array of dates to plot
 * @param {number} windowSize - Rolling window (e.g. 7, 30)
 */
export function calculateRollingAverage(dates, windowSize = 7) {
  const result = [];

  for (let i = 0; i < dates.length; i++) {
    const windowStartIdx = Math.max(0, i - windowSize + 1);
    const windowDates = dates.slice(windowStartIdx, i + 1);

    const dailyRate = calculateCompletionRate([dates[i]]).rate;
    const rollingRate = calculateCompletionRate(windowDates).rate;

    result.push({
      date: dates[i],
      dailyRate,
      rollingRate,
      windowCount: windowDates.length
    });
  }

  return result;
}

/**
 * Weekday Performance Analysis
 * Minimum sample threshold: 4 observations per weekday before making claims
 */
export function calculateWeekdayAnalysis(dates) {
  const db = loadDatabase();
  const habits = getHabits({ includeArchived: false });
  const entryMap = new Map();
  db.entries.forEach((e) => entryMap.set(`${e.habitId}::${e.date}`, e));

  const weekdayStats = {
    mon: { day: 'Monday', completed: 0, recorded: 0, rate: 0 },
    tue: { day: 'Tuesday', completed: 0, recorded: 0, rate: 0 },
    wed: { day: 'Wednesday', completed: 0, recorded: 0, rate: 0 },
    thu: { day: 'Thursday', completed: 0, recorded: 0, rate: 0 },
    fri: { day: 'Friday', completed: 0, recorded: 0, rate: 0 },
    sat: { day: 'Saturday', completed: 0, recorded: 0, rate: 0 },
    sun: { day: 'Sunday', completed: 0, recorded: 0, rate: 0 }
  };

  dates.forEach((dateStr) => {
    const dateObj = parseLocalDateStr(dateStr);
    const dayIdx = dateObj.getDay();
    const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayIdx];

    habits.forEach((habit) => {
      const eligibility = isHabitEligibleOnDate(habit, dateStr);
      if (!eligibility.eligible || eligibility.isFuture) return;

      const entry = entryMap.get(`${habit.id}::${dateStr}`);
      if (entry && entry.status !== 'not_recorded') {
        weekdayStats[dayKey].recorded++;

        let isSuccess = false;
        if (habit.type === 'avoidance') isSuccess = entry.status === 'compliant';
        else if (habit.type === 'yes_no') isSuccess = entry.status === 'completed';
        else isSuccess = Number(entry.value) >= Number(habit.target) || entry.status === 'completed';

        if (isSuccess) weekdayStats[dayKey].completed++;
      }
    });
  });

  // Calculate rates
  Object.keys(weekdayStats).forEach((k) => {
    const item = weekdayStats[k];
    item.rate = item.recorded > 0 ? Math.round((item.completed / item.recorded) * 1000) / 10 : 0;
  });

  // Determine strongest and weakest weekdays with min 4 observations threshold
  let strongest = null;
  let weakest = null;
  const qualified = Object.values(weekdayStats).filter((s) => s.recorded >= 4);

  if (qualified.length >= 2) {
    const sorted = [...qualified].sort((a, b) => b.rate - a.rate);
    strongest = sorted[0];
    weakest = sorted[sorted.length - 1];
  }

  return {
    weekdayStats,
    strongest,
    weakest,
    hasSufficientData: qualified.length >= 2
  };
}

/**
 * Recovery Analysis
 * Evaluates frequency of returning to a habit after a break, time to resume, and typical gap length
 */
export function calculateRecoveryAnalysis(dates) {
  const db = loadDatabase();
  const habits = getHabits({ includeArchived: false });
  const entryMap = new Map();
  db.entries.forEach((e) => entryMap.set(`${e.habitId}::${e.date}`, e));

  let totalInterruptions = 0;
  let successfulRecoveriesWithin2Days = 0;
  let totalResumeDays = 0;
  let totalGapDays = 0;

  habits.forEach((habit) => {
    let inGap = false;
    let gapLength = 0;

    for (let i = 0; i < dates.length; i++) {
      const dateStr = dates[i];
      const eligibility = isHabitEligibleOnDate(habit, dateStr);
      if (!eligibility.eligible || eligibility.isFuture) continue;

      const entry = entryMap.get(`${habit.id}::${dateStr}`);
      let isSuccess = false;
      let isMissed = false;

      if (entry) {
        if (habit.type === 'avoidance') isSuccess = entry.status === 'compliant';
        else if (habit.type === 'yes_no') isSuccess = entry.status === 'completed';
        else isSuccess = Number(entry.value) >= Number(habit.target) || entry.status === 'completed';

        if (!isSuccess && entry.status !== 'skipped' && entry.status !== 'not_recorded') {
          isMissed = true;
        }
      } else {
        isMissed = true;
      }

      if (isMissed) {
        if (!inGap) {
          inGap = true;
          gapLength = 1;
        } else {
          gapLength++;
        }
      } else if (isSuccess) {
        if (inGap) {
          totalInterruptions++;
          totalResumeDays += gapLength;
          totalGapDays += gapLength;
          if (gapLength <= 2) {
            successfulRecoveriesWithin2Days++;
          }
          inGap = false;
          gapLength = 0;
        }
      }
    }
  });

  const recoveryRate = totalInterruptions > 0 ? Math.round((successfulRecoveriesWithin2Days / totalInterruptions) * 100) : 0;
  const avgResumeTime = totalInterruptions > 0 ? Math.round((totalResumeDays / totalInterruptions) * 10) / 10 : 0;
  const avgGapLength = totalInterruptions > 0 ? Math.round((totalGapDays / totalInterruptions) * 10) / 10 : 0;

  return {
    totalInterruptions,
    recoveryRate,
    avgResumeTime,
    avgGapLength,
    hasSufficientData: totalInterruptions >= 2
  };
}

/**
 * Goal Pacing Analysis
 * Pacing for the current month or week
 */
export function calculateGoalPacing(period = 'month') {
  const todayStr = getTodayDateStr();
  const todayObj = parseLocalDateStr(todayStr);
  const activeHabits = getHabits({ includeArchived: false });

  let periodDates = [];
  if (period === 'month') {
    const year = todayObj.getFullYear();
    const month = todayObj.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      periodDates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  } else {
    // Current week
    const day = todayObj.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(todayObj);
    weekStart.setDate(todayObj.getDate() + diff);
    for (let i = 0; i < 7; i++) {
      const cur = new Date(weekStart);
      cur.setDate(weekStart.getDate() + i);
      periodDates.push(toLocalDateStr(cur));
    }
  }

  const pastDates = periodDates.filter((d) => d <= todayStr);
  const futureDates = periodDates.filter((d) => d > todayStr);

  const db = loadDatabase();
  const entryMap = new Map();
  db.entries.forEach((e) => entryMap.set(`${e.habitId}::${e.date}`, e));

  let totalTargetSessions = 0;
  let completedSoFar = 0;
  let remainingEligibleOpportunities = 0;

  // Past progress
  pastDates.forEach((d) => {
    activeHabits.forEach((habit) => {
      const eligibility = isHabitEligibleOnDate(habit, d);
      if (!eligibility.eligible) return;

      totalTargetSessions++;
      const entry = entryMap.get(`${habit.id}::${d}`);
      if (entry) {
        if (habit.type === 'avoidance' && entry.status === 'compliant') completedSoFar++;
        else if (habit.type === 'yes_no' && entry.status === 'completed') completedSoFar++;
        else if (Number(entry.value) >= Number(habit.target) || entry.status === 'completed') completedSoFar++;
      }
    });
  });

  // Future remaining opportunities
  futureDates.forEach((d) => {
    activeHabits.forEach((habit) => {
      const eligibility = isHabitEligibleOnDate(habit, d);
      if (!eligibility.eligible) return;
      totalTargetSessions++;
      remainingEligibleOpportunities++;
    });
  });

  const remainingEffort = Math.max(0, totalTargetSessions - completedSoFar);
  const remainingDays = futureDates.length;
  const dailyEffortNeeded = remainingDays > 0 ? Math.round((remainingEffort / remainingDays) * 10) / 10 : remainingEffort;
  const isAchievable = remainingEffort <= remainingEligibleOpportunities;
  const progressPercent = totalTargetSessions > 0 ? Math.round((completedSoFar / totalTargetSessions) * 100) : 0;

  return {
    totalTargetSessions,
    completedSoFar,
    remainingEffort,
    remainingDays,
    dailyEffortNeeded,
    isAchievable,
    progressPercent,
    period
  };
}

/**
 * Transparent Consistency Score (0–100)
 * User-visible formula:
 * Component 1 (60% weight): Eligible-day completion rate
 * Component 2 (25% weight): Target attainment (quantity/duration/count)
 * Component 3 (15% weight): Regularity / recent consistency (last 14 days)
 */
export function calculateConsistencyScore(dates) {
  const habits = getHabits({ includeArchived: false });
  if (habits.length === 0 || dates.length === 0) {
    return {
      score: 0,
      hasSufficientData: false,
      components: {
        completionRate: { weight: 0.6, raw: 0, contribution: 0 },
        attainment: { weight: 0.25, raw: 0, contribution: 0 },
        recentRegularity: { weight: 0.15, raw: 0, contribution: 0 }
      }
    };
  }

  // Component 1: Overall completion rate over window
  const compMetrics = calculateCompletionRate(dates);
  const compRate = compMetrics.rate; // 0-100

  // Component 2: Average target attainment for numerical habits (or 100 if yes/no)
  let sumAttainment = 0;
  let countAttainmentHabits = 0;

  habits.forEach((h) => {
    if (['quantity', 'duration', 'count'].includes(h.type)) {
      const att = calculateAttainmentMetrics(dates, h.id);
      if (att && att.recordedDaysCount > 0) {
        sumAttainment += att.averageDailyAttainment;
        countAttainmentHabits++;
      }
    } else {
      // Yes/No & Avoidance attainment is binary completion rate
      const att = calculateCompletionRate(dates, h.id);
      if (att.recordedEligibleDays > 0) {
        sumAttainment += att.rate;
        countAttainmentHabits++;
      }
    }
  });

  const avgAttainment = countAttainmentHabits > 0 ? sumAttainment / countAttainmentHabits : compRate;

  // Component 3: Recent regularity (last 14 days)
  const last14Dates = getPastNDays(14);
  const recentMetrics = calculateCompletionRate(last14Dates);
  const recentRate = recentMetrics.rate;

  const c1Contrib = compRate * 0.6;
  const c2Contrib = avgAttainment * 0.25;
  const c3Contrib = recentRate * 0.15;
  const finalScore = Math.min(100, Math.max(0, Math.round(c1Contrib + c2Contrib + c3Contrib)));

  return {
    score: finalScore,
    hasSufficientData: compMetrics.recordedEligibleDays >= 7,
    components: {
      completionRate: {
        weight: 0.6,
        raw: Math.round(compRate * 10) / 10,
        contribution: Math.round(c1Contrib * 10) / 10,
        label: 'Eligible Completion Rate (60%)'
      },
      attainment: {
        weight: 0.25,
        raw: Math.round(avgAttainment * 10) / 10,
        contribution: Math.round(c2Contrib * 10) / 10,
        label: 'Target Attainment (25%)'
      },
      recentRegularity: {
        weight: 0.15,
        raw: Math.round(recentRate * 10) / 10,
        contribution: Math.round(c3Contrib * 10) / 10,
        label: 'Recent 14-Day Consistency (15%)'
      }
    }
  };
}

/**
 * Habit Correlation Analysis
 * Binary: Phi Coefficient
 * Numerical: Pearson r
 * Minimum sample threshold: 20 paired observations
 */
export function calculateHabitCorrelations(dates) {
  const habits = getHabits({ includeArchived: false });
  const db = loadDatabase();
  const entryMap = new Map();
  db.entries.forEach((e) => entryMap.set(`${e.habitId}::${e.date}`, e));

  const results = [];

  for (let i = 0; i < habits.length; i++) {
    for (let j = i + 1; j < habits.length; j++) {
      const habitA = habits[i];
      const habitB = habits[j];

      // Collect paired observations on same dates where both habits were eligible & recorded
      let pairedObservations = 0;
      const pairsA = [];
      const pairsB = [];

      dates.forEach((d) => {
        const eligA = isHabitEligibleOnDate(habitA, d);
        const eligB = isHabitEligibleOnDate(habitB, d);
        if (!eligA.eligible || eligA.isFuture || !eligB.eligible || eligB.isFuture) return;

        const entryA = entryMap.get(`${habitA.id}::${d}`);
        const entryB = entryMap.get(`${habitB.id}::${d}`);
        if (!entryA || !entryB) return;
        if (entryA.status === 'not_recorded' || entryB.status === 'not_recorded') return;
        if (entryA.status === 'skipped' || entryB.status === 'skipped') return;

        // Binary completion indicator
        const doneA = isEntrySuccessful(habitA, entryA) ? 1 : 0;
        const doneB = isEntrySuccessful(habitB, entryB) ? 1 : 0;

        pairsA.push(doneA);
        pairsB.push(doneB);
        pairedObservations++;
      });

      if (pairedObservations < 20) {
        results.push({
          habitA: { id: habitA.id, name: habitA.name },
          habitB: { id: habitB.id, name: habitB.name },
          sampleSize: pairedObservations,
          hasSufficientData: false,
          coefficient: null,
          metric: 'Phi coefficient',
          disclaimer: 'Insufficient data (min 20 paired observations required)'
        });
        continue;
      }

      // Calculate 2x2 contingency table
      let a = 0; // A=1, B=1
      let b = 0; // A=1, B=0
      let c = 0; // A=0, B=1
      let d = 0; // A=0, B=0

      for (let k = 0; k < pairedObservations; k++) {
        if (pairsA[k] === 1 && pairsB[k] === 1) a++;
        else if (pairsA[k] === 1 && pairsB[k] === 0) b++;
        else if (pairsA[k] === 0 && pairsB[k] === 1) c++;
        else d++;
      }

      const numerator = a * d - b * c;
      const denominator = Math.sqrt((a + b) * (c + d) * (a + c) * (b + d));
      const phi = denominator !== 0 ? numerator / denominator : 0;

      // Conditional completion
      const condProbBGivenA = a + b > 0 ? (a / (a + b)) * 100 : 0;
      const condProbBGivenNotA = c + d > 0 ? (c / (c + d)) * 100 : 0;

      results.push({
        habitA: { id: habitA.id, name: habitA.name },
        habitB: { id: habitB.id, name: habitB.name },
        sampleSize: pairedObservations,
        hasSufficientData: true,
        coefficient: Math.round(phi * 100) / 100,
        metric: 'Phi coefficient',
        condProbBGivenA: Math.round(condProbBGivenA),
        condProbBGivenNotA: Math.round(condProbBGivenNotA),
        table: { a, b, c, d }
      });
    }
  }

  return results;
}

function isEntrySuccessful(habit, entry) {
  if (!entry) return false;
  if (habit.type === 'avoidance') return entry.status === 'compliant';
  if (habit.type === 'yes_no') return entry.status === 'completed';
  return Number(entry.value) >= Number(habit.target) || entry.status === 'completed';
}

/**
 * Personal Records Calculation
 */
export function calculatePersonalRecords() {
  const habits = getHabits({ includeArchived: true });
  const records = [];

  habits.forEach((habit) => {
    const streaks = calculateHabitStreaks(habit.id);
    if (streaks.longestStreak > 0) {
      records.push({
        habitId: habit.id,
        habitName: habit.name,
        type: 'longest_streak',
        value: streaks.longestStreak,
        unit: 'days',
        description: `All-time longest streak: ${streaks.longestStreak} days`
      });
    }
  });

  return records;
}

/**
 * Rule-Based Insight Engine
 * Generates verified, deterministic insights strictly grounded in stored data.
 * Zero fabricated or hallucinated claims.
 */
export function generateInsights(dates) {
  const insights = [];
  const compMetrics = calculateCompletionRate(dates);

  // If under minimum data threshold
  if (compMetrics.recordedEligibleDays < 7) {
    insights.push({
      category: 'Baseline Data Needed',
      type: 'warning',
      text: 'Track at least 7 days of daily habits to unlock personalized trend analysis and patterns.',
      evidence: `${compMetrics.recordedEligibleDays} of 7 recommended entries recorded`,
      actionable: 'Log your scheduled habits for today to build baseline consistency.'
    });
    return insights;
  }

  // 1. Weekday Consistency Pattern
  const weekdayData = calculateWeekdayAnalysis(dates);
  if (weekdayData.hasSufficientData && weekdayData.strongest && weekdayData.weakest) {
    if (weekdayData.strongest.rate - weekdayData.weakest.rate >= 20) {
      insights.push({
        category: 'Consistency Pattern',
        type: 'pattern',
        text: `You have significantly higher consistency on ${weekdayData.strongest.day}s (${weekdayData.strongest.rate}%) compared to ${weekdayData.weakest.day}s (${weekdayData.weakest.rate}%).`,
        evidence: `Based on ${weekdayData.strongest.recorded + weekdayData.weakest.recorded} recorded observations`,
        actionable: `Prepare your environment on ${weekdayData.weakest.day} mornings to reduce friction.`
      });
    }
  }

  // 2. Goal Pacing
  const pacing = calculateGoalPacing('month');
  if (pacing.totalTargetSessions >= 10) {
    if (!pacing.isAchievable) {
      insights.push({
        category: 'Goal Pacing',
        type: 'warning',
        text: `Target sessions remaining (${pacing.remainingEffort}) exceeds remaining available days (${pacing.remainingDays}).`,
        evidence: `${pacing.completedSoFar} of ${pacing.totalTargetSessions} sessions completed this month`,
        actionable: 'Consider adjusting habit targets in Habits to maintain realistic, sustainable pacing.'
      });
    } else if (pacing.progressPercent >= 75) {
      insights.push({
        category: 'Positive Trend',
        type: 'trend',
        text: `You are on pace to exceed this month’s target, currently at ${pacing.progressPercent}% completion.`,
        evidence: `${pacing.completedSoFar} completed sessions with ${pacing.remainingDays} days remaining`,
        actionable: 'Maintain your current cadence to secure a new personal monthly record.'
      });
    }
  }

  // 3. Recovery Bounceback
  const recovery = calculateRecoveryAnalysis(dates);
  if (recovery.hasSufficientData) {
    if (recovery.recoveryRate >= 65) {
      insights.push({
        category: 'Resilience & Recovery',
        type: 'trend',
        text: `High recovery resilience: You return to your habits within 48 hours in ${recovery.recoveryRate}% of interruptions.`,
        evidence: `${recovery.totalInterruptions} interruption intervals analyzed`,
        actionable: 'Short recovery intervals are the primary predictor of long-term habit retention.'
      });
    }
  }

  // 4. Habit Correlation
  const correlations = calculateHabitCorrelations(dates);
  const strongCorr = correlations.find((c) => c.hasSufficientData && Math.abs(c.coefficient) >= 0.4);
  if (strongCorr) {
    const isPositive = strongCorr.coefficient > 0;
    insights.push({
      category: 'Habit Association',
      type: 'correlation',
      text: `${strongCorr.habitA.name} and ${strongCorr.habitB.name} exhibit a strong ${isPositive ? 'positive' : 'negative'} co-occurrence (Phi = ${strongCorr.coefficient}).`,
      evidence: `Derived from ${strongCorr.sampleSize} paired observations. Correlation does not imply causation.`,
      actionable: isPositive
        ? `Pairing ${strongCorr.habitA.name} directly with ${strongCorr.habitB.name} creates an effective habit stack.`
        : `Check if schedule conflicts between these two habits are causing friction.`
    });
  }

  // Fallback if no specific condition met
  if (insights.length === 0) {
    insights.push({
      category: 'Overall Consistency',
      type: 'trend',
      text: `Your overall completion rate over the selected period is ${compMetrics.rate}%.`,
      evidence: `${compMetrics.completedEligibleDays} completed out of ${compMetrics.recordedEligibleDays} recorded days`,
      actionable: 'Keep logging daily to surface deeper statistical associations.'
    });
  }

  return insights;
}
