import { mkdirSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Editable geometry, in a 128 × 84 design grid. Each cap and stem is a
// single polygon; no font, tracing, bitmap, stroke, filter, or mask is used.
export const tttPaths = [
  'M10 12H45L41.64 26H30.64L21.52 64H8.52L17.64 26H6.64Z',
  'M48 12H83L79.64 26H68.64L57.6 72H44.6L55.64 26H44.64Z',
  'M86 12H121L117.64 26H106.64L97.52 64H84.52L93.64 26H82.64Z',
];
export const mark = (color) => `<g fill="${color}">${tttPaths.map(d => `<path d="${d}"/>`).join('')}</g>`;
const svg = (body, viewBox='0 0 128 84', size='') => `<svg xmlns="http://www.w3.org/2000/svg" ${size}viewBox="${viewBox}" role="img" aria-label="Ten Tenths Telemetry">${body}</svg>\n`;
const root = fileURLToPath(new URL('../', import.meta.url));
const brand = join(root, 'public/brand');
const icons = join(root, 'src-tauri/icons');
mkdirSync(brand, { recursive:true });
mkdirSync(icons, { recursive:true });
writeFileSync(join(brand, 'ttt-primary.svg'), svg(mark('#33cbd1')));
// Tighter optical bounds make the sidebar mark fill its available width.
writeFileSync(join(brand, 'ttt-compact.svg'), svg(mark('#33cbd1'), '3 8 122 68'));
writeFileSync(join(brand, 'ttt-light.svg'), svg(mark('#e8e9eb')));
writeFileSync(join(brand, 'ttt-dark.svg'), svg(mark('#141618')));
const icon = svg(`<rect x="64" y="64" width="896" height="896" rx="198" fill="#141618"/><g transform="translate(102.4 243.2) scale(6.4)">${mark('#33cbd1')}</g>`, '0 0 1024 1024', 'width="1024" height="1024" ');
writeFileSync(join(icons, 'ttt.svg'), icon);
// Favicon uses the same original geometry with a full canvas for tiny tabs.
writeFileSync(join(brand, 'favicon.svg'), svg(`<rect width="128" height="128" rx="27" fill="#141618"/><g transform="translate(0 22)">${mark('#33cbd1')}</g>`, '0 0 128 128'));

const stage = mkdtempSync(join(tmpdir(), 'ttt-icons-'));
try {
  const result = spawnSync(process.execPath, [join(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'icon', join(icons, 'ttt.svg'), '--output', stage], { cwd:root, stdio:'inherit' });
  if (result.status !== 0) throw new Error('Tauri icon generation failed');
  // Desktop product only: avoid committing unrelated generated mobile assets.
  for (const file of ['32x32.png','128x128.png','128x128@2x.png','icon.png','icon.ico','icon.icns']) copyFileSync(join(stage,file), join(icons,file));
  const sizes = spawnSync(process.execPath, [join(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'icon', join(icons, 'ttt.svg'), '--output', stage, '--png', '16', '--png', '64', '--png', '1024'], { cwd:root, stdio:'inherit' });
  if (sizes.status !== 0) throw new Error('Tauri PNG generation failed');
  for (const size of [16,64,1024]) copyFileSync(join(stage,`${size}x${size}.png`), join(icons,`${size}x${size}.png`));
} finally { rmSync(stage, { recursive:true, force:true }); }
console.log('Generated TTT vectors and desktop icons from canonical geometry.');
