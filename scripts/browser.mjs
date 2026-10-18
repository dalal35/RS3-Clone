import {chromium} from '@playwright/test';
import {existsSync,readdirSync} from 'node:fs';

// Keep the existing local Chrome preference; other hosts use Playwright Chromium.
export function launchBrowser() {
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return chromium.launch({headless:true,...(process.platform==='darwin'&&existsSync(chrome)?{executablePath:chrome}:{})});
}

// Literal entries keep Vite on its no-glob fast path. Mixing index.html with a
// glob otherwise crawls the project root, including large native build folders.
export const browserTestEntries=['index.html',...readdirSync(new URL('../tests/',import.meta.url)).filter(name=>name.endsWith('.html')).map(name=>`tests/${name}`)];
