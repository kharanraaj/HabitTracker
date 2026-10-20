import http from 'node:http';

const urls = [
  '/',
  '/index.html',
  '/css/themes.css',
  '/css/main.css',
  '/css/dashboard.css',
  '/css/tracker.css',
  '/css/analytics.css',
  '/assets/lib/chart.umd.js',
  '/js/app.js',
  '/js/storage.js',
  '/js/habits.js',
  '/js/tracker.js',
  '/js/analytics.js',
  '/js/charts.js',
  '/js/heatmap.js',
  '/js/ui.js',
  '/pages/dashboard.html',
  '/pages/tracker.html',
  '/pages/analytics.html',
  '/pages/habits.html',
  '/pages/settings.html'
];

let pending = urls.length;
for (const u of urls) {
  const req = http.get(`http://127.0.0.1:3000${u}`, (res) => {
    console.log(`${res.statusCode} ${res.headers['content-type']?.split(';')[0]} -> ${u}`);
    pending--;
    if (pending === 0) {
      console.log('ALL URLS CHECKED SUCCESSFULLY');
      process.exit(0);
    }
  });
  req.on('error', (err) => {
    console.error(`ERROR on ${u}:`, err.message);
    pending--;
    if (pending === 0) process.exit(1);
  });
}
