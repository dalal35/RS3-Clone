// Actual release executable + native IPC + WebView2; no Vite, IPC or media mocks.
// https://playwright.dev/docs/webview2 (CDP via inherited WebView2 arguments).
import {chromium, expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {existsSync, readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {createServer} from 'node:net';

assert(process.platform === 'win32' && process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_OS === 'Windows' && process.env.RUNNER_ENVIRONMENT === 'github-hosted' && process.env.RUNNER_TEMP,
  'Runtime smoke is restricted to disposable GitHub-hosted Windows runners.');
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
// APPDATA overrides do not redirect Windows known folders. Check the real ones.
const profiles = JSON.parse(execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command',
  "@([Environment]::GetFolderPath('ApplicationData'),[Environment]::GetFolderPath('LocalApplicationData')) | ConvertTo-Json -Compress"], {encoding:'utf8'}))
  .map(folder => join(folder, config.identifier));
for (const profile of profiles) assert(!existsSync(profile), `Refusing existing application data: ${profile}`);
const binary = resolve('src-tauri/target/x86_64-pc-windows-msvc/release/apex-telemetry.exe');
assert(existsSync(binary), 'Build the Windows release executable before runtime verification.');
const root = mkdtempSync(join(process.env.RUNNER_TEMP, 'ttt-runtime-'));
let fixtures = root;
for (let i = 0; i < 7; i++) fixtures = join(fixtures, 'Unicode 保存 café recording folder');
mkdirSync(fixtures, {recursive:true});
execFileSync('cargo', ['run', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--example', 'generate_parity_fixtures', '--', fixtures], {stdio:'inherit', timeout:300000});
const videoPath = join(fixtures, 'onboard 走行 café.mp4');
copyFileSync('src-tauri/tests/fixtures/windows/bframes.mp4', videoPath);
assert(videoPath.length > 260, 'Native asset test must use a genuinely long Unicode path.');
const errors = [];
let app, browser, page;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function launch() {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  app = spawn(binary, [], {env:{...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`,
    WEBVIEW2_USER_DATA_FOLDER:join(root, 'webview-profile')}, stdio:['ignore','pipe','pipe']});
  let output = '';
  app.stdout.on('data', data => {output += data;});
  app.stderr.on('data', data => {output += data;});
  app.on('error', error => {output += String(error);});
  const endpoint = `http://127.0.0.1:${port}`;
  await expect.poll(async () => {
    assert(app.exitCode === null, `Application exited before CDP initialization: ${output}`);
    try {return (await fetch(`${endpoint}/json/version`, {signal:AbortSignal.timeout(1000)})).ok;} catch {return false;}
  }, {timeout:60000, message:'Release app initializes actual WebView2 CDP'}).toBe(true);
  browser = await chromium.connectOverCDP(endpoint);
  await expect.poll(() => browser.contexts().flatMap(context => context.pages()).length, {timeout:30000}).toBeGreaterThan(0);
  page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => !!window.__TAURI_INTERNALS__?.invoke);
  assert.match(page.url(), /^https?:\/\/tauri\.localhost\/?/, 'Exercise bundled production origin, never a dev server.');
  await expect(page.locator('.shell')).toBeVisible();
  console.log(`Actual release WebView2: ${await browser.version()}, ${page.url()}`);
}
async function close() {
  if (app && app.exitCode === null) {
    // WM_CLOSE exercises ordinary native shutdown and the window-state plugin.
    execFileSync('pwsh', ['-NoProfile','-NonInteractive','-Command', `(Get-Process -Id ${app.pid}).CloseMainWindow() | Out-Null`]);
    for (let i = 0; i < 100 && app.exitCode === null; i++) await pause(100);
    if (app.exitCode === null) {
      execFileSync('taskkill', ['/PID',String(app.pid),'/T','/F']);
      throw new Error('Application did not exit after native window close.');
    }
  }
  await browser?.close().catch(() => {}); browser = undefined;
}
const invoke = (command, args = {}) => page.evaluate(({command,args}) => window.__TAURI_INTERNALS__.invoke(command,args), {command,args});
const snapshot = () => invoke('library_snapshot');
async function saved() {await expect(page.getByText('Saved on this computer', {exact:true})).toBeVisible();}
try {
  await launch();
  assert.equal((await snapshot()).entries.length, 0, 'Start with a disposable empty native library.');
  const sessions = [];
  for (const name of ['synthetic-a.xrk','synthetic-b.xrk']) sessions.push(await invoke('import_session', {path:join(fixtures,name)}));
  const [a,b] = sessions;
  assert.equal(a.laps.filter(lap => lap.complete).length, 2);
  const preview = await invoke('preview_merge_sessions', {sessionIds:[a.id,b.id]});
  const merged = await invoke('merge_sessions', {sessionIds:[a.id,b.id],previewVersion:preview.previewVersion,acknowledgeWarnings:true});
  assert.equal(merged.laps.length, 8);
  assert.equal((await invoke('load_library_session',{sessionId:merged.id})).laps.length, 8);
  await invoke('unmerge_session',{sessionId:merged.id});
  await invoke('load_library_session',{sessionId:a.id});
  await page.reload();
  await expect(page.locator('.uplot').first()).toBeVisible(); await saved();
  assert.match(await page.locator('.import-button kbd').innerText(), /Ctrl O/);
  await expect(page.locator('.plot-label').filter({hasText:'mph'})).toBeVisible();
  assert.equal(await page.locator('.session-button').count(), 2);
  await page.getByRole('button',{name:'Compare lap 3',exact:true}).click();
  await expect(page.locator('.uplot').last()).toBeVisible(); await saved();
  const analysis = await invoke('analyze_session',{sessionId:a.id,primaryId:'lap-1',comparisonId:'lap-2',axis:'distance',channelIds:['gps-speed','channel-0'],formulas:[]});
  assert.equal(analysis.alignment.method, 'spatial');
  assert(analysis.primary.track.length >= 190 && analysis.delta.values.length > 0);
  assert(Math.abs(analysis.delta.values.at(-1)) < .002);
  const formulas = [{id:'runtime-double-rpm',name:'Runtime doubled RPM',expression:'[channel-0] * 2'}];
  await invoke('validate_formulas',{sessionId:a.id,formulas});
  const math = await invoke('analyze_session',{sessionId:a.id,primaryId:'lap-1',comparisonId:null,axis:'time',channelIds:['runtime-double-rpm'],formulas});
  assert(math.primary.series[0].values.length > 0 && math.primary.series[0].values.every(value => value === 10000));
  await page.getByRole('button',{name:'Advanced',exact:true}).click();
  await page.getByRole('tab',{name:'G-G Traction Circle',exact:true}).click();
  await expect(page.locator('.analysis-surface canvas')).toBeVisible();
  await saved();
  let entry = (await snapshot()).entries.find(entry => entry.id === a.id);
  const info = await invoke('authorize_local_video',{path:videoPath});
  assert.equal(info.status, 'ready');
  const video = {version:1,sessionId:a.id,contentVersion:entry.contentVersion,source:{type:'local',path:info.path,size:info.size,modifiedMs:info.modifiedMs},segments:[],selectedSegmentId:null,preferences:{panelHeight:400,playbackRate:1,pausedVideoTime:0}};
  await invoke('save_workspace',{sessionId:a.id,expectedContentVersion:entry.contentVersion,workspace:{...entry.workspace,primary:'lap-1',comparison:null,view:'video',video}});
  await page.reload();
  const player = page.locator('video');
  await expect(player).toBeVisible();
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeEnabled();
  const source = await player.evaluate(element => ({src:element.currentSrc,duration:element.duration,width:element.videoWidth}));
  assert.match(source.src, /^http:\/\/asset\.localhost\//);
  assert(source.duration >= 2.9 && source.width === 128, 'WebView2 decoded the authorized local H.264 asset.');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect.poll(() => player.evaluate(element => element.currentTime)).toBeGreaterThan(.1);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.getByLabel('Playback speed',{exact:true}).selectOption('0.5');
  await expect.poll(() => player.evaluate(element => element.playbackRate)).toBe(.5);
  // Real timeline dispatch enters the existing adapter/controller seek path.
  const timeline = page.getByRole('slider',{name:'Video timeline',exact:true});
  await timeline.focus(); await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(() => player.evaluate(element => !element.seeking && Math.abs(element.currentTime-.5)<.05)).toBe(true);
  await page.getByLabel('Anchor lap',{exact:true}).selectOption('lap-1');
  await page.getByRole('button',{name:'Sync Here',exact:true}).click();
  await expect.poll(async () => (await snapshot()).entries.find(entry => entry.id === a.id).workspace.video.segments.length).toBe(1);
  await saved();
  const before = (await snapshot()).entries.find(entry => entry.id === a.id).workspace.video;
  assert.equal(before.segments[0].anchorLapId, 'lap-1');
  assert(Math.abs(before.segments[0].anchorVideoTime-.5) < .05);
  // CDP emulates CSS viewport/DPR; it is not a native mixed-monitor test.
  const cdp = await page.context().newCDPSession(page);
  for (const [width,height,deviceScaleFactor] of [[600,500,1.25],[1280,800,2],[1440,920,1]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor,mobile:false});
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
    assert.equal(await page.locator('video').count(),1);
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride'); await cdp.detach();
  await saved();
  await close(); await launch();
  await expect(page.locator('video')).toBeVisible();
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeEnabled(); await saved();
  entry = (await snapshot()).entries.find(entry => entry.id === a.id);
  assert.deepEqual(entry.workspace.video.segments, before.segments, 'Manual sync survives a full native application restart.');
  assert.equal(entry.workspace.video.source.path, info.path);
  assert.equal(entry.workspace.video.preferences.playbackRate,.5);
  assert.equal(await page.locator('video').evaluate(element => element.paused),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: release WebView2 startup/restart, real long Unicode XRK import/merge/unmerge, explorer/MPH/graphs/GPS/delta/math/G-G, authorized long Unicode local H.264 playback/rate/seek/manual sync persistence; emulated viewport/DPR only. Native dialogs/drop, physical Windows 10/11 and mixed-monitor DPI remain untested.');
} catch (error) {
  console.error('Native runtime failure UI:', await page?.locator('body').innerText().catch(() => 'Unavailable'));
  throw error;
} finally {
  try {await close();} finally {
  // Only these initially absent application profiles can have been created by this run.
  for (const profile of profiles) rmSync(profile,{recursive:true,force:true,maxRetries:30,retryDelay:200});
  rmSync(root,{recursive:true,force:true,maxRetries:30,retryDelay:200});
  }
}
