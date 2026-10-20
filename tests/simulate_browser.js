import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs';
import path from 'path';

const virtualConsole = new VirtualConsole();
const consoleErrors = [];
virtualConsole.on('error', (...args) => {
  console.error('[BROWSER ERROR]:', ...args);
  consoleErrors.push(args.join(' '));
});
virtualConsole.on('warn', (...args) => {
  console.warn('[BROWSER WARN]:', ...args);
});
virtualConsole.on('log', (...args) => {
  console.log('[BROWSER LOG]:', ...args);
});

async function runBrowserSimulation() {
  const indexHtml = fs.readFileSync('index.html', 'utf-8');

  const dom = new JSDOM(indexHtml, {
    url: 'http://localhost:3000/#dashboard',
    runScripts: 'dangerously',
    resources: 'usable',
    virtualConsole
  });

  const { window } = dom;
  const { document } = window;

  console.log('JSDOM window created. Loading dependencies...');

  // Mock Canvas getContext so Chart.js doesn't fail on missing canvas 2d context in JSDOM
  window.HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Array(4) }),
      putImageData: () => {},
      createImageData: () => [],
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
      measureText: () => ({ width: 0 }),
      transform: () => {},
      rect: () => {},
      clip: () => {},
      canvas: this
    };
  };

  // Provide local storage via defineProperty
  const storageMap = new Map();
  const mockStorage = {
    getItem: (k) => storageMap.get(k) || null,
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear()
  };
  Object.defineProperty(window, 'localStorage', { value: mockStorage, configurable: true });

  // Inject bundled Chart.js
  const chartJsCode = fs.readFileSync('assets/lib/chart.umd.js', 'utf-8');
  window.eval(chartJsCode);
  console.log('Chart.js loaded into window:', Boolean(window.Chart));

  // Global mock fetch for JSDOM
  window.fetch = async (url) => {
    let cleanUrl = url.replace(/^\.\//, '').replace(/^http:\/\/localhost:3000\//, '');
    const localFile = path.resolve(cleanUrl);
    if (fs.existsSync(localFile)) {
      const content = fs.readFileSync(localFile, 'utf-8');
      return {
        ok: true,
        status: 200,
        text: async () => content,
        json: async () => JSON.parse(content)
      };
    }
    return { ok: false, status: 404, text: async () => 'Not Found' };
  };

  // Provide ES Module imports by setting globals and dynamically importing our modules
  // Make window available globally for modules
  globalThis.window = window;
  globalThis.document = document;
  globalThis.localStorage = window.localStorage;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.CustomEvent = window.CustomEvent;

  console.log('Importing app.js...');
  const app = await import('../js/app.js');

  console.log('Calling app.initApp()...');
  app.initApp();

  // Wait 200ms for async routing and template rendering
  await new Promise((r) => setTimeout(r, 200));

  console.log('--- Testing View: Dashboard ---');
  const dashboardView = document.getElementById('dashboard-view');
  console.log('Dashboard rendered:', Boolean(dashboardView));
  const ringPercent = document.getElementById('hero-ring-percent');
  console.log('Ring percent text:', ringPercent?.textContent);

  // Test Quick Complete button on Dashboard
  const quickToggleBtn = document.querySelector('.btn-quick-toggle');
  console.log('Quick toggle button found:', Boolean(quickToggleBtn));
  if (quickToggleBtn) {
    quickToggleBtn.click();
    console.log('Clicked quick toggle button.');
  }

  console.log('--- Testing Route Switch: Tracker ---');
  window.location.hash = '#tracker';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await new Promise((r) => setTimeout(r, 200));

  const trackerView = document.getElementById('tracker-view');
  console.log('Tracker view rendered:', Boolean(trackerView));
  const tableRows = document.querySelectorAll('#tracker-table-body tr');
  console.log('Tracker table rows count:', tableRows.length);

  // Test cell click in tracker
  const firstCell = document.querySelector('.tracker-cell-content');
  console.log('Tracker cell found:', Boolean(firstCell));
  if (firstCell) {
    firstCell.click();
    console.log('Clicked first cell.');
  }

  // Test Daily Focus tab switch
  const focusTab = document.getElementById('tab-mode-focus');
  if (focusTab) {
    focusTab.click();
    console.log('Switched to Daily Focus mode.');
    const focusCards = document.querySelectorAll('.focus-habit-card');
    console.log('Focus habit cards rendered count:', focusCards.length);
  }

  console.log('--- Testing Route Switch: Analytics ---');
  window.location.hash = '#analytics';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await new Promise((r) => setTimeout(r, 200));

  const analyticsView = document.getElementById('analytics-view');
  console.log('Analytics view rendered:', Boolean(analyticsView));
  const heatmapContainer = document.getElementById('calendar-heatmap-container');
  console.log('Heatmap container children:', heatmapContainer?.children.length);
  const consistencyScore = document.getElementById('stat-consistency-score');
  console.log('Consistency score:', consistencyScore?.textContent);

  console.log('--- Testing Route Switch: Habits ---');
  window.location.hash = '#habits';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await new Promise((r) => setTimeout(r, 200));

  const habitsView = document.getElementById('habits-view');
  console.log('Habits view rendered:', Boolean(habitsView));
  const activeHabitsRows = document.querySelectorAll('#active-habits-tbody tr');
  console.log('Active habits rows count:', activeHabitsRows.length);

  // Test Open Habit Modal
  const createHabitBtn = document.getElementById('habits-new-btn');
  if (createHabitBtn) {
    createHabitBtn.click();
    const modalBackdrop = document.getElementById('modal-backdrop');
    console.log('Create Habit modal open class:', modalBackdrop?.classList.contains('open'));
    const modalCancel = document.getElementById('habit-modal-cancel');
    modalCancel?.click();
    console.log('Closed modal. Modal open class:', modalBackdrop?.classList.contains('open'));
  }

  console.log('--- Testing Route Switch: Settings ---');
  window.location.hash = '#settings';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await new Promise((r) => setTimeout(r, 200));

  const settingsView = document.getElementById('settings-view');
  console.log('Settings view rendered:', Boolean(settingsView));

  // Test Theme switch to OLED
  const oledRadio = document.querySelector('input[name="app-theme"][value="oled"]');
  if (oledRadio) {
    oledRadio.checked = true;
    oledRadio.onchange();
    console.log('Switched theme to OLED. Document data-theme:', document.documentElement.getAttribute('data-theme'));
  }

  // Test Accent switch to Violet
  const violetBtn = document.querySelector('.btn-accent-color[data-accent="violet"]');
  if (violetBtn) {
    violetBtn.click();
    console.log('Switched accent to Violet. Document data-accent:', document.documentElement.getAttribute('data-accent'));
  }

  if (consoleErrors.length > 0) {
    console.error('FAILED with console errors:', consoleErrors);
    process.exit(1);
  } else {
    console.log('ALL BROWSER FLOWS PASSED WITH 0 ERRORS!');
    process.exit(0);
  }
}

runBrowserSimulation().catch((err) => {
  console.error('Simulation exception:', err);
  process.exit(1);
});
