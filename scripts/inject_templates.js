import fs from 'fs';

const pages = ['dashboard', 'tracker', 'analytics', 'habits', 'settings'];
let templatesHtml = '\n    <!-- Embedded View Templates for 100% Offline, Fast & Resilient Navigation -->\n';

for (const p of pages) {
  const content = fs.readFileSync(`pages/${p}.html`, 'utf-8');
  templatesHtml += `    <template id="template-${p}">\n${content}\n    </template>\n\n`;
}

let indexContent = fs.readFileSync('index.html', 'utf-8');

// Insert templates before <script type="module" src="js/app.js"></script>
const targetMarker = '  <!-- Main ES Module Entry Point -->';
if (indexContent.includes(targetMarker)) {
  indexContent = indexContent.replace(targetMarker, `${templatesHtml}  ${targetMarker}`);
  fs.writeFileSync('index.html', indexContent, 'utf-8');
  console.log('Successfully injected 5 view templates into index.html');
} else {
  console.error('Target marker not found in index.html');
}
