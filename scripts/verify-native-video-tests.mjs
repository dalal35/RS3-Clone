// Fail rather than silently accepting a cfg-gated, empty Windows video suite.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const listed=execFileSync('cargo',['test','--locked','--manifest-path','src-tauri/Cargo.toml','--test','video_analysis','--','--list'],{encoding:'utf8',stdio:['ignore','pipe','inherit']});
const names=listed.split(/\r?\n/).filter(line=>line.endsWith(': test'));
assert(names.length>=7,`Native video suite has only ${names.length} tests; expected real decoding coverage`);
if(process.platform==='win32')assert(names.some(name=>name.startsWith('native_windows_decoder_contract_runs:')),'Windows decoder contract test is missing');
console.log(`Verified ${names.length} native-video tests are enabled on ${process.platform}.`);
