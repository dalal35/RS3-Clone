import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';

// Keep the existing local Chrome preference; other hosts use Playwright Chromium.
export function launchBrowser() {
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return chromium.launch({headless:true,...(process.platform==='darwin'&&existsSync(chrome)?{executablePath:chrome}:{})});
}
