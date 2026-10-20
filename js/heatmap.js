/**
 * Habit Tracker - Calendar Heatmap (heatmap.js)
 * Custom GitHub-style calendar heatmap visualization with completion intensity,
 * tooltips, date jumps, and per-habit filtering.
 */

import { getTodayDateStr, parseLocalDateStr, toLocalDateStr } from './storage.js';
import { getHabits, isHabitEligibleOnDate, WEEKDAYS, WEEKDAY_LABELS } from './habits.js';
import { calculateCompletionRate } from './analytics.js';
import { setWeekStartDate } from './tracker.js';

let activeTooltip = null;

/**
 * Render the Calendar Heatmap
 * @param {string|null} filterHabitId - 'all' or habit UUID
 * @param {number} [weeksCount=52] - Number of weeks to display
 */
export function renderHeatmap(filterHabitId = 'all', weeksCount = 52) {
  const container = document.getElementById('calendar-heatmap-container');
  const filterSelect = document.getElementById('heatmap-habit-filter');
  if (!container) return;

  // Populate habit filter dropdown
  if (filterSelect) {
    const habits = getHabits({ includeArchived: false });
    const currentVal = filterHabitId || filterSelect.value || 'all';
    filterSelect.innerHTML = '<option value="all">All Habits (Overall Intensity)</option>';
    habits.forEach((h) => {
      const opt = document.createElement('option');
      opt.value = h.id;
      opt.textContent = h.name;
      filterSelect.appendChild(opt);
    });
    filterSelect.value = currentVal;

    filterSelect.onchange = () => {
      renderHeatmap(filterSelect.value, weeksCount);
    };
  }

  // Calculate date grid: 52 weeks ending on the current week's Sunday
  const todayStr = getTodayDateStr();
  const todayObj = parseLocalDateStr(todayStr);

  // Find end of current week (Sunday)
  const todayDay = todayObj.getDay();
  const daysToSunday = todayDay === 0 ? 0 : 7 - todayDay;
  const endDate = new Date(todayObj);
  endDate.setDate(todayObj.getDate() + daysToSunday);

  // Total days = weeksCount * 7
  const totalDays = weeksCount * 7;
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - totalDays + 1);

  // Group into weeks (each week has 7 days, Mon-Sun)
  const weeks = [];
  let cur = new Date(startDate);
  let currentWeek = [];

  while (cur <= endDate) {
    currentWeek.push(toLocalDateStr(cur));
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    cur.setDate(cur.getDate() + 1);
  }
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  // Pre-calculate month labels
  const monthLabels = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let lastMonth = -1;

  weeks.forEach((week, wIdx) => {
    const firstDayInWeek = parseLocalDateStr(week[0]);
    const m = firstDayInWeek.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ text: monthNames[m], weekIndex: wIdx });
      lastMonth = m;
    }
  });

  // Build HTML
  let html = '';

  // Month header row
  html += `<div class="heatmap-month-labels" style="position: relative; height: 18px;">`;
  monthLabels.forEach((ml) => {
    // Each column is 17px (13px cell + 4px gap)
    const leftPx = 28 + ml.weekIndex * 17;
    html += `<span style="position: absolute; left: ${leftPx}px;">${ml.text}</span>`;
  });
  html += `</div>`;

  // Grid inner (day labels on left + week columns)
  html += `<div class="heatmap-grid-inner">`;

  // Day of week labels (Mon, Wed, Fri)
  html += `
    <div class="heatmap-day-labels">
      <span></span>
      <span>Mon</span>
      <span></span>
      <span>Wed</span>
      <span></span>
      <span>Fri</span>
      <span></span>
    </div>
  `;

  // Columns of cells
  html += `<div class="heatmap-columns">`;

  const habits = getHabits({ includeArchived: false });
  const habitToFilter = filterHabitId !== 'all' ? habits.find((h) => h.id === filterHabitId) : null;

  weeks.forEach((week) => {
    html += `<div class="heatmap-week-col">`;
    week.forEach((dateStr) => {
      let level = 0;
      let title = '';
      let isFuture = dateStr > todayStr;
      let isEligible = true;

      if (isFuture) {
        html += `<div class="heatmap-cell cell-ineligible" data-date="${dateStr}" title="${dateStr} (Future)"></div>`;
        return;
      }

      if (habitToFilter) {
        // Single habit view
        const elig = isHabitEligibleOnDate(habitToFilter, dateStr);
        if (!elig.eligible) {
          isEligible = false;
          html += `<div class="heatmap-cell cell-ineligible" data-date="${dateStr}" title="${dateStr} (Not scheduled)"></div>`;
          return;
        }

        const metrics = calculateCompletionRate([dateStr], habitToFilter.id);
        if (metrics.completedEligibleDays > 0) {
          level = 4;
          title = `${dateStr}: ${habitToFilter.name} Completed`;
        } else if (metrics.recordedEligibleDays > 0) {
          level = 0;
          title = `${dateStr}: ${habitToFilter.name} Missed / Incomplete`;
        } else {
          level = 0;
          title = `${dateStr}: Not recorded`;
        }
      } else {
        // Overall habit view
        const metrics = calculateCompletionRate([dateStr]);
        const pct = metrics.rate;
        if (metrics.recordedEligibleDays === 0) {
          level = 0;
          title = `${dateStr}: No records`;
        } else if (pct === 0) {
          level = 0;
          title = `${dateStr}: 0% completed (${metrics.completedEligibleDays}/${metrics.recordedEligibleDays} habits)`;
        } else if (pct <= 25) {
          level = 1;
          title = `${dateStr}: ${pct}% completed (${metrics.completedEligibleDays}/${metrics.recordedEligibleDays} habits)`;
        } else if (pct <= 50) {
          level = 2;
          title = `${dateStr}: ${pct}% completed (${metrics.completedEligibleDays}/${metrics.recordedEligibleDays} habits)`;
        } else if (pct <= 75) {
          level = 3;
          title = `${dateStr}: ${pct}% completed (${metrics.completedEligibleDays}/${metrics.recordedEligibleDays} habits)`;
        } else {
          level = 4;
          title = `${dateStr}: ${pct}% completed (${metrics.completedEligibleDays}/${metrics.recordedEligibleDays} habits)`;
        }
      }

      html += `<div class="heatmap-cell level-${level}" data-date="${dateStr}" data-title="${title}" tabindex="0" role="button" aria-label="${title}"></div>`;
    });
    html += `</div>`;
  });

  html += `</div></div>`;
  container.innerHTML = html;

  // Attach hover tooltips & click handlers to cells
  setupHeatmapInteractions(container);
}

function setupHeatmapInteractions(container) {
  const cells = container.querySelectorAll('.heatmap-cell:not(.cell-ineligible)');

  cells.forEach((cell) => {
    cell.addEventListener('mouseenter', (e) => {
      const text = cell.getAttribute('data-title');
      if (text) showHeatmapTooltip(e.target, text);
    });

    cell.addEventListener('mouseleave', () => {
      hideHeatmapTooltip();
    });

    // Click jumps to weekly tracker for that week!
    cell.addEventListener('click', () => {
      const dateStr = cell.getAttribute('data-date');
      if (dateStr) {
        // Find week start for clicked date
        const dObj = parseLocalDateStr(dateStr);
        const day = dObj.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        dObj.setDate(dObj.getDate() + diff);
        const weekStartStr = toLocalDateStr(dObj);

        setWeekStartDate(weekStartStr);
        window.location.hash = '#tracker';
      }
    });

    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        cell.click();
      }
    });
  });
}

function showHeatmapTooltip(targetElem, text) {
  hideHeatmapTooltip();

  const tooltip = document.createElement('div');
  tooltip.className = 'heatmap-tooltip';
  tooltip.style.position = 'absolute';
  tooltip.style.backgroundColor = 'var(--bg-elevated)';
  tooltip.style.color = 'var(--text-primary)';
  tooltip.style.border = '1px solid var(--border-default)';
  tooltip.style.borderRadius = 'var(--radius-sm)';
  tooltip.style.padding = '4px 8px';
  tooltip.style.fontSize = '11px';
  tooltip.style.fontWeight = '500';
  tooltip.style.boxShadow = 'var(--shadow-md)';
  tooltip.style.pointerEvents = 'none';
  tooltip.style.zIndex = '1200';
  tooltip.style.whiteSpace = 'nowrap';
  tooltip.textContent = text;

  document.body.appendChild(tooltip);
  activeTooltip = tooltip;

  const rect = targetElem.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

  tooltip.style.top = `${rect.top + window.scrollY - tooltipRect.height - 6}px`;
  tooltip.style.left = `${rect.left + window.scrollX - tooltipRect.width / 2 + rect.width / 2}px`;
}

function hideHeatmapTooltip() {
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
}
