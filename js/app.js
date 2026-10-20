/**
 * Habit Tracker - Application Controller & Router (app.js)
 * Coordinates page initialization, routing, theme switching, and global event dispatching.
 */

import {
  loadDatabase,
  getSettings,
  updateSettings,
  getTodayDateStr,
  parseLocalDateStr,
  exportJSON,
  importJSON,
  validateImportData,
  exportEntriesCSV,
  exportHabitsCSV,
  getStorageUsageBytes
} from './storage.js';
import { getHabits, isHabitEligibleOnDate, openHabitModal, renderHabitsPage, WEEKDAY_LABELS } from './habits.js';
import { getEntry, setEntry, renderTrackerPage, getCurrentWeekStartDate } from './tracker.js';
import {
  calculateCompletionRate,
  calculateHabitStreaks,
  calculateConsistencyScore,
  calculateGoalPacing,
  calculateRecoveryAnalysis,
  calculateWeekdayAnalysis,
  generateInsights,
  getPastNDays
} from './analytics.js';
import {
  renderRollingTrendChart,
  renderWeekdayBarChart,
  renderHabitRadarChart,
  renderScatterPlot,
  renderDashboardTrendMiniChart,
  renderCorrelationMatrixTable
} from './charts.js';
import { renderHeatmap } from './heatmap.js';
import {
  getIconSvg,
  formatDate,
  formatDuration,
  formatNumber,
  showToast,
  openModal,
  closeModal,
  confirmDialog,
  escapeHtml
} from './ui.js';

// Cache for fetched page templates
const pageTemplateCache = new Map();

// Supported routes
const VALID_ROUTES = ['dashboard', 'tracker', 'analytics', 'habits', 'settings'];
let currentRoute = 'dashboard';
let currentAnalyticsPeriod = 30; // default 30 days

/**
 * Initialize Application
 */
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initApp());
  } else {
    initApp();
  }
}

export function initApp() {
  applyStoredThemeAndAccent();
  updateLiveDateHeader();
  updateSidebarCounter();

  // Setup Router
  window.addEventListener('hashchange', handleRoute);
  handleRoute();

  // Setup Global Header Controls
  setupHeaderEvents();

  // Setup Event Listeners for State Changes
  window.addEventListener('habits-updated', () => {
    updateSidebarCounter();
    refreshActivePage();
  });
  window.addEventListener('entries-updated', () => {
    updateSidebarCounter();
    refreshActivePage();
  });
  window.addEventListener('settings-updated', () => {
    applyStoredThemeAndAccent();
    refreshActivePage();
  });
}

/**
 * Apply theme and accent color immediately
 */
function applyStoredThemeAndAccent() {
  const settings = getSettings();
  const theme = settings.theme || 'dark';
  const accent = settings.accentColor || 'emerald';

  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-accent', accent);

  // Update theme toggle icon in topbar
  const toggleIcon = document.getElementById('topbar-theme-icon');
  if (toggleIcon) {
    if (theme === 'light') {
      toggleIcon.innerHTML = `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/>`;
    } else if (theme === 'oled') {
      toggleIcon.innerHTML = `<circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20Z" fill="currentColor"/>`;
    } else {
      toggleIcon.innerHTML = `<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`;
    }
  }
}

/**
 * Update current date in header badge
 */
function updateLiveDateHeader() {
  const badgeText = document.getElementById('current-date-text');
  if (badgeText) {
    const todayStr = getTodayDateStr();
    badgeText.textContent = formatDate(todayStr, 'ddd, MMM D');
  }
}

/**
 * Update sidebar entry counter
 */
function updateSidebarCounter() {
  const countEl = document.getElementById('sidebar-entries-count');
  if (countEl) {
    const db = loadDatabase();
    const recordedCount = db.entries.filter((e) => e.status !== 'not_recorded').length;
    countEl.textContent = `${recordedCount} entries recorded`;
  }
}

/**
 * Setup Global Header & Navigation Events
 */
function setupHeaderEvents() {
  const themeBtn = document.getElementById('topbar-theme-toggle');
  if (themeBtn) {
    themeBtn.onclick = () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      let next = 'dark';
      if (current === 'dark') next = 'oled';
      else if (current === 'oled') next = 'light';
      else next = 'dark';

      updateSettings({ theme: next });
      applyStoredThemeAndAccent();
      showToast(`Switched to ${next.toUpperCase()} theme`, 'info');
      refreshActivePage();
    };
  }
}

/**
 * Router: load and render page view
 */
function handleRoute() {
  const hash = window.location.hash.replace('#', '').trim();
  const route = VALID_ROUTES.includes(hash) ? hash : 'dashboard';
  currentRoute = route;

  // Update navigation active states
  document.querySelectorAll('.nav-link, .mobile-nav-link').forEach((link) => {
    const page = link.getAttribute('data-page');
    if (page === route) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
    }
  });

  const pageContainer = document.getElementById('page-container');
  if (!pageContainer) return;

  // First try embedded <template> elements (fast, offline-first)
  const templateEl = document.getElementById(`template-${route}`);
  if (templateEl) {
    const cloned = templateEl.content.cloneNode(true);
    pageContainer.innerHTML = '';
    pageContainer.appendChild(cloned);
    initRouteController(route);
    return;
  }

  // Fallback: fetch from pages/ directory
  let templateHtml = pageTemplateCache.get(route);
  if (templateHtml) {
    pageContainer.innerHTML = templateHtml;
    initRouteController(route);
    return;
  }

  fetch(`./pages/${route}.html`)
    .then((response) => {
      if (!response.ok) throw new Error(`Could not load page ${route}`);
      return response.text();
    })
    .then((html) => {
      pageTemplateCache.set(route, html);
      pageContainer.innerHTML = html;
      initRouteController(route);
    })
    .catch((err) => {
      console.error(`Route error for ${route}:`, err);
      pageContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">Page Loading Error</div>
          <div class="empty-state-desc">${escapeHtml(err.message)}</div>
        </div>
      `;
    });
}

/**
 * Route View Controllers
 */
function initRouteController(route) {
  switch (route) {
    case 'dashboard':
      initDashboardView();
      break;
    case 'tracker':
      renderTrackerPage();
      break;
    case 'analytics':
      initAnalyticsView();
      break;
    case 'habits':
      renderHabitsPage();
      break;
    case 'settings':
      initSettingsView();
      break;
  }
}

function refreshActivePage() {
  initRouteController(currentRoute);
}

/* ==========================================================================
   VIEW 1: Dashboard Controller
   ========================================================================== */

function initDashboardView() {
  const todayStr = getTodayDateStr();
  const activeHabits = getHabits({ includeArchived: false });
  const eligibleToday = activeHabits.filter((h) => isHabitEligibleOnDate(h, todayStr).eligible);

  let completedToday = 0;
  eligibleToday.forEach((h) => {
    const e = getEntry(h.id, todayStr);
    if (e && (e.status === 'completed' || e.status === 'compliant')) completedToday++;
  });

  const activeCount = eligibleToday.length;
  const remainingCount = Math.max(0, activeCount - completedToday);
  const completionPct = activeCount > 0 ? Math.round((completedToday / activeCount) * 100) : 0;

  // 1. Progress Ring
  const ringIndicator = document.getElementById('hero-ring-indicator');
  const ringPercent = document.getElementById('hero-ring-percent');
  const ringRatio = document.getElementById('hero-ring-ratio');
  const statusMsg = document.getElementById('hero-status-message');

  const statActive = document.getElementById('hero-stat-active');
  const statCompleted = document.getElementById('hero-stat-completed');
  const statRemaining = document.getElementById('hero-stat-remaining');

  if (statActive) statActive.textContent = activeCount;
  if (statCompleted) statCompleted.textContent = completedToday;
  if (statRemaining) statRemaining.textContent = remainingCount;

  if (ringPercent) ringPercent.textContent = `${completionPct}%`;
  if (ringRatio) ringRatio.textContent = `${completedToday} of ${activeCount} habits`;

  if (ringIndicator) {
    const circumference = 2 * Math.PI * 70; // r=70 -> 439.82
    const offset = circumference - (completionPct / 100) * circumference;
    ringIndicator.style.strokeDashoffset = offset;
  }

  if (statusMsg) {
    if (activeCount === 0) {
      statusMsg.textContent = 'No habits scheduled for today.';
    } else if (completionPct === 100) {
      statusMsg.textContent = 'Outstanding work! All scheduled habits completed today.';
    } else if (completionPct >= 50) {
      statusMsg.textContent = `Great momentum: ${completedToday} done, ${remainingCount} to go today.`;
    } else if (completedToday > 0) {
      statusMsg.textContent = `${completedToday} habit completed today. Keep the streak going.`;
    } else {
      statusMsg.textContent = `${activeCount} habits scheduled for today. Ready when you are.`;
    }
  }

  // 2. 7-Day Completion Strip
  renderDashboardStrip();

  // 3. Quick Habit List
  renderDashboardQuickHabits(eligibleToday, todayStr);

  // 4. Streaks & Records Highlights
  renderDashboardStreaks(activeHabits);

  // 5. Mini Weekly Trend Chart
  renderDashboardTrendMiniChart('dashboardTrendCanvas');

  // 6. Actionable Insight Card
  renderDashboardInsight();

  // Button binds
  const quickTrackBtn = document.getElementById('dash-quick-track-btn');
  const addHabitBtn = document.getElementById('dash-add-habit-btn');
  if (quickTrackBtn) quickTrackBtn.onclick = () => { window.location.hash = '#tracker'; };
  if (addHabitBtn) addHabitBtn.onclick = () => openHabitModal();
}

function renderDashboardStrip() {
  const strip = document.getElementById('dashboard-strip');
  if (!strip) return;

  const past7 = getPastNDays(7);
  const todayStr = getTodayDateStr();

  strip.innerHTML = past7
    .map((dateStr) => {
      const dObj = parseLocalDateStr(dateStr);
      const dayIdx = dObj.getDay();
      const weekdayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayIdx];
      const isToday = dateStr === todayStr;

      const metrics = calculateCompletionRate([dateStr]);
      const rate = metrics.rate;
      let pillClass = 'pct-0';
      let label = '0%';

      if (metrics.recordedEligibleDays === 0) {
        pillClass = '';
        label = '&ndash;';
      } else if (rate === 100) {
        pillClass = 'pct-100';
        label = '100%';
      } else if (rate > 0) {
        pillClass = 'pct-partial';
        label = `${rate}%`;
      }

      return `
        <div class="strip-day ${isToday ? 'today' : ''}" title="${dateStr}: ${label}">
          <span class="strip-weekday">${WEEKDAY_LABELS[weekdayKey]}</span>
          <div class="strip-pill ${pillClass}">
            ${label}
          </div>
        </div>
      `;
    })
    .join('');
}

function renderDashboardQuickHabits(habits, dateStr) {
  const list = document.getElementById('dashboard-quick-list');
  if (!list) return;

  if (habits.length === 0) {
    list.innerHTML = `
      <div style="padding: var(--space-4); text-align: center; color: var(--text-muted); font-size: var(--text-sm);">
        No habits scheduled for today.
      </div>
    `;
    return;
  }

  list.innerHTML = habits
    .map((habit) => {
      const entry = getEntry(habit.id, dateStr);
      let isDone = false;
      let currentVal = 0;

      if (entry) {
        currentVal = entry.value;
        if (habit.type === 'avoidance') isDone = entry.status === 'compliant';
        else if (habit.type === 'yes_no') isDone = entry.status === 'completed';
        else isDone = entry.value >= habit.target || entry.status === 'completed';
      }

      const displayVal = habit.type === 'duration' ? formatDuration(currentVal) : currentVal;
      const displayTarget = habit.type === 'duration' ? formatDuration(habit.target) : `${habit.target} ${habit.unit}`;

      return `
        <div class="quick-habit-row ${isDone ? 'completed' : ''}" data-id="${habit.id}">
          <div class="quick-habit-left">
            <div class="habit-icon-box" style="width: 34px; height: 34px;">
              ${getIconSvg(habit.icon)}
            </div>
            <div class="quick-habit-info">
              <span class="quick-habit-name">${escapeHtml(habit.name)}</span>
              <span class="quick-habit-target">${displayVal} / ${displayTarget}</span>
            </div>
          </div>
          <div class="quick-habit-actions">
            <button class="btn btn-sm ${isDone ? 'btn-primary' : 'btn-secondary'} btn-quick-toggle" data-id="${habit.id}">
              ${isDone ? '&#10003; Done' : 'Complete'}
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  list.querySelectorAll('.btn-quick-toggle').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-id');
      const habit = habits.find((h) => h.id === id);
      if (!habit) return;

      const entry = getEntry(habit.id, dateStr);
      let isDone = false;
      if (entry) {
        if (habit.type === 'avoidance') isDone = entry.status === 'compliant';
        else if (habit.type === 'yes_no') isDone = entry.status === 'completed';
        else isDone = entry.value >= habit.target;
      }

      if (isDone) {
        // Toggle to not recorded
        setEntry({ habitId: habit.id, date: dateStr, value: 0, status: 'not_recorded' });
        showToast(`Reset ${habit.name}`, 'info');
      } else {
        // Complete target
        const status = habit.type === 'avoidance' ? 'compliant' : 'completed';
        setEntry({ habitId: habit.id, date: dateStr, value: habit.target, status });
        showToast(`Completed ${habit.name}!`, 'success');
      }
    };
  });
}

function renderDashboardStreaks(habits) {
  const grid = document.getElementById('dashboard-streaks-grid');
  if (!grid) return;

  const streakData = habits
    .map((h) => {
      const streaks = calculateHabitStreaks(h.id);
      return {
        habit: h,
        current: streaks.currentStreak,
        longest: streaks.longestStreak
      };
    })
    .sort((a, b) => b.current - a.current);

  if (streakData.length === 0) {
    grid.innerHTML = `<div style="color: var(--text-muted); font-size: var(--text-sm);">No active habits.</div>`;
    return;
  }

  grid.innerHTML = streakData
    .slice(0, 4)
    .map((item) => `
      <div class="streak-card">
        <span class="streak-card-title">${escapeHtml(item.habit.name)}</span>
        <div class="streak-card-val">
          ${getIconSvg('flame')}
          <span>${item.current} days</span>
        </div>
        <span style="font-size: 11px; color: var(--text-muted);">Best: ${item.longest} days</span>
      </div>
    `)
    .join('');
}

function renderDashboardInsight() {
  const tagEl = document.getElementById('dash-insight-category');
  const textEl = document.getElementById('dash-insight-text');
  const evidenceEl = document.getElementById('dash-insight-evidence-text');

  if (!tagEl || !textEl) return;

  const past30 = getPastNDays(30);
  const insights = generateInsights(past30);

  if (insights.length > 0) {
    const top = insights[0];
    tagEl.textContent = top.category;
    textEl.textContent = top.text;
    if (evidenceEl) evidenceEl.textContent = top.evidence;
  }
}

/* ==========================================================================
   VIEW 2: Analytics Controller
   ========================================================================== */

function initAnalyticsView() {
  const periodBtns = document.querySelectorAll('[data-period]');
  periodBtns.forEach((btn) => {
    btn.onclick = () => {
      periodBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.getAttribute('data-period');
      currentAnalyticsPeriod = val === 'all' ? 365 : parseInt(val, 10);
      updateAnalyticsData();
    };
  });

  updateAnalyticsData();
}

function updateAnalyticsData() {
  const dates = getPastNDays(currentAnalyticsPeriod);

  // 1. Primary Metrics
  const compMetrics = calculateCompletionRate(dates);
  const statCompRate = document.getElementById('stat-completion-rate');
  const statCompObs = document.getElementById('stat-completion-obs');

  if (statCompRate) statCompRate.textContent = `${compMetrics.rate}%`;
  if (statCompObs) {
    statCompObs.textContent = `${compMetrics.completedEligibleDays} completed of ${compMetrics.recordedEligibleDays} recorded days`;
  }

  // Streaks
  const habits = getHabits({ includeArchived: false });
  let topCurrentStreak = 0;
  let topStreakHabitName = 'No active streak';
  let bestStreakAllTime = 0;
  let bestStreakHabitName = 'All habits';

  habits.forEach((h) => {
    const s = calculateHabitStreaks(h.id);
    if (s.currentStreak > topCurrentStreak) {
      topCurrentStreak = s.currentStreak;
      topStreakHabitName = h.name;
    }
    if (s.longestStreak > bestStreakAllTime) {
      bestStreakAllTime = s.longestStreak;
      bestStreakHabitName = h.name;
    }
  });

  const statTopStreak = document.getElementById('stat-top-streak');
  const statTopHabit = document.getElementById('stat-top-streak-habit');
  const statBestStreak = document.getElementById('stat-best-streak');
  const statBestHabit = document.getElementById('stat-best-streak-habit');

  if (statTopStreak) statTopStreak.textContent = `${topCurrentStreak} days`;
  if (statTopHabit) statTopHabit.textContent = topStreakHabitName;
  if (statBestStreak) statBestStreak.textContent = `${bestStreakAllTime} days`;
  if (statBestHabit) statBestHabit.textContent = bestStreakHabitName;

  // Consistency Score
  const consistency = calculateConsistencyScore(dates);
  const statScore = document.getElementById('stat-consistency-score');
  const statRating = document.getElementById('stat-consistency-rating');
  const consistencyBadge = document.getElementById('consistency-badge');

  if (statScore) statScore.textContent = `${consistency.score} / 100`;
  if (consistencyBadge) consistencyBadge.textContent = `Score: ${consistency.score} / 100`;
  if (statRating) {
    if (!consistency.hasSufficientData) statRating.textContent = 'Awaiting baseline data (n<7)';
    else if (consistency.score >= 85) statRating.textContent = 'Excellent Consistency';
    else if (consistency.score >= 70) statRating.textContent = 'Strong Habit Retention';
    else if (consistency.score >= 50) statRating.textContent = 'Moderate Regularity';
    else statRating.textContent = 'Developing Consistency';
  }

  // Consistency Breakdown Table
  const breakdownTbody = document.getElementById('consistency-breakdown-body');
  if (breakdownTbody) {
    const c1 = consistency.components.completionRate;
    const c2 = consistency.components.attainment;
    const c3 = consistency.components.recentRegularity;

    breakdownTbody.innerHTML = `
      <tr>
        <td style="font-weight: 600;">Completion Rate</td>
        <td>60%</td>
        <td>Ratio of completed eligible days to recorded days across active window</td>
        <td>${c1.raw}%</td>
        <td style="color: var(--accent-base);">${c1.contribution} pts</td>
      </tr>
      <tr>
        <td style="font-weight: 600;">Target Attainment</td>
        <td>25%</td>
        <td>Average attainment toward target thresholds (quantity/duration capped at 100%)</td>
        <td>${c2.raw}%</td>
        <td style="color: var(--accent-base);">${c2.contribution} pts</td>
      </tr>
      <tr>
        <td style="font-weight: 600;">Recent Regularity</td>
        <td>15%</td>
        <td>Performance over the most recent 14-day trailing cycle</td>
        <td>${c3.raw}%</td>
        <td style="color: var(--accent-base);">${c3.contribution} pts</td>
      </tr>
    `;
  }

  // 2. Calendar Heatmap
  renderHeatmap('all', 52);

  // 3. Charts
  renderRollingTrendChart('rollingTrendCanvas', dates, 7);
  renderWeekdayBarChart('weekdayBarCanvas', dates);
  renderHabitRadarChart('habitRadarCanvas', dates);
  renderScatterPlot('scatterPlotCanvas', dates);
  renderCorrelationMatrixTable('correlation-matrix-container', dates);

  // 4. Pacing
  const pacing = calculateGoalPacing('month');
  const pacingBar = document.getElementById('pacing-progress-bar');
  const pacingBadge = document.getElementById('pacing-status-badge');
  const pacingTarget = document.getElementById('pacing-target-val');
  const pacingCompleted = document.getElementById('pacing-completed-val');
  const pacingRemDays = document.getElementById('pacing-remaining-days');
  const pacingEffort = document.getElementById('pacing-effort-needed');

  if (pacingBar) pacingBar.style.width = `${Math.min(100, pacing.progressPercent)}%`;
  if (pacingTarget) pacingTarget.textContent = pacing.totalTargetSessions;
  if (pacingCompleted) pacingCompleted.textContent = pacing.completedSoFar;
  if (pacingRemDays) pacingRemDays.textContent = pacing.remainingDays;
  if (pacingEffort) pacingEffort.textContent = `${pacing.dailyEffortNeeded} / day`;

  if (pacingBadge) {
    if (!pacing.isAchievable) {
      pacingBadge.className = 'badge badge-danger';
      pacingBadge.textContent = 'Pacing Gap';
    } else if (pacing.progressPercent >= 70) {
      pacingBadge.className = 'badge badge-success';
      pacingBadge.textContent = 'On Track';
    } else {
      pacingBadge.className = 'badge badge-neutral';
      pacingBadge.textContent = 'In Progress';
    }
  }

  // 5. Recovery Analysis
  const recovery = calculateRecoveryAnalysis(dates);
  const recRate = document.getElementById('recovery-rate-val');
  const recAvg = document.getElementById('recovery-avg-time');
  const recGap = document.getElementById('recovery-interruption-len');
  const recTotal = document.getElementById('recovery-total-gaps');

  if (recRate) recRate.textContent = `${recovery.recoveryRate}%`;
  if (recAvg) recAvg.textContent = `${recovery.avgResumeTime} days`;
  if (recGap) recGap.textContent = `${recovery.avgGapLength} days`;
  if (recTotal) recTotal.textContent = recovery.totalInterruptions;

  // 6. Actionable Insights Feed
  const feed = document.getElementById('analytics-insights-feed');
  if (feed) {
    const insights = generateInsights(dates);
    feed.innerHTML = insights
      .map((item) => `
        <div class="insight-feed-item type-${item.type}">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="badge ${item.type === 'warning' ? 'badge-warning' : 'badge-accent'}">${escapeHtml(item.category)}</span>
            <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(item.evidence)}</span>
          </div>
          <div style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin-top: 2px;">
            ${escapeHtml(item.text)}
          </div>
          <div style="font-size: var(--text-xs); color: var(--text-secondary);">
            <strong>Actionable step:</strong> ${escapeHtml(item.actionable)}
          </div>
        </div>
      `)
      .join('');
  }
}

/* ==========================================================================
   VIEW 3: Settings Controller
   ========================================================================== */

function initSettingsView() {
  const currentSettings = getSettings();

  // Themes
  const themeRadios = document.querySelectorAll('input[name="app-theme"]');
  themeRadios.forEach((radio) => {
    radio.checked = radio.value === currentSettings.theme;
    radio.onchange = () => {
      updateSettings({ theme: radio.value });
      applyStoredThemeAndAccent();
      showToast(`Theme updated to ${radio.value}`, 'success');
    };
  });

  // Accent color buttons
  const accentBtns = document.querySelectorAll('.btn-accent-color');
  accentBtns.forEach((btn) => {
    const acc = btn.getAttribute('data-accent');
    if (acc === currentSettings.accentColor) {
      btn.style.boxShadow = `0 0 0 2px ${btn.style.backgroundColor}`;
    } else {
      btn.style.boxShadow = 'none';
    }

    btn.onclick = () => {
      accentBtns.forEach((b) => (b.style.boxShadow = 'none'));
      btn.style.boxShadow = `0 0 0 2px ${btn.style.backgroundColor}`;
      updateSettings({ accentColor: acc });
      applyStoredThemeAndAccent();
      showToast(`Accent color updated`, 'success');
    };
  });

  // Regional selects
  const weekStartSelect = document.getElementById('setting-week-start');
  const dateFormatSelect = document.getElementById('setting-date-format');
  const numFormatSelect = document.getElementById('setting-number-format');
  const periodSelect = document.getElementById('setting-default-period');

  if (weekStartSelect) {
    weekStartSelect.value = currentSettings.weekStart;
    weekStartSelect.onchange = () => updateSettings({ weekStart: weekStartSelect.value });
  }
  if (dateFormatSelect) {
    dateFormatSelect.value = currentSettings.dateFormat;
    dateFormatSelect.onchange = () => updateSettings({ dateFormat: dateFormatSelect.value });
  }
  if (numFormatSelect) {
    numFormatSelect.value = currentSettings.numberFormat;
    numFormatSelect.onchange = () => updateSettings({ numberFormat: numFormatSelect.value });
  }
  if (periodSelect) {
    periodSelect.value = String(currentSettings.defaultAnalyticsPeriod);
    periodSelect.onchange = () => updateSettings({ defaultAnalyticsPeriod: parseInt(periodSelect.value, 10) });
  }

  // Storage usage
  const storageUsageText = document.getElementById('storage-usage-text');
  if (storageUsageText) {
    const bytes = getStorageUsageBytes();
    const kb = (bytes / 1024).toFixed(1);
    storageUsageText.textContent = `${kb} KB used`;
  }

  // JSON Export
  const exportJsonBtn = document.getElementById('export-json-btn');
  if (exportJsonBtn) {
    exportJsonBtn.onclick = () => {
      const jsonStr = exportJSON();
      downloadTextFile(`habit_tracker_backup_${getTodayDateStr()}.json`, jsonStr, 'application/json');
      showToast('JSON backup exported successfully.', 'success');
    };
  }

  // JSON Import
  const importFileInput = document.getElementById('import-json-file-input');
  if (importFileInput) {
    importFileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const raw = evt.target.result;
          const validation = validateImportData(raw);

          if (!validation.valid) {
            showToast(`Import rejected: ${validation.errors.join(' ')}`, 'error');
            return;
          }

          // Open confirmation modal with preview
          openImportPreviewModal(validation, raw);
        } catch (err) {
          showToast(`Import error: ${err.message}`, 'error');
        }
      };
      reader.readAsText(file);
      importFileInput.value = ''; // Reset input
    };
  }

  // CSV Exports
  const exportEntriesBtn = document.getElementById('export-entries-csv-btn');
  const exportHabitsBtn = document.getElementById('export-habits-csv-btn');
  const exportAnalyticsBtn = document.getElementById('export-analytics-csv-btn');

  if (exportEntriesBtn) {
    exportEntriesBtn.onclick = () => {
      const csv = exportEntriesCSV();
      downloadTextFile(`habit_entries_${getTodayDateStr()}.csv`, csv, 'text/csv');
      showToast('Daily entries CSV exported.', 'success');
    };
  }
  if (exportHabitsBtn) {
    exportHabitsBtn.onclick = () => {
      const csv = exportHabitsCSV();
      downloadTextFile(`habit_definitions_${getTodayDateStr()}.csv`, csv, 'text/csv');
      showToast('Habit definitions CSV exported.', 'success');
    };
  }
  if (exportAnalyticsBtn) {
    exportAnalyticsBtn.onclick = () => {
      const dates = getPastNDays(30);
      const comp = calculateCompletionRate(dates);
      const consistency = calculateConsistencyScore(dates);
      const csvContent = [
        'Metric,Value',
        `Completion Rate,${comp.rate}%`,
        `Recorded Eligible Days,${comp.recordedEligibleDays}`,
        `Completed Eligible Days,${comp.completedEligibleDays}`,
        `Consistency Score,${consistency.score}/100`,
        `Export Date,${getTodayDateStr()}`
      ].join('\r\n');
      downloadTextFile(`habit_analytics_summary_${getTodayDateStr()}.csv`, csvContent, 'text/csv');
      showToast('Analytics summary CSV exported.', 'success');
    };
  }

  // Danger Zone: Reset
  const resetBtn = document.getElementById('reset-all-data-btn');
  if (resetBtn) {
    resetBtn.onclick = async () => {
      const step1 = await confirmDialog({
        title: 'Reset All Data (Step 1 of 2)',
        message: 'Are you sure you want to delete all entries and restore default habits? This cannot be undone.',
        confirmText: 'Continue to Confirmation',
        isDanger: true
      });
      if (!step1) return;

      const step2 = await confirmDialog({
        title: 'Final Confirmation (Step 2 of 2)',
        message: 'This will completely erase your local database. Do you have a recent JSON backup export?',
        confirmText: 'Erase Everything',
        isDanger: true
      });

      if (step2) {
        if (typeof localStorage !== 'undefined') {
          localStorage.clear();
        }
        showToast('Application reset. Restoring initial workspace...', 'warning');
        setTimeout(() => {
          window.location.reload();
        }, 800);
      }
    };
  }
}

function openImportPreviewModal(validation, rawJson) {
  const { summary } = validation;
  const content = document.createElement('div');
  content.innerHTML = `
    <p style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-4);">
      Verified valid backup schema (Version ${summary.version}). Choose how you want to apply the imported data:
    </p>

    <div style="padding: var(--space-3); border-radius: var(--radius-md); background-color: var(--bg-card-subtle); border: 1px solid var(--border-subtle); margin-bottom: var(--space-4); font-size: var(--text-sm);">
      <div>&bull; <strong>${summary.habitsCount}</strong> habits in backup</div>
      <div>&bull; <strong>${summary.entriesCount}</strong> historical entries in backup</div>
    </div>

    <div class="form-group">
      <label class="form-label">Import Strategy</label>
      <label class="radio-card" style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border-default); display: flex; align-items: center; gap: var(--space-3); cursor: pointer; margin-bottom: var(--space-2);">
        <input type="radio" name="import-strat" value="merge" checked />
        <div>
          <div style="font-weight: 600; font-size: var(--text-sm);">Merge with existing data</div>
          <div style="font-size: var(--text-xs); color: var(--text-muted);">Combines habits and retains existing records</div>
        </div>
      </label>
      <label class="radio-card" style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border-default); display: flex; align-items: center; gap: var(--space-3); cursor: pointer;">
        <input type="radio" name="import-strat" value="replace" />
        <div>
          <div style="font-weight: 600; font-size: var(--text-sm); color: var(--color-danger);">Replace all current data</div>
          <div style="font-size: var(--text-xs); color: var(--text-muted);">Creates a safe recovery backup first, then replaces database</div>
        </div>
      </label>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="import-cancel-btn" type="button">Cancel</button>
    <button class="btn btn-primary" id="import-confirm-btn" type="button">Apply Import</button>
  `;

  openModal('Confirm Data Import', content, {
    footerHtml: footer,
    onOpen: (body) => {
      document.getElementById('import-cancel-btn')?.addEventListener('click', closeModal);
      document.getElementById('import-confirm-btn')?.addEventListener('click', () => {
        const strategy = body.querySelector('input[name="import-strat"]:checked')?.value || 'merge';
        try {
          const res = importJSON(rawJson, strategy);
          closeModal();
          showToast(`Successfully imported: ${res.habitsCount} habits, ${res.entriesCount} entries (${res.strategy}).`, 'success');
          window.dispatchEvent(new CustomEvent('habits-updated'));
          window.dispatchEvent(new CustomEvent('entries-updated'));
        } catch (err) {
          showToast(`Import failed: ${err.message}`, 'error');
        }
      });
    }
  });
}

function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
