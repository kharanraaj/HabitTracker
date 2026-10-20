/**
 * Habit Tracker - Daily & Weekly Tracker Module (tracker.js)
 * Excel-style weekly grid, daily focus view, cell editing by type, undo history
 */

import { loadDatabase, saveDatabase, getTodayDateStr, parseLocalDateStr, toLocalDateStr, generateUUID } from './storage.js';
import { getHabits, isHabitEligibleOnDate, WEEKDAY_LABELS } from './habits.js';
import { getIconSvg, formatDuration, showToast, openModal, closeModal, escapeHtml } from './ui.js';

// Undo stack
const undoStack = [];
const MAX_UNDO = 50;

// State: currently viewed week start date (YYYY-MM-DD, always Monday or Sunday based on settings)
let currentWeekStartDateStr = null;
let currentViewMode = 'grid'; // 'grid' | 'focus'

/**
 * Get or initialize current week start date string
 */
export function getCurrentWeekStartDate() {
  if (currentWeekStartDateStr) return currentWeekStartDateStr;
  const db = loadDatabase();
  const weekStartPref = db.settings?.weekStart || 'monday';
  const today = new Date();

  // Find start of current week
  const day = today.getDay(); // 0 is Sun, 1 is Mon...
  let diff = 0;
  if (weekStartPref === 'monday') {
    diff = day === 0 ? -6 : 1 - day;
  } else {
    diff = -day;
  }

  const start = new Date(today);
  start.setDate(today.getDate() + diff);
  currentWeekStartDateStr = toLocalDateStr(start);
  return currentWeekStartDateStr;
}

export function setWeekStartDate(dateStr) {
  currentWeekStartDateStr = dateStr;
}

/**
 * Get entry for habit on date
 */
export function getEntry(habitId, dateStr) {
  const db = loadDatabase();
  return db.entries.find((e) => e.habitId === habitId && e.date === dateStr) || null;
}

/**
 * Set/update entry with undo tracking
 */
export function setEntry(entryData, { trackUndo = true } = {}) {
  const db = loadDatabase();
  const existingIdx = db.entries.findIndex((e) => e.habitId === entryData.habitId && e.date === entryData.date);
  const previousEntry = existingIdx !== -1 ? { ...db.entries[existingIdx] } : null;

  const nowIso = new Date().toISOString();
  const newEntry = {
    id: previousEntry ? previousEntry.id : generateUUID(),
    habitId: entryData.habitId,
    date: entryData.date,
    value: Number(entryData.value) || 0,
    status: entryData.status || 'not_recorded',
    note: entryData.note !== undefined ? String(entryData.note) : previousEntry ? previousEntry.note : '',
    createdAt: previousEntry ? previousEntry.createdAt : nowIso,
    updatedAt: nowIso
  };

  if (existingIdx !== -1) {
    db.entries[existingIdx] = newEntry;
  } else {
    db.entries.push(newEntry);
  }

  saveDatabase(db);

  if (trackUndo) {
    undoStack.push({
      previous: previousEntry,
      current: newEntry
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  window.dispatchEvent(new CustomEvent('entries-updated', { detail: { entry: newEntry, previous: previousEntry } }));
  return newEntry;
}

/**
 * Perform undo
 */
export function undoLastAction() {
  if (undoStack.length === 0) {
    showToast('Nothing to undo.', 'info');
    return false;
  }

  const action = undoStack.pop();
  const db = loadDatabase();

  if (action.previous) {
    // Revert to previous
    const idx = db.entries.findIndex((e) => e.habitId === action.previous.habitId && e.date === action.previous.date);
    if (idx !== -1) {
      db.entries[idx] = action.previous;
    } else {
      db.entries.push(action.previous);
    }
  } else {
    // Revert addition -> remove entry
    db.entries = db.entries.filter((e) => !(e.habitId === action.current.habitId && e.date === action.current.date));
  }

  saveDatabase(db);
  window.dispatchEvent(new CustomEvent('entries-updated', { detail: { action: 'undo' } }));
  showToast('Change undone.', 'info');
  return true;
}

/**
 * Generate 7 days of the current week view
 */
export function getWeekDates(weekStartStr) {
  const start = parseLocalDateStr(weekStartStr);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(toLocalDateStr(d));
  }
  return dates;
}

/**
 * Calculate cell state and display info for habit on date
 */
export function getCellState(habit, dateStr, entry) {
  const eligibility = isHabitEligibleOnDate(habit, dateStr);

  if (!eligibility.eligible) {
    return {
      state: 'ineligible',
      label: 'Off',
      symbol: '&ndash;',
      isClickable: false,
      reason: eligibility.reason
    };
  }

  if (eligibility.isFuture) {
    return {
      state: 'future',
      label: 'Future',
      symbol: '&middot;',
      isClickable: false,
      reason: 'future'
    };
  }

  // Eligible past or today date
  if (!entry || entry.status === 'not_recorded') {
    return {
      state: 'unrecorded',
      label: '',
      symbol: '',
      isClickable: true,
      value: 0
    };
  }

  if (entry.status === 'skipped') {
    return {
      state: 'skipped',
      label: 'Skipped',
      symbol: '&ndash;',
      isClickable: true,
      value: 0
    };
  }

  if (entry.status === 'missed' || entry.status === 'violation') {
    return {
      state: 'missed',
      label: habit.type === 'avoidance' ? 'Violation' : 'Missed',
      symbol: '&#10005;',
      isClickable: true,
      value: 0
    };
  }

  // Yes / No or Avoidance compliant
  if (habit.type === 'yes_no' || habit.type === 'avoidance') {
    if (entry.status === 'completed' || entry.status === 'compliant') {
      return {
        state: 'met',
        label: habit.type === 'avoidance' ? 'Compliant' : 'Done',
        symbol: '&#10003;',
        isClickable: true,
        value: 1
      };
    }
  }

  // Numerical: quantity, duration, count
  const val = Number(entry.value) || 0;
  const target = Number(habit.target) || 1;

  if (val >= target) {
    const formatted = habit.type === 'duration' ? formatDuration(val) : `${val}`;
    return {
      state: 'met',
      label: formatted,
      symbol: '&#10003;',
      isClickable: true,
      value: val
    };
  } else if (val > 0) {
    const formatted = habit.type === 'duration' ? formatDuration(val) : `${val}`;
    return {
      state: 'partial',
      label: `${formatted}/${habit.type === 'duration' ? formatDuration(target) : target}`,
      symbol: '&frac12;',
      isClickable: true,
      value: val
    };
  }

  return {
    state: 'unrecorded',
    label: '',
    symbol: '',
    isClickable: true,
    value: 0
  };
}

/**
 * Handle quick cycle click on a cell
 */
export function handleCellClick(habit, dateStr) {
  const eligibility = isHabitEligibleOnDate(habit, dateStr);
  if (!eligibility.eligible || eligibility.isFuture) return;

  const currentEntry = getEntry(habit.id, dateStr);

  // If yes_no or avoidance, cycle directly
  if (habit.type === 'yes_no') {
    let nextStatus = 'completed';
    let nextVal = 1;

    if (!currentEntry || currentEntry.status === 'not_recorded') {
      nextStatus = 'completed';
      nextVal = 1;
    } else if (currentEntry.status === 'completed') {
      nextStatus = 'missed';
      nextVal = 0;
    } else if (currentEntry.status === 'missed') {
      nextStatus = 'skipped';
      nextVal = 0;
    } else {
      nextStatus = 'not_recorded';
      nextVal = 0;
    }

    setEntry({
      habitId: habit.id,
      date: dateStr,
      value: nextVal,
      status: nextStatus
    });
    return;
  }

  if (habit.type === 'avoidance') {
    let nextStatus = 'compliant';
    let nextVal = 1;

    if (!currentEntry || currentEntry.status === 'not_recorded') {
      nextStatus = 'compliant';
      nextVal = 1;
    } else if (currentEntry.status === 'compliant') {
      nextStatus = 'violation';
      nextVal = 0;
    } else if (currentEntry.status === 'violation') {
      nextStatus = 'skipped';
      nextVal = 0;
    } else {
      nextStatus = 'not_recorded';
      nextVal = 0;
    }

    setEntry({
      habitId: habit.id,
      date: dateStr,
      value: nextVal,
      status: nextStatus
    });
    return;
  }

  // For Quantity, Duration, Count -> open cell editor dialog
  openCellEditorModal(habit, dateStr, currentEntry);
}

/**
 * Open Modal Dialog for Numerical/Detailed Cell Editing
 */
export function openCellEditorModal(habit, dateStr, currentEntry) {
  const title = `Log ${habit.name} &bull; ${dateStr}`;
  const currentValue = currentEntry ? currentEntry.value : 0;
  const currentStatus = currentEntry ? currentEntry.status : 'not_recorded';
  const currentNote = currentEntry ? currentEntry.note : '';

  const content = document.createElement('div');
  content.innerHTML = `
    <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4);">
      <div class="habit-icon-box" style="width: 40px; height: 40px;">
        ${getIconSvg(habit.icon)}
      </div>
      <div>
        <div style="font-weight: 700; font-size: var(--text-md);">${escapeHtml(habit.name)}</div>
        <div style="font-size: var(--text-xs); color: var(--text-muted);">
          Target: ${habit.target} ${escapeHtml(habit.unit)} &bull; ${habit.type.toUpperCase()}
        </div>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label" for="cell-value-input">
        Amount (${escapeHtml(habit.unit)})
        ${habit.type === 'duration' ? '<span class="form-label-optional">Enter in minutes</span>' : ''}
      </label>
      <div style="display: flex; gap: var(--space-2); align-items: center;">
        <input type="number" step="any" min="0" class="form-input" id="cell-value-input" value="${currentValue || habit.target}" style="font-size: var(--text-lg); font-weight: 700; text-align: center;" />
        ${habit.type === 'count' ? `
          <button type="button" class="btn btn-secondary" id="btn-quick-minus">&minus;</button>
          <button type="button" class="btn btn-secondary" id="btn-quick-plus">&plus;</button>
        ` : ''}
      </div>
    </div>

    <!-- Quick preset targets -->
    <div style="display: flex; gap: var(--space-2); margin-bottom: var(--space-4); flex-wrap: wrap;">
      <button type="button" class="btn btn-sm btn-secondary btn-preset-val" data-val="${habit.target}">Full Target (${habit.target})</button>
      <button type="button" class="btn btn-sm btn-secondary btn-preset-val" data-val="${Math.round((habit.target / 2) * 10) / 10}">Half (${Math.round((habit.target / 2) * 10) / 10})</button>
      <button type="button" class="btn btn-sm btn-secondary btn-preset-val" data-val="0">Zero (0)</button>
    </div>

    <div class="form-group">
      <label class="form-label" for="cell-status-select">Status Override</label>
      <select class="form-select" id="cell-status-select">
        <option value="auto">Automatic (Based on value &ge; target)</option>
        <option value="skipped" ${currentStatus === 'skipped' ? 'selected' : ''}>Mark as Skipped (Excluded)</option>
        <option value="missed" ${currentStatus === 'missed' ? 'selected' : ''}>Explicitly Missed</option>
        <option value="not_recorded" ${currentStatus === 'not_recorded' ? 'selected' : ''}>Clear Entry (Not Recorded)</option>
      </select>
    </div>

    <div class="form-group" style="margin-bottom: 0;">
      <label class="form-label" for="cell-note-input">Optional Note</label>
      <input type="text" class="form-input" id="cell-note-input" placeholder="Context, thoughts, reflections" value="${escapeHtml(currentNote)}" />
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="cell-modal-cancel" type="button">Cancel</button>
    <button class="btn btn-primary" id="cell-modal-save" type="button">Save Entry</button>
  `;

  openModal(title, content, {
    footerHtml: footer,
    onOpen: (body) => {
      const valInput = body.querySelector('#cell-value-input');
      const statusSelect = body.querySelector('#cell-status-select');
      const noteInput = body.querySelector('#cell-note-input');

      // Presets
      body.querySelectorAll('.btn-preset-val').forEach((btn) => {
        btn.onclick = () => {
          valInput.value = btn.getAttribute('data-val');
          statusSelect.value = 'auto';
        };
      });

      // Quick plus/minus
      const plusBtn = body.querySelector('#btn-quick-plus');
      const minusBtn = body.querySelector('#btn-quick-minus');
      if (plusBtn) plusBtn.onclick = () => { valInput.value = (parseFloat(valInput.value) || 0) + 1; };
      if (minusBtn) minusBtn.onclick = () => { valInput.value = Math.max(0, (parseFloat(valInput.value) || 0) - 1); };

      document.getElementById('cell-modal-cancel')?.addEventListener('click', closeModal);

      document.getElementById('cell-modal-save')?.addEventListener('click', () => {
        const enteredVal = parseFloat(valInput.value) || 0;
        const selectedStatus = statusSelect.value;
        const note = noteInput.value.trim();

        let finalStatus = 'not_recorded';
        let finalVal = enteredVal;

        if (selectedStatus === 'skipped') {
          finalStatus = 'skipped';
          finalVal = 0;
        } else if (selectedStatus === 'missed') {
          finalStatus = 'missed';
          finalVal = 0;
        } else if (selectedStatus === 'not_recorded') {
          finalStatus = 'not_recorded';
          finalVal = 0;
        } else {
          // Automatic
          if (enteredVal >= habit.target) {
            finalStatus = 'completed';
          } else if (enteredVal > 0) {
            finalStatus = 'partial';
          } else {
            finalStatus = 'not_recorded';
          }
        }

        setEntry({
          habitId: habit.id,
          date: dateStr,
          value: finalVal,
          status: finalStatus,
          note
        });

        showToast(`Logged ${habit.name}: ${finalVal} ${habit.unit}`, 'success', {
          actionLabel: 'Undo',
          onAction: () => undoLastAction()
        });

        closeModal();
      });
    }
  });
}

/**
 * Render the Weekly Tracker Grid
 */
export function renderWeeklyGrid() {
  const headerRow = document.getElementById('tracker-table-header-row');
  const tbody = document.getElementById('tracker-table-body');
  const dateRangeLabel = document.getElementById('tracker-date-range-label');

  if (!headerRow || !tbody) return;

  const weekStartStr = getCurrentWeekStartDate();
  const weekDates = getWeekDates(weekStartStr);
  const todayStr = getTodayDateStr();
  const activeHabits = getHabits({ includeArchived: false });

  // Update date range title
  if (dateRangeLabel) {
    const firstDateObj = parseLocalDateStr(weekDates[0]);
    const lastDateObj = parseLocalDateStr(weekDates[6]);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    dateRangeLabel.textContent = `${monthNames[firstDateObj.getMonth()]} ${firstDateObj.getDate()} – ${monthNames[lastDateObj.getMonth()]} ${lastDateObj.getDate()}, ${lastDateObj.getFullYear()}`;
  }

  // Build Header Row
  headerRow.innerHTML = `
    <th>Habit &amp; Daily Target</th>
    ${weekDates
      .map((dStr) => {
        const dObj = parseLocalDateStr(dStr);
        const dayIdx = dObj.getDay();
        const weekdayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayIdx];
        const isToday = dStr === todayStr;

        return `
          <th class="${isToday ? 'col-today' : ''}">
            <span class="header-day-name">${WEEKDAY_LABELS[weekdayKey]}</span>
            <span class="header-day-num">${dObj.getDate()}</span>
          </th>
        `;
      })
      .join('')}
  `;

  // Build Habit Rows
  if (activeHabits.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: var(--space-8); color: var(--text-muted);">
          No active habits found. Go to <a href="#habits">Habits</a> to configure your habits.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = activeHabits
    .map((habit) => {
      return `
        <tr data-habit-id="${habit.id}">
          <td class="cell-habit-meta">
            <div class="habit-meta-wrap">
              <div class="habit-icon-box" style="width: 34px; height: 34px;">
                ${getIconSvg(habit.icon)}
              </div>
              <div class="habit-title-col">
                <span class="habit-name-text">${escapeHtml(habit.name)}</span>
                <span class="habit-target-text">${habit.target} ${escapeHtml(habit.unit)}</span>
              </div>
            </div>
          </td>
          ${weekDates
            .map((dateStr) => {
              const entry = getEntry(habit.id, dateStr);
              const cell = getCellState(habit, dateStr, entry);
              const isToday = dateStr === todayStr;

              return `
                <td class="${isToday ? 'cell-today' : ''} cell-${cell.state}" data-date="${dateStr}" data-habit-id="${habit.id}">
                  <div class="tracker-cell-content" tabindex="${cell.isClickable ? '0' : '-1'}" role="button" aria-label="${escapeHtml(habit.name)} on ${dateStr}: ${cell.label}">
                    ${cell.symbol ? `<span class="cell-symbol">${cell.symbol}</span>` : ''}
                    ${cell.label ? `<span class="cell-value-text">${cell.label}</span>` : ''}
                  </div>
                </td>
              `;
            })
            .join('')}
        </tr>
      `;
    })
    .join('');

  // Attach interactive click & keyboard events to cells
  tbody.querySelectorAll('.tracker-cell-content').forEach((cellDiv) => {
    const td = cellDiv.closest('td');
    const habitId = td.getAttribute('data-habit-id');
    const dateStr = td.getAttribute('data-date');
    const habit = activeHabits.find((h) => h.id === habitId);

    if (habit && dateStr) {
      cellDiv.addEventListener('click', () => handleCellClick(habit, dateStr));
      cellDiv.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCellClick(habit, dateStr);
        }
      });
    }
  });
}

/**
 * Render the Daily Focus View
 */
export function renderDailyFocusView() {
  const focusHabitsList = document.getElementById('focus-habits-list');
  const focusDateTitle = document.getElementById('focus-date-title');
  const focusSummaryText = document.getElementById('focus-summary-text');
  const focusCompletionPill = document.getElementById('focus-completion-pill');
  const focusDailyNote = document.getElementById('focus-daily-note');

  if (!focusHabitsList) return;

  const todayStr = getTodayDateStr();
  const todayObj = parseLocalDateStr(todayStr);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (focusDateTitle) {
    focusDateTitle.textContent = `${dayNames[todayObj.getDay()]}, ${monthNames[todayObj.getMonth()]} ${todayObj.getDate()}`;
  }

  const allActive = getHabits({ includeArchived: false });
  const eligibleToday = allActive.filter((h) => isHabitEligibleOnDate(h, todayStr).eligible);

  let completedCount = 0;
  eligibleToday.forEach((h) => {
    const e = getEntry(h.id, todayStr);
    if (e && (e.status === 'completed' || e.status === 'compliant')) completedCount++;
  });

  const percent = eligibleToday.length > 0 ? Math.round((completedCount / eligibleToday.length) * 100) : 0;
  if (focusSummaryText) focusSummaryText.textContent = `${completedCount} of ${eligibleToday.length} habits completed`;
  if (focusCompletionPill) focusCompletionPill.textContent = `${percent}% Complete`;

  // Daily note loading
  if (focusDailyNote) {
    const db = loadDatabase();
    // Daily notes stored in first entry or metadata
    const dayNote = db.entries.find((e) => e.date === todayStr && e.note)?.note || '';
    focusDailyNote.value = dayNote;
    focusDailyNote.onchange = () => {
      // save to today entries
      if (eligibleToday.length > 0) {
        const firstHabit = eligibleToday[0];
        const current = getEntry(firstHabit.id, todayStr) || { habitId: firstHabit.id, date: todayStr, value: 0, status: 'not_recorded' };
        setEntry({ ...current, note: focusDailyNote.value });
        showToast('Reflection note saved.', 'success');
      }
    };
  }

  if (eligibleToday.length === 0) {
    focusHabitsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No Habits Scheduled Today</div>
        <div class="empty-state-desc">You have no active habits scheduled for today. You can adjust schedules in the Habits tab.</div>
      </div>
    `;
    return;
  }

  focusHabitsList.innerHTML = eligibleToday
    .map((habit) => {
      const entry = getEntry(habit.id, todayStr);
      const cell = getCellState(habit, todayStr, entry);
      const isCompleted = cell.state === 'met';
      const val = entry ? entry.value : 0;
      const pct = Math.min(100, Math.round((val / habit.target) * 100));

      return `
        <div class="focus-habit-card ${isCompleted ? 'completed' : ''}" data-habit-id="${habit.id}">
          <div class="focus-habit-header">
            <div class="focus-habit-left">
              <div class="habit-icon-box">
                ${getIconSvg(habit.icon)}
              </div>
              <div>
                <div class="focus-habit-title">${escapeHtml(habit.name)}</div>
                <div class="focus-habit-target">
                  Target: ${habit.target} ${escapeHtml(habit.unit)} &bull; ${habit.type.toUpperCase()}
                </div>
              </div>
            </div>
            <span class="badge ${isCompleted ? 'badge-success' : 'badge-neutral'}">
              ${isCompleted ? 'Completed' : 'Pending'}
            </span>
          </div>

          <div class="focus-progress-bar-wrap">
            <div class="focus-progress-fill ${isCompleted ? 'full' : ''}" style="width: ${pct}%;"></div>
          </div>

          <div class="focus-habit-controls">
            ${renderFocusControls(habit, entry, isCompleted)}
          </div>
        </div>
      `;
    })
    .join('');

  bindFocusControls(eligibleToday, todayStr);
}

function renderFocusControls(habit, entry, isCompleted) {
  const currentVal = entry ? entry.value : 0;

  if (habit.type === 'yes_no') {
    return `
      <div></div>
      <div class="focus-action-btns">
        <button class="btn ${isCompleted ? 'btn-primary' : 'btn-secondary'} focus-toggle-btn" data-action="toggle-yesno" type="button">
          ${isCompleted ? '&#10003; Done' : 'Mark Done'}
        </button>
      </div>
    `;
  }

  if (habit.type === 'avoidance') {
    const isCompliant = entry?.status === 'compliant';
    const isViolation = entry?.status === 'violation';

    return `
      <div></div>
      <div class="focus-action-btns">
        <button class="btn ${isCompliant ? 'btn-primary' : 'btn-secondary'} focus-btn-compliant" type="button">
          &#10003; Compliant
        </button>
        <button class="btn ${isViolation ? 'btn-danger' : 'btn-secondary'} focus-btn-violation" type="button">
          &#10005; Violation
        </button>
      </div>
    `;
  }

  // Quantity, Duration, Count
  return `
    <div class="focus-entry-stepper">
      <button class="stepper-btn focus-step-minus" type="button">&minus;</button>
      <input type="number" step="any" min="0" class="stepper-input focus-step-input" value="${currentVal}" />
      <button class="stepper-btn focus-step-plus" type="button">&plus;</button>
      <span style="font-size: var(--text-xs); color: var(--text-muted); font-weight: 600;">${escapeHtml(habit.unit)}</span>
    </div>
    <div class="focus-action-btns">
      <button class="btn btn-secondary btn-sm focus-btn-max" type="button">Set Target</button>
      <button class="btn ${isCompleted ? 'btn-primary' : 'btn-secondary'} btn-sm focus-btn-save-step" type="button">
        ${isCompleted ? '&#10003; Met' : 'Save'}
      </button>
    </div>
  `;
}

function bindFocusControls(habits, dateStr) {
  habits.forEach((habit) => {
    const card = document.querySelector(`.focus-habit-card[data-habit-id="${habit.id}"]`);
    if (!card) return;

    const entry = getEntry(habit.id, dateStr);

    // Yes/No
    const toggleBtn = card.querySelector('[data-action="toggle-yesno"]');
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        const latest = getEntry(habit.id, dateStr);
        const isDone = latest?.status === 'completed';
        setEntry({
          habitId: habit.id,
          date: dateStr,
          value: isDone ? 0 : 1,
          status: isDone ? 'not_recorded' : 'completed'
        });
      };
    }

    // Avoidance
    const compBtn = card.querySelector('.focus-btn-compliant');
    const violBtn = card.querySelector('.focus-btn-violation');
    if (compBtn) {
      compBtn.onclick = () => {
        const latest = getEntry(habit.id, dateStr);
        const isCompliant = latest?.status === 'compliant';
        setEntry({ habitId: habit.id, date: dateStr, value: isCompliant ? 0 : 1, status: isCompliant ? 'not_recorded' : 'compliant' });
      };
    }
    if (violBtn) {
      violBtn.onclick = () => {
        const latest = getEntry(habit.id, dateStr);
        const isViolation = latest?.status === 'violation';
        setEntry({ habitId: habit.id, date: dateStr, value: 0, status: isViolation ? 'not_recorded' : 'violation' });
      };
    }

    // Steppers
    const input = card.querySelector('.focus-step-input');
    const minus = card.querySelector('.focus-step-minus');
    const plus = card.querySelector('.focus-step-plus');
    const maxBtn = card.querySelector('.focus-btn-max');
    const saveBtn = card.querySelector('.focus-btn-save-step');

    const stepAmount = habit.type === 'duration' ? 15 : 1;

    if (minus && input) {
      minus.onclick = () => {
        input.value = Math.max(0, (parseFloat(input.value) || 0) - stepAmount);
      };
    }
    if (plus && input) {
      plus.onclick = () => {
        input.value = (parseFloat(input.value) || 0) + stepAmount;
      };
    }
    if (maxBtn && input) {
      maxBtn.onclick = () => {
        input.value = habit.target;
      };
    }
    if (saveBtn && input) {
      saveBtn.onclick = () => {
        const val = parseFloat(input.value) || 0;
        const status = val >= habit.target ? 'completed' : val > 0 ? 'partial' : 'not_recorded';
        setEntry({ habitId: habit.id, date: dateStr, value: val, status });
        showToast(`Saved ${habit.name}: ${val} ${habit.unit}`, 'success', {
          actionLabel: 'Undo',
          onAction: () => undoLastAction()
        });
      };
    }
  });
}

/**
 * Render the Tracker page based on current view mode
 */
export function renderTrackerPage() {
  const gridContainer = document.getElementById('tracker-grid-container');
  const focusContainer = document.getElementById('tracker-focus-container');
  const legendCard = document.getElementById('tracker-legend-card');
  const tabGrid = document.getElementById('tab-mode-grid');
  const tabFocus = document.getElementById('tab-mode-focus');

  if (currentViewMode === 'grid') {
    if (gridContainer) gridContainer.style.display = 'block';
    if (legendCard) legendCard.style.display = 'block';
    if (focusContainer) focusContainer.style.display = 'none';
    tabGrid?.classList.add('active');
    tabFocus?.classList.remove('active');
    renderWeeklyGrid();
  } else {
    if (gridContainer) gridContainer.style.display = 'none';
    if (legendCard) legendCard.style.display = 'none';
    if (focusContainer) focusContainer.style.display = 'flex';
    tabGrid?.classList.remove('active');
    tabFocus?.classList.add('active');
    renderDailyFocusView();
  }

  bindTrackerHeaderControls();
}

function bindTrackerHeaderControls() {
  const tabGrid = document.getElementById('tab-mode-grid');
  const tabFocus = document.getElementById('tab-mode-focus');
  const prevBtn = document.getElementById('nav-prev-week-btn');
  const nextBtn = document.getElementById('nav-next-week-btn');
  const todayBtn = document.getElementById('nav-today-btn');
  const jumpDateInput = document.getElementById('tracker-jump-date-picker');
  const undoBtn = document.getElementById('tracker-undo-btn');

  if (tabGrid) {
    tabGrid.onclick = () => {
      currentViewMode = 'grid';
      renderTrackerPage();
    };
  }
  if (tabFocus) {
    tabFocus.onclick = () => {
      currentViewMode = 'focus';
      renderTrackerPage();
    };
  }

  if (prevBtn) {
    prevBtn.onclick = () => {
      const cur = parseLocalDateStr(getCurrentWeekStartDate());
      cur.setDate(cur.getDate() - 7);
      currentWeekStartDateStr = toLocalDateStr(cur);
      renderWeeklyGrid();
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      const cur = parseLocalDateStr(getCurrentWeekStartDate());
      cur.setDate(cur.getDate() + 7);
      currentWeekStartDateStr = toLocalDateStr(cur);
      renderWeeklyGrid();
    };
  }

  if (todayBtn) {
    todayBtn.onclick = () => {
      currentWeekStartDateStr = null;
      getCurrentWeekStartDate();
      renderWeeklyGrid();
    };
  }

  if (jumpDateInput) {
    jumpDateInput.onchange = () => {
      if (jumpDateInput.value) {
        // Find week start for jumped date
        const targetDate = parseLocalDateStr(jumpDateInput.value);
        const day = targetDate.getDay();
        const db = loadDatabase();
        const weekStartPref = db.settings?.weekStart || 'monday';
        const diff = weekStartPref === 'monday' ? (day === 0 ? -6 : 1 - day) : -day;
        targetDate.setDate(targetDate.getDate() + diff);
        currentWeekStartDateStr = toLocalDateStr(targetDate);
        renderWeeklyGrid();
      }
    };
  }

  if (undoBtn) {
    undoBtn.onclick = () => undoLastAction();
  }
}
