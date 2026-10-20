/**
 * Habit Tracker - Habit Management Module (habits.js)
 * Create, read, update, archive, reorder habits with stable UUIDs and eligibility logic
 */

import { loadDatabase, saveDatabase, generateUUID, getTodayDateStr, parseLocalDateStr } from './storage.js';
import { getIconSvg, openModal, closeModal, confirmDialog, showToast } from './ui.js';

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WEEKDAY_LABELS = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun'
};

export const HABIT_TYPES = {
  yes_no: { label: 'Yes / No', defaultUnit: 'session', defaultTarget: 1 },
  quantity: { label: 'Quantity', defaultUnit: 'units', defaultTarget: 5 },
  duration: { label: 'Duration (Minutes)', defaultUnit: 'minutes', defaultTarget: 30 },
  avoidance: { label: 'Avoidance (Compliant / Violation)', defaultUnit: 'day', defaultTarget: 1 },
  count: { label: 'Count (Repetitions / Sessions)', defaultUnit: 'times', defaultTarget: 3 }
};

export const AVAILABLE_ICONS = [
  'water', 'walking', 'workout', 'reading', 'studying', 'sugar', 'sleep', 'meditation',
  'flame', 'sparkles', 'target', 'heart', 'calendar', 'chart'
];

/**
 * Get all habits
 * @param {Object} [options]
 * @param {boolean} [options.includeArchived=false]
 */
export function getHabits({ includeArchived = false } = {}) {
  const db = loadDatabase();
  const sorted = [...db.habits].sort((a, b) => (a.order || 0) - (b.order || 0));
  if (includeArchived) return sorted;
  return sorted.filter((h) => !h.archivedAt);
}

/**
 * Get habit by ID
 */
export function getHabitById(id) {
  const db = loadDatabase();
  return db.habits.find((h) => h.id === id) || null;
}

/**
 * Validate habit parameters
 */
export function validateHabit(data) {
  const errors = [];
  if (!data.name || !data.name.trim()) {
    errors.push('Habit name is required.');
  }
  if (!HABIT_TYPES[data.type]) {
    errors.push('Invalid habit type.');
  }
  const target = Number(data.target);
  if (isNaN(target) || target <= 0) {
    errors.push('Target must be a positive number greater than 0.');
  }
  if (!Array.isArray(data.schedule) || data.schedule.length === 0) {
    errors.push('At least one day must be selected in the schedule.');
  } else {
    const invalidDays = data.schedule.filter((d) => !WEEKDAYS.includes(d));
    if (invalidDays.length > 0) {
      errors.push(`Invalid schedule days: ${invalidDays.join(', ')}`);
    }
  }
  return errors;
}

/**
 * Create a new habit
 */
export function createHabit(habitData) {
  const errors = validateHabit(habitData);
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  const db = loadDatabase();
  const todayStr = getTodayDateStr();

  const newHabit = {
    id: generateUUID(),
    name: habitData.name.trim(),
    icon: habitData.icon || 'sparkles',
    type: habitData.type,
    unit: (habitData.unit || HABIT_TYPES[habitData.type].defaultUnit).trim(),
    target: Number(habitData.target),
    schedule: [...habitData.schedule],
    createdAt: new Date().toISOString(),
    startDate: habitData.startDate || todayStr,
    endDate: habitData.endDate || null,
    archivedAt: null,
    order: db.habits.length + 1,
    metadata: habitData.metadata || {}
  };

  db.habits.push(newHabit);
  saveDatabase(db);
  window.dispatchEvent(new CustomEvent('habits-updated', { detail: { habit: newHabit, action: 'create' } }));
  return newHabit;
}

/**
 * Update existing habit
 */
export function updateHabit(id, updates) {
  const db = loadDatabase();
  const index = db.habits.findIndex((h) => h.id === id);
  if (index === -1) {
    throw new Error(`Habit with ID ${id} not found.`);
  }

  const current = db.habits[index];
  const merged = { ...current, ...updates };

  const errors = validateHabit(merged);
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  // Preserve stable ID and createdAt
  merged.id = current.id;
  merged.createdAt = current.createdAt;

  db.habits[index] = merged;
  saveDatabase(db);
  window.dispatchEvent(new CustomEvent('habits-updated', { detail: { habit: merged, action: 'update' } }));
  return merged;
}

/**
 * Archive a habit (preserves historical data)
 */
export function archiveHabit(id) {
  const db = loadDatabase();
  const habit = db.habits.find((h) => h.id === id);
  if (!habit) return;

  habit.archivedAt = new Date().toISOString();
  saveDatabase(db);
  window.dispatchEvent(new CustomEvent('habits-updated', { detail: { habit, action: 'archive' } }));
}

/**
 * Restore an archived habit
 */
export function unarchiveHabit(id) {
  const db = loadDatabase();
  const habit = db.habits.find((h) => h.id === id);
  if (!habit) return;

  habit.archivedAt = null;
  saveDatabase(db);
  window.dispatchEvent(new CustomEvent('habits-updated', { detail: { habit, action: 'unarchive' } }));
}

/**
 * Reorder habit position
 */
export function reorderHabit(id, direction) {
  const db = loadDatabase();
  const activeHabits = db.habits.filter((h) => !h.archivedAt).sort((a, b) => (a.order || 0) - (b.order || 0));
  const currentIndex = activeHabits.findIndex((h) => h.id === id);

  if (currentIndex === -1) return;
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= activeHabits.length) return;

  // Swap order
  const currentHabit = activeHabits[currentIndex];
  const targetHabit = activeHabits[targetIndex];

  const tempOrder = currentHabit.order;
  currentHabit.order = targetHabit.order;
  targetHabit.order = tempOrder;

  saveDatabase(db);
  window.dispatchEvent(new CustomEvent('habits-updated', { detail: { action: 'reorder' } }));
}

/**
 * Delete habit and associated entries (Permanent)
 */
export function deleteHabit(id) {
  const db = loadDatabase();
  db.habits = db.habits.filter((h) => h.id !== id);
  db.entries = db.entries.filter((e) => e.habitId !== id);
  saveDatabase(db);
  window.dispatchEvent(new CustomEvent('habits-updated', { detail: { habitId: id, action: 'delete' } }));
}

/**
 * Check if a habit is eligible to be performed on a given local date string (YYYY-MM-DD)
 */
export function isHabitEligibleOnDate(habit, dateStr) {
  if (!habit || !dateStr) return { eligible: false, reason: 'missing_data' };

  // Check start date
  if (habit.startDate && dateStr < habit.startDate) {
    return { eligible: false, reason: 'before_start' };
  }

  // Check end date
  if (habit.endDate && dateStr > habit.endDate) {
    return { eligible: false, reason: 'after_end' };
  }

  // Check archive date
  if (habit.archivedAt) {
    const archiveDateStr = habit.archivedAt.slice(0, 10);
    if (dateStr > archiveDateStr) {
      return { eligible: false, reason: 'archived' };
    }
  }

  // Check schedule day
  const dateObj = parseLocalDateStr(dateStr);
  const dayIdx = dateObj.getDay(); // 0 is Sunday, 1 is Monday...
  const weekdayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayIdx];

  if (!habit.schedule || !habit.schedule.includes(weekdayKey)) {
    return { eligible: false, reason: 'unscheduled' };
  }

  // Check if date is in the future
  const todayStr = getTodayDateStr();
  if (dateStr > todayStr) {
    return { eligible: true, isFuture: true };
  }

  return { eligible: true, isFuture: false };
}

/**
 * Open Modal to Add or Edit Habit
 */
export function openHabitModal(habitToEdit = null) {
  const isEditing = Boolean(habitToEdit);
  const title = isEditing ? 'Edit Habit' : 'Create New Habit';

  const defaultSchedule = habitToEdit ? habitToEdit.schedule : [...WEEKDAYS];
  const selectedType = habitToEdit ? habitToEdit.type : 'yes_no';
  const selectedIcon = habitToEdit ? habitToEdit.icon : 'water';

  const content = document.createElement('form');
  content.id = 'habit-form';
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="habit-name-input">Habit Name</label>
      <input type="text" class="form-input" id="habit-name-input" required placeholder="e.g. Drink Water, Morning Walk, Deep Work" value="${habitToEdit ? escapeAttr(habitToEdit.name) : ''}" />
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="habit-type-select">Type</label>
        <select class="form-select" id="habit-type-select">
          ${Object.entries(HABIT_TYPES)
            .map(([key, info]) => `<option value="${key}" ${key === selectedType ? 'selected' : ''}>${info.label}</option>`)
            .join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="habit-icon-select">Icon</label>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px;" id="habit-icon-picker">
          ${AVAILABLE_ICONS.map((iconName) => `
            <button type="button" class="btn-icon btn-sm ${iconName === selectedIcon ? 'selected' : ''}" data-icon="${iconName}" style="${iconName === selectedIcon ? 'border-color: var(--accent-base); color: var(--accent-base);' : ''}" title="${iconName}">
              ${getIconSvg(iconName)}
            </button>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="habit-target-input">Daily Target</label>
        <input type="number" step="any" min="0.1" class="form-input" id="habit-target-input" required value="${habitToEdit ? habitToEdit.target : 1}" />
      </div>

      <div class="form-group">
        <label class="form-label" for="habit-unit-input">Unit</label>
        <input type="text" class="form-input" id="habit-unit-input" placeholder="e.g. liters, minutes, pages, sessions" value="${habitToEdit ? escapeAttr(habitToEdit.unit) : 'session'}" />
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Weekly Schedule</label>
      <div class="weekday-selector" id="habit-schedule-selector">
        ${WEEKDAYS.map((day) => `
          <button type="button" class="weekday-btn ${defaultSchedule.includes(day) ? 'selected' : ''}" data-day="${day}">
            ${WEEKDAY_LABELS[day]}
          </button>
        `).join('')}
      </div>
      <span class="form-hint">Choose which days of the week this habit is active</span>
    </div>

    <div class="form-group">
      <label class="form-label" for="habit-startdate-input">Start Tracking Date</label>
      <input type="date" class="form-input" id="habit-startdate-input" value="${habitToEdit ? habitToEdit.startDate : getTodayDateStr()}" />
    </div>

    <div id="habit-form-error" class="form-error" style="display: none; margin-top: var(--space-2);"></div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="habit-modal-cancel" type="button">Cancel</button>
    <button class="btn btn-primary" id="habit-modal-save" type="button">${isEditing ? 'Save Changes' : 'Create Habit'}</button>
  `;

  openModal(title, content, {
    footerHtml: footer,
    onOpen: (body) => {
      // Icon picker interaction
      let activeIcon = selectedIcon;
      const iconButtons = body.querySelectorAll('#habit-icon-picker button');
      iconButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          iconButtons.forEach((b) => {
            b.style.borderColor = '';
            b.style.color = '';
          });
          btn.style.borderColor = 'var(--accent-base)';
          btn.style.color = 'var(--accent-base)';
          activeIcon = btn.getAttribute('data-icon');
        });
      });

      // Type change auto-adjust unit
      const typeSelect = body.querySelector('#habit-type-select');
      const unitInput = body.querySelector('#habit-unit-input');
      const targetInput = body.querySelector('#habit-target-input');

      typeSelect.addEventListener('change', () => {
        const typeKey = typeSelect.value;
        const typeInfo = HABIT_TYPES[typeKey];
        if (typeInfo && (!habitToEdit || typeKey !== habitToEdit.type)) {
          unitInput.value = typeInfo.defaultUnit;
          targetInput.value = typeInfo.defaultTarget;
        }
      });

      // Weekday picker interaction
      const weekdayBtns = body.querySelectorAll('.weekday-btn');
      weekdayBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          btn.classList.toggle('selected');
        });
      });

      // Cancel button
      document.getElementById('habit-modal-cancel')?.addEventListener('click', closeModal);

      // Save button
      document.getElementById('habit-modal-save')?.addEventListener('click', () => {
        const name = body.querySelector('#habit-name-input').value;
        const type = typeSelect.value;
        const target = parseFloat(targetInput.value);
        const unit = unitInput.value;
        const startDate = body.querySelector('#habit-startdate-input').value;
        const errorDiv = body.querySelector('#habit-form-error');

        const selectedSchedule = Array.from(body.querySelectorAll('.weekday-btn.selected')).map((b) =>
          b.getAttribute('data-day')
        );

        const habitPayload = {
          name,
          icon: activeIcon,
          type,
          target,
          unit,
          schedule: selectedSchedule,
          startDate
        };

        const errors = validateHabit(habitPayload);
        if (errors.length > 0) {
          errorDiv.textContent = errors.join(' ');
          errorDiv.style.display = 'block';
          return;
        }

        try {
          if (isEditing) {
            updateHabit(habitToEdit.id, habitPayload);
            showToast(`Updated "${name}"`, 'success');
          } else {
            createHabit(habitPayload);
            showToast(`Created habit "${name}"`, 'success');
          }
          closeModal();
        } catch (err) {
          errorDiv.textContent = err.message;
          errorDiv.style.display = 'block';
        }
      });
    }
  });
}

function escapeAttr(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str.replace(/"/g, '&quot;');
}

/**
 * Render Habits Page View
 */
export function renderHabitsPage() {
  const activeTbody = document.getElementById('active-habits-tbody');
  const archivedTbody = document.getElementById('archived-habits-tbody');
  const activeCountEl = document.getElementById('habits-count-active');
  const archivedCountEl = document.getElementById('habits-count-archived');
  const archivedCountInline = document.getElementById('archived-count-inline');

  if (!activeTbody) return;

  const allHabits = getHabits({ includeArchived: true });
  const activeHabits = allHabits.filter((h) => !h.archivedAt);
  const archivedHabits = allHabits.filter((h) => Boolean(h.archivedAt));

  if (activeCountEl) activeCountEl.textContent = activeHabits.length;
  if (archivedCountEl) archivedCountEl.textContent = archivedHabits.length;
  if (archivedCountInline) archivedCountInline.textContent = archivedHabits.length;

  // Render Active Habits
  if (activeHabits.length === 0) {
    activeTbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: var(--space-8); color: var(--text-muted);">
          No active habits found. Click "Create Habit" to add one.
        </td>
      </tr>
    `;
  } else {
    activeTbody.innerHTML = activeHabits
      .map((habit, index) => {
        const scheduleLabels = (habit.schedule || []).map((d) => WEEKDAY_LABELS[d] || d).join(', ');
        return `
          <tr data-habit-id="${habit.id}">
            <td style="text-align: center;">
              <div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
                <button class="btn btn-sm btn-icon btn-icon-ghost btn-reorder-up" data-id="${habit.id}" ${index === 0 ? 'disabled' : ''} title="Move Up" style="width: 22px; height: 20px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;"><polyline points="18 15 12 9 6 15"/></svg>
                </button>
                <button class="btn btn-sm btn-icon btn-icon-ghost btn-reorder-down" data-id="${habit.id}" ${index === activeHabits.length - 1 ? 'disabled' : ''} title="Move Down" style="width: 22px; height: 20px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </div>
            </td>
            <td style="text-align: left; padding-left: var(--space-4);">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <div class="habit-icon-box" style="width: 32px; height: 32px;">
                  ${getIconSvg(habit.icon)}
                </div>
                <div style="display: flex; flex-direction: column;">
                  <span style="font-weight: 600; color: var(--text-primary); font-size: var(--text-sm);">${escapeAttr(habit.name)}</span>
                  <span style="font-size: 11px; color: var(--text-muted);">${escapeAttr(habit.metadata?.description || '')}</span>
                </div>
              </div>
            </td>
            <td>
              <span class="badge badge-neutral">${HABIT_TYPES[habit.type]?.label || habit.type}</span>
            </td>
            <td style="font-weight: 600; font-feature-settings: 'tnum' 1;">
              ${habit.target} ${escapeAttr(habit.unit)}
            </td>
            <td style="font-size: var(--text-xs); color: var(--text-secondary);">
              ${scheduleLabels}
            </td>
            <td style="font-size: var(--text-xs); color: var(--text-muted); font-feature-settings: 'tnum' 1;">
              ${habit.startDate}
            </td>
            <td style="text-align: right; padding-right: var(--space-4);">
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
                <button class="btn btn-sm btn-icon btn-edit-habit" data-id="${habit.id}" title="Edit Habit">
                  ${getIconSvg('edit')}
                </button>
                <button class="btn btn-sm btn-icon btn-archive-habit" data-id="${habit.id}" title="Archive Habit">
                  ${getIconSvg('archive')}
                </button>
                <button class="btn btn-sm btn-icon btn-danger btn-delete-habit" data-id="${habit.id}" title="Delete Habit">
                  ${getIconSvg('trash')}
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  // Render Archived Habits
  if (archivedTbody) {
    if (archivedHabits.length === 0) {
      archivedTbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: var(--space-6); color: var(--text-muted);">
            No archived habits.
          </td>
        </tr>
      `;
    } else {
      archivedTbody.innerHTML = archivedHabits
        .map((habit) => `
          <tr data-habit-id="${habit.id}">
            <td style="text-align: left; padding-left: var(--space-4);">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <div class="habit-icon-box" style="width: 32px; height: 32px; opacity: 0.6;">
                  ${getIconSvg(habit.icon)}
                </div>
                <span style="font-weight: 600; color: var(--text-muted); font-size: var(--text-sm);">${escapeAttr(habit.name)}</span>
              </div>
            </td>
            <td>
              <span class="badge badge-neutral">${HABIT_TYPES[habit.type]?.label || habit.type}</span>
            </td>
            <td style="font-size: var(--text-xs); color: var(--text-muted);">
              ${habit.target} ${escapeAttr(habit.unit)}
            </td>
            <td style="font-size: var(--text-xs); color: var(--text-muted);">
              ${habit.archivedAt ? habit.archivedAt.slice(0, 10) : 'Archived'}
            </td>
            <td style="text-align: right; padding-right: var(--space-4);">
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
                <button class="btn btn-sm btn-icon btn-restore-habit" data-id="${habit.id}" title="Restore Habit">
                  ${getIconSvg('restore')}
                </button>
                <button class="btn btn-sm btn-icon btn-danger btn-delete-habit" data-id="${habit.id}" title="Permanently Delete">
                  ${getIconSvg('trash')}
                </button>
              </div>
            </td>
          </tr>
        `)
        .join('');
    }
  }

  // Bind Event Listeners
  bindHabitsPageEvents();
}

function bindHabitsPageEvents() {
  // Reorder buttons
  document.querySelectorAll('.btn-reorder-up').forEach((btn) => {
    btn.onclick = () => reorderHabit(btn.getAttribute('data-id'), 'up');
  });
  document.querySelectorAll('.btn-reorder-down').forEach((btn) => {
    btn.onclick = () => reorderHabit(btn.getAttribute('data-id'), 'down');
  });

  // Edit buttons
  document.querySelectorAll('.btn-edit-habit').forEach((btn) => {
    btn.onclick = () => {
      const habit = getHabitById(btn.getAttribute('data-id'));
      if (habit) openHabitModal(habit);
    };
  });

  // Archive buttons
  document.querySelectorAll('.btn-archive-habit').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      const habit = getHabitById(id);
      if (!habit) return;
      const confirmed = await confirmDialog({
        title: 'Archive Habit',
        message: `Are you sure you want to archive "${habit.name}"? It will be hidden from daily tracking, but past statistics and records will be preserved.`
      });
      if (confirmed) {
        archiveHabit(id);
        showToast(`Archived "${habit.name}"`, 'info');
      }
    };
  });

  // Restore buttons
  document.querySelectorAll('.btn-restore-habit').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-id');
      const habit = getHabitById(id);
      if (!habit) return;
      unarchiveHabit(id);
      showToast(`Restored "${habit.name}" to active habits`, 'success');
    };
  });

  // Delete buttons
  document.querySelectorAll('.btn-delete-habit').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      const habit = getHabitById(id);
      if (!habit) return;
      const confirmed = await confirmDialog({
        title: 'Permanently Delete Habit',
        message: `Are you sure you want to permanently delete "${habit.name}" and all of its recorded history? This cannot be undone.`,
        confirmText: 'Delete Permanently',
        isDanger: true
      });
      if (confirmed) {
        deleteHabit(id);
        showToast(`Deleted "${habit.name}"`, 'warning');
      }
    };
  });

  // Archive collapsible toggle
  const toggleBtn = document.getElementById('toggle-archived-view-btn');
  const bodyEl = document.getElementById('archived-habits-body');
  const headerToggle = document.getElementById('archived-header-toggle');

  if (toggleBtn && bodyEl) {
    headerToggle.onclick = (e) => {
      if (e.target.closest('button') && e.target !== toggleBtn) return;
      const isHidden = bodyEl.style.display === 'none';
      bodyEl.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = isHidden ? 'Hide' : 'Show';
    };
  }

  // Create habit header button
  const newBtn = document.getElementById('habits-new-btn');
  if (newBtn) {
    newBtn.onclick = () => openHabitModal();
  }
}
