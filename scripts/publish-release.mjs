// Invoked only by the tag-gated publisher after both native build jobs succeed.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {statSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyArtifacts,writeChecksums} from './verify-release-artifacts.mjs';
import {verifyVersion} from './verify-release-version.mjs';

export function publishRelease(root,version,env=process.env,run=args=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','inherit']})){
 assert(env.GITHUB_EVENT_NAME==='push'&&env.GITHUB_REF===`refs/tags/v${version}`&&env.GITHUB_REF_NAME===`v${version}`,'Publication requires the matching tag push');
 assert.match(env.GITHUB_REPOSITORY??'',/^[\w.-]+\/[\w.-]+$/,'Missing repository');
 assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/,'Missing workflow revision');
 assert(env.GITHUB_RUN_ID,'Missing workflow run');
 const files=verifyArtifacts(root,version,{revision:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID});
 const checksum=writeChecksums(root,files),notes=join(root,'release-notes.md');
 writeFileSync(notes,`Download the x64 setup.exe for Windows 10/11, or the aarch64.dmg for Apple Silicon macOS 13+.\n\nWindows releases are unsigned; SmartScreen may warn. WebView2 setup requires internet if the runtime is absent. macOS uses an ad-hoc signature and is not notarized; use System Settings > Privacy & Security > Open Anyway if needed and you trust the download. See README for instructions and native GUI/codec validation limitations.\n\nBuild revision: ${env.GITHUB_SHA}\nWorkflow run: ${env.GITHUB_RUN_ID}\n`);
 const tag=env.GITHUB_REF_NAME,repo=['--repo',env.GITHUB_REPOSITORY];
 // Existing releases (including stale drafts) fail safely; never clobber assets.
 run(['release','create',tag,'--draft','--prerelease','--verify-tag','--generate-notes','--title',`Apex Telemetry v${version} Beta`,'--notes-file',notes,...repo]);
 const upload=[...files.map(f=>f.path),checksum];
 run(['release','upload',tag,...upload,...repo]);
 const remote=JSON.parse(run(['release','view',tag,'--json','isDraft,assets',...repo]));
 assert.equal(remote.isDraft,true,'Release must still be a draft before complete-set verification');
 const expected=[...files.map(f=>({name:f.name,size:f.size})),{name:'SHA256SUMS',size:statSync(checksum).size}].sort((a,b)=>a.name.localeCompare(b.name));
 const actual=remote.assets.map(a=>({name:a.name,size:a.size})).sort((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(actual,expected,'Remote upload is incomplete; retaining draft');
 run(['release','edit',tag,'--draft=false','--prerelease','--latest=false',...repo]);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))publishRelease(process.argv[2],verifyVersion());
