import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const config=JSON.parse(read('src-tauri/tauri.conf.json'));
test('native and browser metadata identify Ten Tenths Telemetry without changing installation identity',()=>{
 assert.equal(config.productName,'Ten Tenths Telemetry');
 assert.equal(config.app.windows[0].title,'Ten Tenths Telemetry');
 assert.equal(config.identifier,'com.dalal35.apextelemetry');
 assert.equal(config.version,JSON.parse(read('package.json')).version);
 assert.match(read('index.html'),/<title>Ten Tenths Telemetry<\/title>/);
 assert.match(read('index.html'),/rel="icon"[^>]+href="\/brand\/favicon.svg"/);
 assert.match(read('src-tauri/Cargo.toml'),/name = "apex-telemetry"/);
});
test('native icon references exist and Windows packaging retains its existing contract',()=>{
 for(const icon of config.bundle.icon)assert(existsSync(new URL(`../src-tauri/${icon}`,import.meta.url)),icon);
 const windows=JSON.parse(read('src-tauri/tauri.windows.conf.json'));
 assert.deepEqual(windows.bundle.targets,['nsis']);
 assert.equal(windows.bundle.windows.nsis.installMode,'currentUser');
 assert.equal(windows.bundle.windows.nsis.installerIcon,'icons/icon.ico');
 assert.equal(windows.bundle.windows.nsis.uninstallerIcon,'icons/icon.ico');
 assert.equal(windows.bundle.windows.webviewInstallMode.type,'downloadBootstrapper');
});
test('existing native library and frontend preference identities are retained',()=>{
 assert.match(read('src-tauri/src/lib.rs'),/\.app_data_dir\(\)/);
 assert.match(read('src-tauri/src/library.rs'),/directory.join\("library.json"\)/);
 assert.match(read('src/App.tsx'),/localStorage.getItem\('apex-theme'\)/);
 assert.match(read('src/App.tsx'),/localStorage.setItem\('apex-theme',theme\)/);
 assert.match(read('src/sessionExplorer.ts'),/const preferenceKey = 'apex-telemetry:session-explorer'/);
});
test('all dark and light theme tokens and typography stay unchanged',()=>{
 const css=read('src/styles.css');
 const expected=[[':root',"font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif",'--bg:#141618;--panel:#191c1e;--raised:#222629;--border:#303537;--ink:#e8e9eb;--muted:#929b9f;--grid:#2b3033;--cyan:#33cbd1;--amber:#efb35b;--soft:#1c292b'],['[data-theme=light]',null,'--bg:#f6f6f3;--panel:#efefec;--raised:#e3e6e3;--border:#d5d9d7;--ink:#20292c;--muted:#667477;--grid:#dce1dd;--cyan:#008c96;--amber:#b77821;--soft:#e2efee']];
 for(const [selector,font,tokens] of expected){const declaration=css.slice(css.indexOf(selector+'{')).split('}')[0];assert(declaration.includes(tokens));if(font)assert(declaration.includes(font));}
});
test('desktop icon resources contain the required pixel sizes and clean vectors',()=>{
 for(const [name,size] of [['16x16.png',16],['32x32.png',32],['64x64.png',64],['128x128.png',128],['128x128@2x.png',256],['icon.png',512],['1024x1024.png',1024]]){
  const bytes=readFileSync(new URL(`../src-tauri/icons/${name}`,import.meta.url));
  assert.equal(bytes.subarray(1,4).toString(),'PNG');
  assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
 }
 const ico=readFileSync(new URL('../src-tauri/icons/icon.ico',import.meta.url));assert.equal(ico.readUInt16LE(2),1);
 const sizes=Array.from({length:ico.readUInt16LE(4)},(_,i)=>ico[6+i*16]||256);assert(sizes.includes(16)&&sizes.includes(32)&&sizes.includes(256));
 const icns=readFileSync(new URL('../src-tauri/icons/icon.icns',import.meta.url));assert.equal(icns.subarray(0,4).toString(),'icns');assert.equal(icns.readUInt32BE(4),icns.length);
 for(const name of ['primary','compact','light','dark']){const svg=read(`public/brand/ttt-${name}.svg`);assert.match(svg,/<path/);assert.doesNotMatch(svg,/<image|<text|data:image/);}
});
