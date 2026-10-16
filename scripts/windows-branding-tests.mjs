import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {test} from 'node:test';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const config=JSON.parse(read('src-tauri/tauri.windows.conf.json'));
const templatePath='src-tauri/windows/installer.nsi';
const hooksPath='src-tauri/windows/branding-hooks.nsh';

test('Windows rebrand preserves installer mode and selects compatibility template',()=>{
 assert.equal(config.bundle.windows.nsis.installMode,'currentUser');
 assert.equal(config.bundle.windows.nsis.template,'windows/installer.nsi');
 assert.equal(config.bundle.windows.nsis.installerHooks,'windows/branding-hooks.nsh');
 assert.deepEqual(config.bundle.targets,['nsis']);
 assert.deepEqual(config.bundle.icon,['icons/icon.ico']);
 assert.equal(config.bundle.windows.webviewInstallMode.type,'downloadBootstrapper');
});

test('installer template and hooks retain canonical LF bytes on every platform',()=>{
 for(const path of [templatePath,hooksPath])assert.doesNotMatch(read(path),/\r/,`${path} must use LF; check Git checkout attributes`);
});

test('only legacy registry identities differ from the exact Tauri 2.12.2 template',()=>{
 assert(existsSync(new URL(`../${templatePath}`,import.meta.url)),'Compatibility template is required');
 const source=read(templatePath);
 assert(source.includes('!define UNINSTKEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Apex Telemetry"'));
 assert(source.includes('!define MANUPRODUCTKEY "${MANUKEY}\\Apex Telemetry"'));
 const restored=source.replace('Uninstall\\Apex Telemetry"','Uninstall\\${PRODUCTNAME}"')
  .replace('!define MANUPRODUCTKEY "${MANUKEY}\\Apex Telemetry"','!define MANUPRODUCTKEY "${MANUKEY}\\${PRODUCTNAME}"');
 assert.equal(createHash('sha256').update(restored).digest('hex'),'166f9677d42e81c7f712a1bf80d9d8c089c21d2967d8398474768b5eac14b494');
 const lock=JSON.parse(read('package-lock.json'));
 assert.equal(lock.packages['node_modules/@tauri-apps/cli'].version,'2.12.2','Rebase custom template when upgrading Tauri CLI');
});

test('installer metadata and shortcuts consume new product name while upgrades consume stable keys',()=>{
 assert(existsSync(new URL(`../${templatePath}`,import.meta.url)),'Compatibility template is required');
 const source=read(templatePath);
 for(const line of [
  '!define PRODUCTNAME "{{product_name}}"',
  'Name "${PRODUCTNAME}"',
  'VIAddVersionKey "ProductName" "${PRODUCTNAME}"',
  'WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${PRODUCTNAME}"',
  'ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"',
  'ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""',
  'CreateShortcut "$SMPROGRAMS\\${PRODUCTNAME}.lnk" "$INSTDIR\\${MAINBINARYNAME}.exe"',
 ]) assert(source.includes(line),`Required native installer behavior: ${line}`);
});

test('legacy shortcut migration checks executable target and preserves shortcut preferences',()=>{
 assert(existsSync(new URL(`../${hooksPath}`,import.meta.url)),'Legacy shortcut migration is required');
 const source=read(hooksPath);
 assert(source.includes('!insertmacro IsShortcutTarget "${ROOT}\\Apex Telemetry.lnk" "$INSTDIR\\${MAINBINARYNAME}.exe"'));
 assert(source.includes('Rename "${ROOT}\\Apex Telemetry.lnk" "${ROOT}\\${PRODUCTNAME}.lnk"'));
 assert(source.includes('!insertmacro TTT_RENAME_LEGACY_SHORTCUT "$SMPROGRAMS"'));
 assert(source.includes('!insertmacro TTT_RENAME_LEGACY_SHORTCUT "$DESKTOP"'));
 assert(!/CreateShortcut|RmDir|DeleteRegKey|ExecWait/.test(source),'Only existing, owned shortcuts may be migrated');
});
