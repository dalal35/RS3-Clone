import {chromium,expect} from '@playwright/test';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
let server,browser;
try {
  server=await createServer({server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false,watch:{ignored:['**/.tools/**','**/.superpowers/**']}}});await server.listen();
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage({viewport:{width:1360,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Simulated Tauri picker/authorization and media clock; native decode is checked separately.
  await page.addInitScript(()=>{
    window.isTauri=true;window.__TAURI_INTERNALS__={convertFileSrc:path=>`https://asset.localhost/${encodeURIComponent(path)}`,
      invoke:async(cmd,args)=>cmd==='plugin:dialog|open'?(window.fixturePick??null):cmd==='authorize_local_video'?{path:args.path,size:window.fixtureSize??100,modifiedMs:1,status:'ready'}:null};
    const times=new WeakMap(),rates=new WeakMap(),sources=new WeakMap();
    Object.defineProperties(HTMLMediaElement.prototype,{
      src:{get(){return sources.get(this)??'';},set(value){sources.set(this,value);}},duration:{get(){return window.fixtureUnknown?NaN:60;}},currentTime:{get(){return times.get(this)??0;},set(value){times.set(this,value);this.dispatchEvent(new Event('timeupdate'));queueMicrotask(()=>this.dispatchEvent(new Event('seeked')));}},
      playbackRate:{get(){return rates.get(this)??1;},set(value){rates.set(this,value);this.dispatchEvent(new Event('ratechange'));}},
      paused:{get(){return !this.dataset.playing;}}});
    HTMLMediaElement.prototype.load=function(){if(sources.has(this))queueMicrotask(()=>this.dispatchEvent(new Event('loadedmetadata')));};
    HTMLMediaElement.prototype.play=async function(){this.dataset.playing='1';this.dispatchEvent(new Event('playing'));};
    HTMLMediaElement.prototype.pause=function(){delete this.dataset.playing;this.dispatchEvent(new Event('pause'));};
  });
  await page.goto(`${server.resolvedUrls.local[0]}tests/video.html`,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('region',{name:'Video synchronization'})).toBeVisible();
  const state=()=>page.evaluate(()=>window.fixtureState);
  const pick=async(path='/fixture/onboard.mp4')=>{await page.evaluate(path=>window.fixturePick=path,path);};
  await page.getByRole('button',{name:'Attach MP4 / MOV',exact:true}).click();assert.equal((await state()).source,null,'cancel must not attach');
  await page.evaluate(()=>window.fixtureRestore());await expect(page.getByRole('button',{name:'Play',exact:true})).toBeEnabled();
  await expect.poll(()=>page.evaluate(()=>window.fixturePlayer?.snapshot().time)).toBe(12);
  assert.equal((await state()).preferences.playbackRate,1.5,'restore preserves saved rate during readiness');
  await expect.poll(()=>page.evaluate(()=>window.fixturePlayer?.snapshot().rate)).toBe(1.5);
  await page.evaluate(()=>window.fixtureReset());
  await pick();await page.getByRole('button',{name:'Attach MP4 / MOV',exact:true}).click();await expect(page.getByRole('button',{name:'Play',exact:true})).toBeEnabled();
  await page.evaluate(()=>{document.querySelector('video').currentTime=10;});
  await page.getByLabel('Anchor lap',{exact:true}).selectOption('lap2');await page.getByRole('button',{name:'Sync Here',exact:true}).click();
  let saved=await state();assert.equal(saved.segments.length,1);assert.deepEqual([saved.segments[0].videoStart,saved.segments[0].videoEnd,saved.segments[0].anchorVideoTime,saved.segments[0].anchorTelemetryTime,saved.segments[0].anchorLapId],[0,60,10,120,'lap2']);
  await expect(page.getByText('Lap 1 · partial coverage',{exact:true})).toBeVisible();await expect(page.getByText('Lap 2 · full coverage',{exact:true})).toBeVisible();await expect(page.getByText('Lap 4 · partial coverage',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Predicted lap 2 crossing/})).toBeVisible();
  await page.screenshot({path:'.tools/video-workspace-dark.png',animations:'disabled'});await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:'.tools/video-workspace-light.png',animations:'disabled'});await page.evaluate(()=>document.documentElement.removeAttribute('data-theme'));
  const beforeCoveredAdd=await state();await page.getByRole('button',{name:'Add segment here'}).click();await expect(page.getByRole('alert')).toContainText('Trim the existing segment first');assert.deepEqual((await state()).segments,beforeCoveredAdd.segments);
  await page.getByLabel('Segment end (s)').fill('30');await page.getByRole('button',{name:'Apply segment edits'}).click();
  await page.evaluate(()=>{document.querySelector('video').currentTime=35;});await page.getByLabel('Anchor lap',{exact:true}).selectOption('lap2');await page.getByRole('button',{name:'Add segment here'}).click();
  saved=await state();assert.equal(saved.segments.length,2);assert.deepEqual(saved.segments.map(s=>[s.videoStart,s.videoEnd]),[[0,30],[30,60]],'add uses remaining interval without trimming previous segment');
  await expect(page.getByLabel('Video anchor (s)')).toHaveValue('35');await page.getByLabel('Segment start (s)').fill('20');await page.getByRole('button',{name:'Apply segment edits'}).click();await expect(page.getByRole('alert')).toContainText('overlap');assert.deepEqual((await state()).segments,saved.segments,'invalid edits retain valid mappings');
  await page.getByLabel('Segment start (s)').fill('30');await page.getByRole('button',{name:'Apply segment edits'}).click();
  const markers=await page.locator('[data-marker-segment]').evaluateAll(nodes=>nodes.map(n=>[n.dataset.markerSegment,Number(n.dataset.videoTime)]));
  await page.getByRole('button',{name:'Correction +0.1 s',exact:true}).click();
  const corrected=await page.locator('[data-marker-segment]').evaluateAll(nodes=>nodes.map(n=>[n.dataset.markerSegment,Number(n.dataset.videoTime)]));
  const first=saved.segments[0].id,second=saved.segments[1].id;
  assert.deepEqual(corrected.filter(([id])=>id===first),markers.filter(([id])=>id===first),'nudge leaves other markers fixed');
  assert(Math.abs(corrected.find(([id])=>id===second)[1]-markers.find(([id])=>id===second)[1]+.1)<1e-9,'positive correction moves predicted crossing earlier');
  await page.evaluate(()=>window.fixtureTelemetry(120));await expect(page.getByText('Repeated footage: choose a segment to seek.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Use segment 2',exact:true}).click();assert.equal((await state()).selectedSegmentId,second);
  const slider=page.getByRole('slider',{name:'Video timeline'});await slider.focus();await page.keyboard.press('ArrowRight');await expect.poll(()=>page.evaluate(()=>window.fixtureSeeks?.length??0)).toBeGreaterThan(0);await expect.poll(async()=>(await state()).preferences.pausedVideoTime).toBe(await page.evaluate(()=>window.fixtureSeeks.at(-1)));
  const separator=page.getByRole('separator',{name:'Resize video panel'});await separator.focus();await page.keyboard.press('ArrowDown');assert.equal((await state()).preferences.panelHeight,420);
  const viewport=page.locator('.video-viewport');let box=await viewport.boundingBox();assert(box.width>=200&&box.height>=200);assert(Math.abs(box.width/box.height-16/9)<.02,'player preserves 16:9 aspect');
  await page.getByRole('button',{name:'Play',exact:true}).click();const saves=await page.evaluate(()=>window.fixtureSaves);await page.evaluate(()=>{document.querySelector('video').currentTime=36;});assert.equal(await page.evaluate(()=>window.fixtureSaves),saves,'playing ticks do not persist');await page.getByRole('button',{name:'Pause',exact:true}).click();await expect.poll(async()=>(await state()).preferences.pausedVideoTime).toBe(36);
  await page.getByLabel('Playback speed').selectOption('1.5');await expect.poll(async()=>(await state()).preferences.playbackRate).toBe(1.5);
  await page.evaluate(()=>window.scrollTo(0,document.querySelector('.video-graphs').offsetTop+200));box=await viewport.boundingBox();assert(box.y>=0&&box.y<400,'player remains visible while graph region scrolls');await expect(page.getByText('GPS inspector remains visible',{exact:true})).toBeInViewport();
  await page.evaluate(()=>document.documentElement.dataset.theme='light');await expect(page.getByRole('region',{name:'Video synchronization'})).toBeVisible();assert.equal(await viewport.evaluate(n=>getComputedStyle(n).aspectRatio),'16 / 9');await page.evaluate(()=>document.documentElement.removeAttribute('data-theme'));await page.evaluate(()=>window.scrollTo(0,0));
  await page.getByRole('button',{name:'Remove selected segment'}).click();assert.equal((await state()).segments.length,1);await expect(page.getByText('Lap 3 · no coverage',{exact:true})).toBeVisible();
  saved=await state();await page.evaluate(()=>window.fixtureAvailability('missing'));await expect(page.getByRole('strong').filter({hasText:'Footage unavailable'})).toBeVisible();await expect.poll(()=>page.evaluate(()=>window.fixturePlayer===null)).toBe(true);await pick('/fixture/moved.mp4');await page.getByRole('button',{name:'Locate',exact:true}).click();await expect(page.getByRole('button',{name:'Confirm mappings still apply'})).toBeVisible();assert.deepEqual((await state()).segments,saved.segments);await page.getByRole('button',{name:'Confirm mappings still apply'}).click();assert.deepEqual((await state()).segments,saved.segments);assert.equal((await state()).source.path,'/fixture/moved.mp4');await expect(page.getByRole('button',{name:'Play',exact:true})).toBeEnabled();
  await page.evaluate(()=>window.fixtureAvailability('ready'));await pick('/fixture/replaced.mov');await page.getByRole('button',{name:'Replace footage',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual((await state()).segments,saved.segments,'cancel replacement preserves mappings');await page.getByRole('button',{name:'Replace footage',exact:true}).click();await page.getByRole('button',{name:'Replace and clear segments',exact:true}).click();assert.equal((await state()).segments.length,0);assert.equal((await state()).source.path,'/fixture/replaced.mov');
  await page.evaluate(()=>window.fixtureAvailability('changed'));await expect.poll(()=>page.evaluate(()=>window.fixturePlayer===null)).toBe(true);await expect(page.getByText('The file metadata changed. Confirm that the existing mappings still apply.',{exact:true})).toBeVisible();await pick('/fixture/replaced.mov');await page.getByRole('button',{name:'Locate',exact:true}).click();await page.getByRole('button',{name:'Confirm mappings still apply'}).click();await expect(page.getByRole('button',{name:'Play',exact:true})).toBeEnabled();
  await page.evaluate(()=>{window.fixtureAvailability('ready');window.fixtureUnknown=true;window.fixtureReset();});await pick();await page.getByRole('button',{name:'Attach MP4 / MOV',exact:true}).click();await expect(page.getByText('Waiting for a known video duration before creating segments.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Sync Here',exact:true})).toBeDisabled();
  await page.evaluate(()=>{const video=document.querySelector('video');video.dispatchEvent(new Event('error'));});await expect(page.getByRole('alert')).toContainText(/codec|playback failed/i);
  assert.deepEqual(errors,[]);console.log('PASS: video source cancel/replace/Locate, lap anchors, trim/add/validation/correction/removal, coverage, ambiguity, keyboard timeline/resize, semantic preferences, sticky dark/light player and readiness/errors (simulated clock; native playback checked separately)');
} finally {await browser?.close();await server?.close();}
