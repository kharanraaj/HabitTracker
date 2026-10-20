/**
 * Habit Tracker - Visualization System (charts.js)
 * Chart.js standard visualizations with responsive sizing, instance lifecycle management,
 * dark/light theme awareness, and clear empty states.
 * Strictly consumes calculations from analytics.js.
 */

import {
  calculateRollingAverage,
  calculateWeekdayAnalysis,
  calculateCompletionRate,
  calculateAttainmentMetrics,
  calculateHabitCorrelations,
  getPastNDays
} from './analytics.js';
import { getHabits } from './habits.js';
import { loadDatabase } from './storage.js';

// Chart instance cache
const activeCharts = new Map();

/**
 * Destroy existing chart instance if it exists on canvas
 */
function destroyChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (canvas && typeof window !== 'undefined' && window.Chart && typeof window.Chart.getChart === 'function') {
    const existing = window.Chart.getChart(canvas);
    if (existing) {
      try {
        existing.destroy();
      } catch (e) {
        // ignore
      }
    }
  }
  if (activeCharts.has(canvasId)) {
    try {
      activeCharts.get(canvasId).destroy();
    } catch (e) {
      // ignore
    }
    activeCharts.delete(canvasId);
  }
}

/**
 * Get current theme chart options
 */
function getThemeChartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    textColor: isDark ? '#94a3b8' : '#475569',
    gridColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
    accentColor: getComputedStyle(document.documentElement).getPropertyValue('--accent-base').trim() || '#10b981',
    accentTranslucent: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.15)'
  };
}

/**
 * Render Rolling Trend Line Chart
 */
export function renderRollingTrendChart(canvasId, dates, windowSize = 7) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return;
  destroyChart(canvasId);

  const dataPoints = calculateRollingAverage(dates, windowSize);
  const labels = dataPoints.map((d) => d.date.slice(5)); // 'MM-DD'
  const dailyValues = dataPoints.map((d) => d.dailyRate);
  const rollingValues = dataPoints.map((d) => d.rollingRate);

  const colors = getThemeChartColors();

  const chart = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `${windowSize}-Day Rolling Average`,
          data: rollingValues,
          borderColor: colors.accentColor,
          backgroundColor: colors.accentTranslucent,
          borderWidth: 2.5,
          tension: 0.3,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4
        },
        {
          label: 'Daily Completion Rate',
          data: dailyValues,
          borderColor: colors.textColor,
          backgroundColor: 'transparent',
          borderWidth: 1.2,
          borderDash: [3, 3],
          tension: 0.1,
          pointRadius: 2,
          pointHoverRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: colors.textColor, font: { size: 11, weight: '500' } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%`
          }
        }
      },
      scales: {
        x: {
          grid: { color: colors.gridColor },
          ticks: { color: colors.textColor, font: { size: 10 }, maxTicksLimit: 12 }
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: colors.gridColor },
          ticks: {
            color: colors.textColor,
            font: { size: 10 },
            stepSize: 25,
            callback: (v) => `${v}%`
          }
        }
      }
    }
  });

  activeCharts.set(canvasId, chart);
}

/**
 * Render Weekday Consistency Bar Chart
 */
export function renderWeekdayBarChart(canvasId, dates) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return;
  destroyChart(canvasId);

  const analysis = calculateWeekdayAnalysis(dates);
  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const labels = weekdays.map((k) => `${analysis.weekdayStats[k].day.slice(0, 3)} (n=${analysis.weekdayStats[k].recorded})`);
  const values = weekdays.map((k) => analysis.weekdayStats[k].rate);

  const colors = getThemeChartColors();

  const chart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Completion Rate (%)',
          data: values,
          backgroundColor: values.map((val) => (val >= 75 ? colors.accentColor : val >= 50 ? 'rgba(245, 158, 11, 0.8)' : 'rgba(239, 68, 68, 0.75)')),
          borderRadius: 6,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `Rate: ${ctx.parsed.y}%`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: colors.textColor, font: { size: 11, weight: '500' } }
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: colors.gridColor },
          ticks: {
            color: colors.textColor,
            font: { size: 10 },
            stepSize: 25,
            callback: (v) => `${v}%`
          }
        }
      }
    }
  });

  activeCharts.set(canvasId, chart);
}

/**
 * Render Normalized Habit Radar Chart
 */
export function renderHabitRadarChart(canvasId, dates) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return;
  destroyChart(canvasId);

  const habits = getHabits({ includeArchived: false });
  if (habits.length < 3) {
    if (canvas.parentElement) {
      canvas.style.display = 'none';
      let notice = canvas.parentElement.querySelector('.chart-empty-notice');
      if (!notice) {
        notice = document.createElement('div');
        notice.className = 'chart-empty-notice';
        notice.style.padding = 'var(--space-8)';
        notice.style.textAlign = 'center';
        notice.style.color = 'var(--text-muted)';
        notice.style.fontSize = 'var(--text-sm)';
        notice.textContent = 'Radar habit profile requires at least three active habits.';
        canvas.parentElement.appendChild(notice);
      }
    }
    return;
  } else {
    canvas.style.display = 'block';
    const notice = canvas.parentElement?.querySelector('.chart-empty-notice');
    if (notice) notice.remove();
  }

  const labels = habits.map((h) => h.name);
  const values = habits.map((h) => {
    if (['quantity', 'duration', 'count'].includes(h.type)) {
      const att = calculateAttainmentMetrics(dates, h.id);
      return att ? Math.round(att.averageDailyAttainment) : 0;
    } else {
      const comp = calculateCompletionRate(dates, h.id);
      return Math.round(comp.rate);
    }
  });

  const colors = getThemeChartColors();

  const chart = new window.Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: [
        {
          label: 'Attainment / Completion Score (0-100)',
          data: values,
          borderColor: colors.accentColor,
          backgroundColor: colors.accentTranslucent,
          borderWidth: 2,
          pointBackgroundColor: colors.accentColor,
          pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.parsed.r}%`
          }
        }
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { stepSize: 25, display: false },
          grid: { color: colors.gridColor },
          angleLines: { color: colors.gridColor },
          pointLabels: { color: colors.textColor, font: { size: 11, weight: '600' } }
        }
      }
    }
  });

  activeCharts.set(canvasId, chart);
}

/**
 * Render Scatter Plot for numerical habit relationships
 */
export function renderScatterPlot(canvasId, dates) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return;
  destroyChart(canvasId);

  const habits = getHabits({ includeArchived: false }).filter((h) => ['duration', 'quantity', 'count'].includes(h.type));
  if (habits.length < 2) {
    if (canvas.parentElement) {
      canvas.style.display = 'none';
      let notice = canvas.parentElement.querySelector('.chart-empty-notice');
      if (!notice) {
        notice = document.createElement('div');
        notice.className = 'chart-empty-notice';
        notice.style.padding = 'var(--space-8)';
        notice.style.textAlign = 'center';
        notice.style.color = 'var(--text-muted)';
        notice.style.fontSize = 'var(--text-sm)';
        notice.textContent = 'Scatter plot requires at least two quantitative habits (Duration, Quantity, or Count).';
        canvas.parentElement.appendChild(notice);
      }
    }
    return;
  } else {
    canvas.style.display = 'block';
    const notice = canvas.parentElement?.querySelector('.chart-empty-notice');
    if (notice) notice.remove();
  }

  const habitA = habits[0];
  const habitB = habits[1];

  const db = loadDatabase();
  const entryMap = new Map();
  db.entries.forEach((e) => entryMap.set(`${e.habitId}::${e.date}`, e));

  const scatterData = [];
  dates.forEach((d) => {
    const entryA = entryMap.get(`${habitA.id}::${d}`);
    const entryB = entryMap.get(`${habitB.id}::${d}`);
    if (entryA && entryB && entryA.status !== 'not_recorded' && entryB.status !== 'not_recorded') {
      scatterData.push({
        x: Number(entryA.value) || 0,
        y: Number(entryB.value) || 0
      });
    }
  });

  const colors = getThemeChartColors();

  const chart = new window.Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: `${habitA.name} vs ${habitB.name}`,
          data: scatterData,
          backgroundColor: colors.accentColor,
          pointRadius: 5,
          pointHoverRadius: 7
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: colors.textColor }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${habitA.name}: ${ctx.parsed.x} ${habitA.unit}, ${habitB.name}: ${ctx.parsed.y} ${habitB.unit}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: colors.gridColor },
          ticks: { color: colors.textColor },
          title: { display: true, text: `${habitA.name} (${habitA.unit})`, color: colors.textColor }
        },
        y: {
          grid: { color: colors.gridColor },
          ticks: { color: colors.textColor },
          title: { display: true, text: `${habitB.name} (${habitB.unit})`, color: colors.textColor }
        }
      }
    }
  });

  activeCharts.set(canvasId, chart);
}

/**
 * Render Mini-Trend Line on Dashboard
 */
export function renderDashboardTrendMiniChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return;
  destroyChart(canvasId);

  const past28Days = getPastNDays(28);
  const dataPoints = calculateRollingAverage(past28Days, 7);

  const labels = dataPoints.map((d) => d.date.slice(5));
  const values = dataPoints.map((d) => d.rollingRate);

  const colors = getThemeChartColors();

  const chart = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '7-Day Rolling Rate',
          data: values,
          borderColor: colors.accentColor,
          backgroundColor: colors.accentTranslucent,
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.parsed.y}%` }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: colors.textColor, font: { size: 9 }, maxTicksLimit: 6 }
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: colors.gridColor },
          ticks: {
            color: colors.textColor,
            font: { size: 9 },
            stepSize: 50,
            callback: (v) => `${v}%`
          }
        }
      }
    }
  });

  activeCharts.set(canvasId, chart);
}

/**
 * Render Correlation Matrix Table in Analytics View
 */
export function renderCorrelationMatrixTable(containerId, dates) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const correlations = calculateHabitCorrelations(dates);
  const habits = getHabits({ includeArchived: false });

  if (habits.length < 2) {
    container.innerHTML = `
      <div style="padding: var(--space-6); text-align: center; color: var(--text-muted); font-size: var(--text-sm);">
        At least two active habits are required to analyze co-occurrence relationships.
      </div>
    `;
    return;
  }

  // Build matrix lookup
  const corrMap = new Map();
  correlations.forEach((c) => {
    corrMap.set(`${c.habitA.id}::${c.habitB.id}`, c);
    corrMap.set(`${c.habitB.id}::${c.habitA.id}`, c);
  });

  let html = `
    <table class="correlation-table">
      <thead>
        <tr>
          <th style="text-align: left;">Habit</th>
          ${habits.map((h) => `<th>${escapeHtml(h.name)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
  `;

  habits.forEach((hA) => {
    html += `<tr><td style="text-align: left; font-weight: 600;">${escapeHtml(hA.name)}</td>`;
    habits.forEach((hB) => {
      if (hA.id === hB.id) {
        html += `<td class="corr-cell" style="background-color: var(--bg-card-subtle); color: var(--text-muted);">1.00</td>`;
      } else {
        const corr = corrMap.get(`${hA.id}::${hB.id}`);
        if (!corr || !corr.hasSufficientData) {
          const sample = corr ? corr.sampleSize : 0;
          html += `<td class="corr-cell corr-insufficient" title="Need &ge; 20 paired days. Currently ${sample}.">n=${sample}</td>`;
        } else {
          const val = corr.coefficient;
          let cellClass = 'corr-neutral';
          if (val >= 0.4) cellClass = 'corr-positive-high';
          else if (val >= 0.15) cellClass = 'corr-positive-mod';
          else if (val <= -0.4) cellClass = 'corr-negative-high';
          else if (val <= -0.15) cellClass = 'corr-negative-mod';

          html += `
            <td class="corr-cell ${cellClass}" title="Phi: ${val} (n=${corr.sampleSize})">
              ${val > 0 ? '+' : ''}${val.toFixed(2)}
            </td>
          `;
        }
      }
    });
    html += `</tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
