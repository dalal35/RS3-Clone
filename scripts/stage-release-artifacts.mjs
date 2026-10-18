import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,join,resolve} from 'node:path';
import {verifyVersion} from './verify-release-version.mjs';
import {sha256,verifyWindowsBinary,releaseAssetNames} from './verify-release-artifacts.mjs';

const platform=process.argv[2];
assert(['macos','windows'].includes(platform),'Specify macos or windows');
assert.equal(process.platform,platform==='macos'?'darwin':'win32','Stage artifacts on the native build host');
const version=verifyVersion(),target=platform==='macos'?'aarch64-apple-darwin':'x86_64-pc-windows-msvc';
const release=resolve('src-tauri/target',target,'release');
const output=resolve(process.argv[3]??'.tools/windows-release/artifacts',platform);
mkdirSync(output,{recursive:true});
assert.equal(readdirSync(output).length,0,'Use an empty staging directory; do not mix previous artifacts');
const notices=readFileSync('THIRD_PARTY_NOTICES.md');
function find(root,predicate){return readdirSync(root,{withFileTypes:true}).flatMap(e=>{const p=join(root,e.name);return e.isDirectory()?find(p,predicate):predicate(p)?[p]:[];});}
function only(paths,label){assert.equal(paths.length,1,`Expected exactly one ${label}`);return paths[0];}
const names=releaseAssetNames(platform,version);
if(platform==='macos'){
 const app=join(release,'bundle/macos/Ten Tenths Telemetry.app');
 const binary=readFileSync(join(app,'Contents/MacOS/apex-telemetry'));
 assert(binary.readUInt32LE(0)===0xfeedfacf&&binary.readUInt32LE(4)===0x0100000c,'Expected native arm64 Mach-O');
 assert.equal(sha256(readFileSync(only(find(join(app,'Contents/Resources'),p=>basename(p)==='THIRD_PARTY_NOTICES.md'),'bundled notices'))),sha256(notices));
 execFileSync('codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});
 const dmg=only(find(join(release,'bundle/dmg'),p=>p.endsWith(`_${version}_aarch64.dmg`)),'Apple Silicon DMG');
 const bytes=readFileSync(dmg);
 assert(bytes.length>=512&&bytes.toString('ascii',bytes.length-512,bytes.length-508)==='koly','Invalid DMG trailer');
 copyFileSync(dmg,join(output,names[0]));
 execFileSync('tar',['-czf',join(output,names[1]),'-C',join(release,'bundle/macos'),'Ten Tenths Telemetry.app'],{stdio:'inherit'});
}else{
 const binaryPath=join(release,'apex-telemetry.exe'),binary=readFileSync(binaryPath);
 verifyWindowsBinary(binary);
 const metadata=JSON.parse(execFileSync('powershell',['-NoProfile','-NonInteractive','-Command','(Get-Item -LiteralPath $env:APEX_BINARY_PATH).VersionInfo | Select-Object ProductName,FileVersion | ConvertTo-Json -Compress'],{encoding:'utf8',env:{...process.env,APEX_BINARY_PATH:binaryPath}}));
 assert.equal(metadata.ProductName,'Ten Tenths Telemetry','Wrong Windows product identity');
 assert(metadata.FileVersion===version||metadata.FileVersion.startsWith(`${version}.`),'Wrong Windows binary version');
 const installer=only(find(join(release,'bundle/nsis'),p=>p.endsWith(`_${version}_x64-setup.exe`)),'x64 NSIS installer');
 assert.equal(readFileSync(installer).toString('ascii',0,2),'MZ','Invalid NSIS executable');
 const inspection=mkdtempSync(join(tmpdir(),'apex-nsis-inspect-'));
 try{
  const installed7zip=join(process.env.ProgramFiles??'C:\\Program Files','7-Zip/7z.exe');
  execFileSync(existsSync(installed7zip)?installed7zip:'7z',['x','-y',`-o${inspection}`,installer],{stdio:'inherit'});
  const embedded=only(find(inspection,p=>basename(p).toLowerCase()==='apex-telemetry.exe'),'embedded application executable');
  assert.equal(sha256(readFileSync(embedded)),sha256(binary),'Installer contains a different executable');
  const bundledNotice=only(find(inspection,p=>basename(p)==='THIRD_PARTY_NOTICES.md'),'installer notices');
  assert.equal(sha256(readFileSync(bundledNotice)),sha256(notices),'Installer notice differs');
 }finally{rmSync(inspection,{recursive:true,force:true});}
 copyFileSync(installer,join(output,names[0]));
}
const revision=process.env.GITHUB_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const manifest={schema:1,platform,target,version,revision,runId:process.env.GITHUB_RUN_ID??'local',assets:names.map(name=>{const path=join(output,name);return {name,size:statSync(path).size,sha256:sha256(readFileSync(path))};})};
writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));
