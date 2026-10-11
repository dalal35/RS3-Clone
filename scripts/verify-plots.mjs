// A local-only interaction check using real XRK analysis. No fixture data is uploaded.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
const fixture=readdirSync('data').filter(name=>name.toLowerCase().endsWith('.xrk')).sort()[0];
assert(fixture,'Place real XRK fixtures in data/ before running the plot integration check.');
mkdirSync('.tools',{recursive:true});
const output=execFileSync('cargo',['run','--manifest-path','src-tauri/Cargo.toml','--offline','--example','inspect','--',`data/${fixture}`],{encoding:'utf8',stdio:['ignore','pipe','inherit']});
writeFileSync('.tools/analysis.json',output);
let server,browser;
try {
 server=await createServer({server:{host:'127.0.0.1',port:0,strictPort:false}});await server.listen();
 const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
 const page=await browser.newPage({viewport:{width:1100,height:950}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`${server.resolvedUrls.local[0]}tests/plots.html`);
 const over=page.locator('.u-over').first();await over.waitFor();const box=await over.boundingBox();
 const ranges=()=>page.evaluate(()=>window.getPlotRanges());
 const before=await ranges();
 await page.mouse.move(box.x+box.width*.2,box.y+30);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+30,{steps:12});await page.mouse.up();
 await page.waitForTimeout(100);const zoomed=await ranges();
 assert(zoomed[0].max-zoomed[0].min<(before[0].max-before[0].min)*.7,'Drag zoom must narrow the visible range');
 assert(zoomed.every(range=>range.min===zoomed[0].min&&range.max===zoomed[0].max),'All plots must share zoom');
 await page.keyboard.down('Shift');await page.mouse.move(box.x+box.width*.6,box.y+40);await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+40,{steps:8});await page.mouse.up();await page.keyboard.up('Shift');
 await page.waitForTimeout(100);const panned=await ranges();
 assert(Math.abs(panned[0].min-zoomed[0].min)>1,'Shift-drag must pan');
 assert(Math.abs((panned[0].max-panned[0].min)-(zoomed[0].max-zoomed[0].min))<1e-6,'Pan must preserve scale');
 await page.getByRole('button',{name:'Reset',exact:true}).click();await page.waitForTimeout(100);const reset=await ranges();
 assert(Math.abs(reset[0].max-before[0].max)<1e-6&&reset[0].min===before[0].min,'Reset restores the full lap');
 await page.mouse.move(box.x+box.width*.4,box.y+50);await page.waitForTimeout(50);
 assert(Number(await page.locator('output').textContent())>0,'Cursor position updates');
 assert((await page.locator('.readout').first().innerText()).match(/\d/),'Live numerical readout updates');
 assert.deepEqual(errors,[]);
 console.log(`PASS: real-XRK plots (${before.length} channels): synchronized zoom, pan, reset and live cursor`);
} finally {
 await browser?.close();await server?.close();unlinkSync('.tools/analysis.json');
}
