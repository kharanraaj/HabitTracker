# HabitPulse — Premium Personal Performance & Analytics System

> A private, responsive habit-tracking web application combining frictionless daily logging, transparent statistical analytics, calendar heatmaps, and actionable insights.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Vanilla JavaScript](https://img.shields.io/badge/Vanilla-ES_Modules-yellow.svg)
![Storage: localStorage](https://img.shields.io/badge/Storage-100%25_Local_Private-emerald.svg)
![Zero Dependencies](https://img.shields.io/badge/Backend-Zero_Server_Required-blueviolet.svg)

---

## 1. Project Overview

HabitPulse is built to help users answer three fundamental performance questions:
1. **What did I actually accomplish today?**
2. **What patterns explain my progress, consistency, and setbacks?**
3. **What practical change can I make to improve tomorrow?**

### Core Principles
- **Beautiful & Distraction-Free:** Modern design with Light, Dark, and True OLED themes plus customizable accent tones.
- **Fast Daily Entry:** Excel-style weekly grid with keyboard navigation, plus a dedicated Daily Focus view with large touch targets (&ge;44px).
- **Accurate & Transparent Analytics:** Single source of truth in `analytics.js` with verifiable formulas. No fabricated metrics.
- **Privacy-First:** 100% stored in local browser storage (`localStorage`). No servers, no tracking, no external AI calls.
- **Data Portability:** Full JSON backup export/import with validation, recovery backups, and CSV spreadsheet exports.
- **GitHub Pages Ready:** Pure static deployment with relative asset paths.

---

## 2. Supported Habit Types

HabitPulse provides first-class support for 5 distinct habit types:

| Habit Type | Data Tracked | Example Default Habit | Attainment Calculation |
| :--- | :--- | :--- | :--- |
| **Yes / No** | Binary completed, missed, or skipped | *Meditation* (1 session) | Completed = 100% |
| **Quantity** | Numerical amount and custom unit | *Drink Water* (5 liters) | $\min(\frac{\text{amount}}{\text{target}}, 1) \times 100\%$ |
| **Duration** | Minutes (formatted as hours and mins) | *Walking* (120m), *Workout* (60m) | $\min(\frac{\text{recorded minutes}}{\text{target minutes}}, 1) \times 100\%$ |
| **Avoidance** | Compliance vs Violation tracking | *No Sugar* | Compliant advances streak; violation breaks streak |
| **Count** | Discrete repetitions or sessions | *Deep Work Sessions* (3 times) | Count vs target with inline steppers |

---

## 3. Architecture & File Structure

```text
habit-tracker/
│
├── index.html                  # App entry point, shell layout, and semantic markup
├── package.json                # Project manifest and test runner configuration
├── README.md                   # Complete specification, setup, and usage documentation
│
├── css/
│   ├── themes.css              # Light, Dark, OLED, and accent color custom properties
│   ├── main.css                # Typography, app shell, modals, toasts, buttons, forms
│   ├── dashboard.css           # Daily progress ring, 7-day strip, snapshot cards
│   ├── tracker.css             # Excel-style weekly grid, cell states, daily focus view
│   └── analytics.css           # Metric cards, calendar heatmap, chart containers
│
├── js/
│   ├── app.js                  # App coordinator, hash router, and event listeners
│   ├── storage.js              # Versioned schema, migrations, JSON & CSV import/export
│   ├── habits.js               # Habit CRUD, type validation, stable UUIDs, schedules
│   ├── tracker.js              # Weekly grid rendering, daily focus view, undo stack
│   ├── analytics.js            # Pure statistical engine: streaks, consistency score, pacing
│   ├── charts.js               # Chart.js visualizations: trends, weekdays, radar, scatter
│   ├── heatmap.js              # Custom GitHub-style 52-week calendar heatmap
│   └── ui.js                   # Accessible modals, toasts, SVG icons, formatters
│
├── pages/
│   ├── dashboard.html          # Command center view template
│   ├── tracker.html            # Daily & weekly tracker view template
│   ├── analytics.html          # Statistical analytics and charts view template
│   ├── habits.html             # Habit definition and management view template
│   └── settings.html           # Themes, preferences, and backup view template
│
├── assets/
│   ├── icons/                  # 33+ Local SVG icon files (offline & zero CDN)
│   └── lib/
│       └── chart.umd.js        # Local pinned Chart.js bundle (offline)
│
├── tests/
│   ├── storage_habits.test.js  # Unit tests for storage, migrations, and habit logic
│   └── analytics.test.js       # Mathematical tests for formulas, streaks, correlations
│
└── scripts/
    ├── serve.js                # Zero-dependency local development server
    └── generate_icons.js       # Local SVG icon builder script
```

---

## 4. Transparent Mathematical Formulas

All statistical calculations reside strictly in [analytics.js](file:///d:/Habit%20Tracker/js/analytics.js):

### A. Completion Rate
$$\text{Completion Rate} = \frac{\text{Completed Eligible Days}}{\text{Recorded Eligible Days}} \times 100$$
- Unscheduled days and future days are excluded from eligible opportunities.
- Unrecorded days are reported alongside recorded observations ($n < 7$ flags insufficient data).

### B. Quantity & Duration Attainment
$$\text{Per-Entry Attainment} = \min\left(\frac{\text{Recorded Amount}}{\text{Target}}, 1\right) \times 100\%$$
- Attainment is capped at 100% per entry to prevent single high-volume days from artificially distorting consistency.

### C. Transparent Consistency Score (0–100)
The user-visible score combines three weighted factors:
1. **Eligible-Day Completion Rate (60% weight):** Ratio of completed to recorded eligible days.
2. **Target Attainment (25% weight):** Average degree of target achievement for quantitative habits.
3. **Recent Regularity (15% weight):** Completion consistency over the trailing 14-day cycle.

$$\text{Consistency Score} = (0.60 \times \text{Completion Rate}) + (0.25 \times \text{Avg Attainment}) + (0.15 \times \text{14-Day Rate})$$

### D. Habit Correlation (Phi Coefficient)
For pairs of binary habits $A$ and $B$, co-occurrence is measured using a $2 \times 2$ contingency table with minimum $N \ge 20$ paired observations:

$$\phi = \frac{ad - bc}{\sqrt{(a+b)(c+d)(a+c)(b+d)}}$$

*Note:* Associations strictly measure historical co-occurrence. Correlation does not imply causation.

---

## 5. Local Setup & Usage

### Prerequisites
- Node.js &ge; 18.x (for local testing and serving)
- Any modern web browser (Chrome, Firefox, Safari, Edge)

### Running Locally
1. Start the zero-dependency local static server:
   ```bash
   node scripts/serve.js
   ```
2. Open your browser and navigate to:
   ```text
   http://localhost:3000
   ```

### Running Automated Test Suite
To execute the comprehensive unit test suite:
```bash
npm test
```

---

## 6. GitHub Pages Static Deployment

Because all asset links (`css/`, `js/`, `assets/`, `pages/`) use relative paths and bundled local SVG/Chart.js scripts, this project deploys directly to GitHub Pages:
1. Commit and push the repository to GitHub.
2. Navigate to **Settings > Pages**.
3. Under **Build and deployment > Source**, choose `Deploy from a branch` and select your `main` branch with `/ (root)`.
4. Click **Save**. Your site will be live at `https://<username>.github.io/<repository-name>/`.

---

## 7. Data Privacy & Backup Strategy

- **Zero Remote Transmission:** Habits and logs never leave your device.
- **Exporting JSON:** In **Settings > Data Portability**, click **Export JSON** to download a complete versioned snapshot.
- **Safe Import:** Imports provide a preview of habit and entry counts, allow choosing between `Merge` and `Replace`, and automatically create an emergency recovery backup in `localStorage` before any replace operation.
- **Spreadsheet Exports:** Generate CSV files for daily entries, habit configurations, or summary analytical metrics.
