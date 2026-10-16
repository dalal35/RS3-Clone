import {launchBrowser} from './browser.mjs';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
let server,browser;
try {
 server=await createServer({optimizeDeps:{entries:['index.html','tests/*.html']},server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false,watch:null}});await server.listen();
 browser=await launchBrowser();
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const originalMatchMedia=window.matchMedia.bind(window);window.densityQueries=[];window.matchMedia=media=>{const query=originalMatchMedia(media);window.densityQueries.push(query);return query;};window.bars=[];window.rings=[];const ellipse=CanvasRenderingContext2D.prototype.ellipse;CanvasRenderingContext2D.prototype.ellipse=function(...args){window.rings.push(args);return ellipse.apply(this,args);};const original=CanvasRenderingContext2D.prototype.fillRect;CanvasRenderingContext2D.prototype.fillRect=function(...args){window.bars.push(args);window.lastBarColor=this.fillStyle;return original.apply(this,args);};});
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
 // Real canvas drawing must preserve equal physical G scaling through live resizing and wheel zoom.
 await page.evaluate(()=>window.renderCanvas('traction'));
 for(const viewport of [{width:600,height:500},{width:1600,height:1000},{width:2560,height:1440}]){
  await page.evaluate(()=>window.rings=[]);await page.setViewportSize(viewport);await page.waitForTimeout(100);
  await page.waitForFunction(()=>window.rings.length>0);
  assert((await page.evaluate(()=>window.rings)).every(r=>Number.isFinite(r[2])&&Math.abs(r[2]-r[3])<1e-6),'Traction G reference rings remain circular');
  const measured=await canvas.boundingBox();assert(measured.height>=240&&measured.height<=viewport.height,'Canvas height fits short and wide windows');
  await canvas.hover({position:{x:measured.width/2,y:measured.height/2}});await page.mouse.wheel(0,-100);
  await page.waitForTimeout(100);assert((await page.evaluate(()=>window.rings)).every(r=>Math.abs(r[2]-r[3])<1e-6),'Wheel zoom preserves equal G scale');
 }
 // A display-density change alone must repaint the existing canvas, preserving its view.
 const ringBeforeDensity=await page.evaluate(()=>window.rings.at(-1).slice(0,4));
 await canvas.evaluate(el=>window.densityCanvas=el);
 const cdp=await page.context().newCDPSession(page);
 const viewport=page.viewportSize();
 for(const scale of [1.25,1.5,2,1]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:scale,mobile:false});
  // CDP changes resolution but emits no native MediaQueryList event; supply that boundary event.
  await page.evaluate(()=>window.densityQueries.slice().forEach(query=>query.dispatchEvent(new MediaQueryListEvent('change',{matches:query.matches,media:query.media}))));
  await page.waitForTimeout(150);
  const density=await canvas.evaluate(el=>({pixels:el.width,css:el.getBoundingClientRect().width,dpr:devicePixelRatio}));
  assert(Math.abs(density.pixels-density.css*scale)<=1,`Canvas backing pixels follow DPR-only transition to ${scale}: ${JSON.stringify(density)}`);
  assert(await canvas.evaluate(el=>el===window.densityCanvas),'Density change preserves the mounted canvas');
  assert.deepEqual(await page.evaluate(()=>window.rings.at(-1).slice(0,4)),ringBeforeDensity,'Density change preserves traction zoom and geometry');
 }
 await cdp.detach();
 assert.deepEqual(errors,[]);console.log('PASS: finite log-bin rendering, exact hover/click inspection, exclusion counts, cursor isolation, zoom/reset and DPR-only 100/125/150/200% repaint');
} finally {await browser?.close();server?.httpServer?.closeIdleConnections();server?.httpServer?.closeAllConnections();await server?.close();}
