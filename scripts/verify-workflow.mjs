// Browser exercises of the React workflow. IPC is simulated; native persistence is tested separately.
import {launchBrowser} from './browser.mjs';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
let server,browser;
try{
 server=await createServer({optimizeDeps:{entries:['index.html','tests/*.html']},server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false,watch:null}});await server.listen();
 browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 // Exercise queued-save/analysis ordering even when React effects run slowly.
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'platform',{value:localStorage.getItem('test-platform')||'Win32',configurable:true});
  window.isTauri=true;
  const laps=[{id:'a',number:1,duration:10,start:0,end:10,complete:true},{id:'b',number:2,duration:12,start:10,end:22,complete:true}];
  const channels=[{id:'speed',name:'GPS Speed',unit:'m/s',times:[0,10],values:[10,20]},{id:'rpm',name:'RPM',unit:'rpm',times:[0,10],values:[1000,2000]}];
  const sessions=['one','two'].map(id=>({id,name:id,track:`Track ${id}`,driver:'Test',source:`/tmp/${id}.xrk`,recordedAt:'2026-10-14 12:00:00',warnings:[],laps,channels}));
  const initial={entries:sessions.map(s=>({...s,lapCount:2,channelCount:2,status:'ready',contentVersion:'v1',workspace:null,lastUsed:1})),activeSessionId:'one',warnings:[]};
  const read=()=>JSON.parse(localStorage.getItem('test-library')||JSON.stringify(initial));
  const write=v=>localStorage.setItem('test-library',JSON.stringify(v));
  window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
  window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>1,invoke:async(cmd,args={})=>{
   const db=read();if(cmd.startsWith('plugin:event'))return 1;
   if(cmd==='plugin:dialog|open'){window.openCalls=(window.openCalls??0)+1;return null;}
   if(cmd==='library_snapshot')return db;
   if(cmd==='load_library_session'){if(args.sessionId===db.virtualSession?.id)return db.virtualSession;if(args.sessionId==='two')await new Promise(r=>setTimeout(r,80));db.activeSessionId=args.sessionId;write(db);return sessions.find(s=>s.id===args.sessionId);}
   const preview=()=>{const selected=sessions.filter(s=>args.sessionIds.includes(s.id));const refs=selected.map(s=>({sessionId:s.id,contentVersion:db.entries.find(e=>e.id===s.id).contentVersion}));return {sources:refs,day:'2026-10-14',previewVersion:refs.map(r=>r.contentVersion).join('-'),warnings:['Conflicting track metadata.','Source timestamps overlap; both recordings are retained.'],laps:selected.flatMap((s,i)=>s.laps.map((lap,j)=>({...lap,id:JSON.stringify([s.id,lap.id]),sourceSessionId:s.id,sourceLapId:lap.id,displayNumber:i*2+j+1}))),channels:selected.flatMap(s=>s.channels.map(c=>({...c,id:`${s.id}::${c.id}`,sourceSessionId:s.id,sourceChannelId:c.id,times:[],values:[]})))};};
   if(cmd==='preview_merge_sessions'){if(window.rejectMergeDate)throw Error('Recording date is ambiguous; filenames are not used.');return preview();}
   if(cmd==='merge_sessions'){
    window.mergeCalls=(window.mergeCalls??0)+1;await new Promise(r=>setTimeout(r,100));const p=preview();if(args.previewVersion!==p.previewVersion||!args.acknowledgeWarnings)throw Error('Stale or unacknowledged preview');
    const merged={id:'merged-test',name:'Merged recordings',driver:'Test',track:'Track one',recordedAt:p.day,source:'Virtual merge',laps:p.laps,channels:p.channels,warnings:p.warnings,merge:{preview:p,sources:p.sources.map(r=>({...r,session:{...sessions.find(s=>s.id===r.sessionId),channels:[]}}))}};
    const workspace={...db.entries.find(e=>e.id==='one').workspace,contentVersion:'merged-v1',primary:JSON.stringify(['one','a']),comparison:null,channels:['one::speed','one::rpm'],sourceVideos:{}};
    db.virtualSession=merged;db.entries.unshift({...merged,mergeSources:p.sources,contentVersion:'merged-v1',status:'ready',lapCount:4,channelCount:4,workspace,lastUsed:2});db.activeSessionId=merged.id;write(db);return merged;
   }
   if(cmd==='unmerge_session'){await new Promise(r=>setTimeout(r,100));db.entries=db.entries.filter(e=>e.id!==args.sessionId);delete db.virtualSession;db.activeSessionId='one';write(db);return db;}
   if(cmd==='refresh_library_session'){await new Promise(r=>setTimeout(r,200));const current=read();const entry=current.entries.find(e=>e.id===args.sessionId);entry.contentVersion='v2';entry.workspace=null;write(current);return sessions.find(s=>s.id===args.sessionId);}
   if(cmd==='save_workspace'){await new Promise(r=>setTimeout(r,30));if(db.entries.find(e=>e.id===args.sessionId).contentVersion!==args.expectedContentVersion)throw Error('Stale source version');db.entries.find(e=>e.id===args.sessionId).workspace=args.workspace;db.activeSessionId=args.sessionId;write(db);return;}
   if(cmd==='remove_library_session'){db.entries=db.entries.filter(e=>e.id!==args.sessionId);write(db);return db;}
   if(cmd==='set_corner_boundaries'){await new Promise(r=>setTimeout(r,args.boundaries?.[0]===55?80:args.boundaries?.[0]===70?200:10));localStorage.setItem('test-corners',JSON.stringify(args.boundaries));return;}
   if(cmd==='analyze_session'){await new Promise(r=>setTimeout(r,args.sessionId==='one'?100:10));const bounds=JSON.parse(localStorage.getItem('test-corners')||'null');const middle=bounds?.[0]??50;const position=m=>args.axis==='time'?m/10:m;const metrics={elapsed:5,entrySpeed:10,minSpeed:10,exitSpeed:10,channels:[]};const view={lapId:args.primaryId,duration:10,length:100,mapping:[{meters:0,time:0},{meters:50,time:5},{meters:100,time:10}],track:[{x:0,y:0,position:position(0),speed:10},{x:50,y:20,position:position(50),speed:10},{x:100,y:0,position:position(100),speed:10}],warnings:[],series:args.channelIds.map(id=>({...channels.find(c=>c.id===id.split('::').pop()),channelId:id,x:[0,position(100)],values:[10,20]}))};return {primary:view,comparison:null,cornerBoundaries:bounds,alignment:{method:'spatial',coverage:1,notes:[]},segments:[{id:'first',label:'Corner 1',kind:'corner',start:0,end:position(middle),startMeters:0,endMeters:middle,uncertaintyMeters:5,primary:metrics,comparison:null,deltaSeconds:null},{id:'second',label:'Straight 1',kind:'straight',start:position(middle),end:position(100),startMeters:middle,endMeters:100,uncertaintyMeters:5,primary:metrics,comparison:null,deltaSeconds:null}],delta:null,warnings:[]};}
   throw Error(`Unexpected test IPC ${cmd}`);
  }};
 });
 await page.goto(server.resolvedUrls.local[0]);await page.getByRole('heading',{name:'Track one'}).waitFor();
 assert.equal(await page.locator('.import-button kbd').innerText(),'Ctrl O','Windows import hint uses the working Control shortcut');
 await page.getByRole('button',{name:'Edit boundaries',exact:true}).click();
 const handle=page.getByRole('slider',{name:'Section boundary 1'});await handle.click();await page.waitForTimeout(150);assert.equal(await handle.evaluate(el=>document.activeElement===el),true,'Clicking a boundary enables keyboard adjustment');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('test-corners')||'null')?.[0]===60);await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('test-corners'))[0]),60,'Rapid boundary commits retain the latest edit');assert.equal(await handle.evaluate(el=>document.activeElement===el),true,'Saving a boundary preserves keyboard focus');
 await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('test-corners'))[0]===65);
 await page.keyboard.press('ArrowRight');await page.waitForTimeout(120);await page.keyboard.press('ArrowRight');await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('test-corners'))[0]),75,'Older analysis cannot reset a newer boundary draft');
 await page.getByRole('button',{name:'Done editing',exact:true}).click();
 await page.getByRole('button',{name:'Time',exact:true}).click();await page.getByRole('button',{name:'Compact',exact:true}).click();
 await page.getByRole('button',{name:/Track two Test/}).click();await page.getByRole('heading',{name:'Track two'}).waitFor();await page.getByText('Saved on this computer').waitFor();
 await page.locator('.plot-label').filter({hasText:'mph'}).waitFor();assert.equal(await page.locator('.plot-label').filter({hasText:'mph'}).count(),1,'Another session displays mph');
 await page.getByRole('button',{name:/Track one Test/}).click();await page.getByRole('heading',{name:'Track one'}).waitFor();await page.getByText('Saved on this computer').waitFor();
 await page.locator('.plot-label').filter({hasText:'mph'}).waitFor();assert.equal(await page.locator('.plot-label').filter({hasText:'mph'}).count(),1,'Switching retains mph');assert.equal(await page.locator('.segmented[aria-label="Horizontal axis"] button.active').innerText(),'Time','Switching restores axis');
 await page.reload();await page.getByRole('heading',{name:'Track one'}).waitFor();await page.locator('.plot-label').filter({hasText:'mph'}).waitFor();assert.equal(await page.locator('.plot-label').filter({hasText:'mph'}).count(),1,'Reload retains mph');assert.equal(await page.locator('.segmented[aria-label="Horizontal axis"] button.active').innerText(),'Time');assert.equal(await page.getByRole('button',{name:'Comfortable',exact:true}).count(),1,'Reload restores graph density');
 await page.locator('.library-entry').filter({hasText:'Track one'}).getByRole('button',{name:'Refresh',exact:true}).click();
 assert.equal(await page.locator('main').getAttribute('inert'),'','Workspace is frozen during explicit refresh');
 await page.waitForFunction(()=>!document.querySelector('main').inert&&document.querySelector('.segmented[aria-label="Horizontal axis"] button.active')?.textContent==='Distance');
 await page.locator('.plot-label').filter({hasText:'mph'}).waitFor();assert.equal(await page.locator('.plot-label').filter({hasText:'mph'}).count(),1,'Changed source retains mph');
 // Merge UI exercises real React selection, lifecycle queues and persisted restoration.
 await page.waitForFunction(()=>{const e=JSON.parse(localStorage.getItem('test-library')).entries.find(e=>e.id==='one');return e.workspace?.contentVersion==='v2'&&e.workspace?.zoom?.primary==='a'&&e.workspace.zoom.axis==='distance';});
 const originals=await page.evaluate(()=>JSON.parse(localStorage.getItem('test-library')).entries.map(e=>({id:e.id,workspace:e.workspace})));
 // Existing restoreAdvanced supplies an empty toolViews default on reopening.
 const normalizeOriginals=entries=>entries.map(original=>{if(original.workspace?.advanced?.config)original.workspace.advanced.config.toolViews??={};return original;});
 await page.getByRole('checkbox',{name:'Select Track one for merging'}).check();
 assert.equal(await page.getByRole('button',{name:'Merge Sessions',exact:true}).isDisabled(),true);
 await page.getByRole('checkbox',{name:'Select Track two for merging'}).check();
 await page.evaluate(()=>window.rejectMergeDate=true);await page.getByRole('button',{name:'Merge Sessions',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'ambiguous'}).waitFor();await page.evaluate(()=>window.rejectMergeDate=false);
 await page.getByRole('button',{name:'Merge Sessions',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Merge sessions'});await dialog.waitFor();assert.match(await dialog.innerText(),/2026-10-14/);assert.match(await dialog.innerText(),/4 laps/);assert.match(await dialog.innerText(),/overlap/);await page.screenshot({path:'.tools/session-merge-preview.png'});
 assert.equal(await dialog.getByRole('button',{name:'Confirm merge',exact:true}).isDisabled(),true);
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.locator('.library-entry').count(),2);
 await page.getByRole('button',{name:'Merge Sessions',exact:true}).click();await dialog.getByRole('checkbox',{name:'I have reviewed these warnings'}).check();
 await dialog.getByRole('button',{name:'Confirm merge',exact:true}).evaluate(el=>{el.click();el.click();});
 await page.getByRole('heading',{name:'Merged · Track one'}).waitFor();await page.screenshot({path:'.tools/session-merge-workspace.png'});assert.equal(await page.locator('.library-entry').count(),3);assert.equal(await page.locator('.lap-row').count(),4);assert.equal(await page.evaluate(()=>window.mergeCalls),1);
 await page.getByRole('button',{name:'Compare lap 3',exact:true}).click();await page.waitForTimeout(200);
 assert.match(await page.locator('.lap-list').innerText(),/two.xrk/);
 await page.reload();await page.getByRole('heading',{name:'Merged · Track one'}).waitFor();await page.getByText('Saved on this computer').waitFor();
 await page.getByRole('button',{name:'Time',exact:true}).click();await page.getByRole('button',{name:'Unmerge',exact:true}).click();
 await page.getByRole('heading',{name:'Track one',exact:true}).waitFor();await page.waitForTimeout(250);assert.equal(await page.locator('.library-entry').count(),2);
 assert.deepEqual(normalizeOriginals(await page.evaluate(()=>JSON.parse(localStorage.getItem('test-library')).entries.map(e=>({id:e.id,workspace:e.workspace})))),normalizeOriginals(originals),'Unmerge preserves original workspaces through existing default normalization, including queued saves');
 await page.locator('.library-entry').filter({hasText:'Track two'}).getByRole('button',{name:'Remove',exact:true}).click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('test-library')).entries.length===1);assert.equal(await page.locator('.library-entry').count(),1);
 await page.keyboard.press('Control+o');await page.waitForFunction(()=>window.openCalls===1);
 await page.evaluate(()=>localStorage.setItem('test-platform','MacIntel'));await page.reload();await page.getByRole('heading',{name:'Track one'}).waitFor();
 assert.equal(await page.locator('.import-button kbd').innerText(),'⌘ O','macOS keeps the Command shortcut hint');
 await page.keyboard.press('Meta+o');await page.waitForFunction(()=>window.openCalls===1);
 assert.deepEqual(errors,[]);console.log('PASS: React IPC workflow — per-session switching, queued saves, workspace reload and safe library remove');
}finally{await browser?.close();await server?.close();}
