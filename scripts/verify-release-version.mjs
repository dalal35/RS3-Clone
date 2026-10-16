import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function verifyVersion(root='.',env=process.env){
 const json=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
 const version=json('package.json').version;
 assert.match(version,/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/,'Invalid app version');
 const lock=json('package-lock.json');
 assert.equal(lock.version,version,'package-lock.json version differs (lockfile)');
 assert.equal(lock.packages[''].version,version,'lockfile root version differs');
 assert.equal(json('src-tauri/tauri.conf.json').version,version,'Tauri version differs');
 const cargo=readFileSync(resolve(root,'src-tauri/Cargo.toml'),'utf8').split('[package]')[1]?.split(/\n\[/)[0];
 assert.equal(cargo?.match(/^version\s*=\s*"([^"]+)"/m)?.[1],version,'Cargo version differs');
 if(env.GITHUB_EVENT_NAME==='push'&&env.GITHUB_REF?.startsWith('refs/tags/')){
  assert.equal(env.GITHUB_REF,`refs/tags/v${version}`,'Tag must match app version');
  assert.equal(env.GITHUB_REF_NAME,`v${version}`,'Tag must match app version');
 }
 return version;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`Release version verified: ${verifyVersion()}`);
