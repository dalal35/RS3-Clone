import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
let server,browser;
try {
 server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.bars=[];const original=CanvasRenderingContext2D.prototype.fillRect;CanvasRenderingContext2D.prototype.fillRect=function(...args){window.bars.push(args);window.lastBarColor=this.fillStyle;return original.apply(this,args);};});
 await page.goto(`${server.resolvedUrls.local[0]}tests/canvas.html`);const canvas=page.locator('canvas');await canvas.waitFor();
 await page.waitForFunction(()=>window.bars.length>0);
 const bars=await page.evaluate(()=>window.bars);assert(bars.every(b=>b.every(Number.isFinite)),'all rendered histogram rectangle coordinates must be finite');
 assert(bars.some(([x,y,w,h])=>x>=62&&x<682&&y>=18&&y<356&&w>0&&h>0),'positive bin above ten remains visible with zero and nonpositive bins');
 await canvas.hover({position:{x:200,y:150}});
 await page.locator('.point-inspector').waitFor({timeout:2000});
 assert.match(await page.locator('.point-inspector').innerText(),/Primary.*lap-7.*10.*100.*rpm.*100.*samples.*samples weighting/);
 await canvas.click({position:{x:200,y:150}});
 assert.deepEqual(await page.evaluate(()=>window.cursors),[],'aggregate bin must not set source/map cursor');
 assert.match(await page.locator('.render-exclusions').innerText(),/3 histogram bins/);
 await canvas.hover({position:{x:500,y:300}});assert.match(await page.locator('.point-inspector').innerText(),/100.*1,000.*20/);
 await canvas.hover({position:{x:200,y:150}});await page.mouse.wheel(0,-100);await page.getByRole('button',{name:'Reset view'}).click();
 for(const [mode,unit] of [['time','s'],['percentage','%']]){await page.evaluate(mode=>window.renderCanvas(mode),mode);await canvas.hover({position:{x:200,y:150}});assert.match(await page.locator('.point-inspector').innerText(),new RegExp(`100 ${unit} · ${mode==='time'?'time':'samples'} weighting`));}
 await page.evaluate(()=>window.renderCanvas('comparison'));await canvas.hover({position:{x:200,y:150}});await page.locator('.point-inspector').filter({hasText:'Comparison · Lap lap-8'}).waitFor();assert.equal(await page.evaluate(()=>window.lastBarColor),'#ffaa00','A comparison-only histogram keeps the amber role');
 await page.evaluate(()=>window.renderCanvas('scatter'));await page.locator('.render-exclusions').filter({hasText:'2 scatter points'}).waitFor();
 await canvas.click({position:{x:372,y:187}});assert.deepEqual(await page.evaluate(()=>window.cursors),[20],'scatter inspection retains source cursor propagation');
 assert.deepEqual(errors,[]);console.log('PASS: finite log-bin rendering, exact hover/click inspection, exclusion counts, cursor isolation and zoom/reset');
} finally {await browser?.close();await server?.close();}
