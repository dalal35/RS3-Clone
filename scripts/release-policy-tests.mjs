import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const workflow=readFileSync(new URL('../.github/workflows/release.yml',import.meta.url),'utf8');
test('publication requires both native builds and only a tag push',()=>{
 assert.match(workflow,/needs: \[macos, windows\]/);
 assert.match(workflow,/github\.event_name == 'push'/);
 assert.match(workflow,/startsWith\(github\.ref, 'refs\/tags\/'\)/);
 assert.doesNotMatch(workflow,/releaseDraft: false/);
});
test('build jobs cannot publish and dispatch is available for validation',()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/permissions:\s*\n  contents: read/);
 assert.equal((workflow.match(/contents: write/g)||[]).length,1);
 assert.match(workflow,/runs-on: windows-latest/);
});
test('every command in multi-command steps must fail the step on error',()=>{
 assert(/defaults:\s*\n  run:\s*\n    shell: bash/.test(workflow),'Use fail-fast bash on both hosts; default PowerShell may mask an earlier native-command failure');
});
test('authorized feature-branch pushes build without satisfying publication guard',()=>{
 assert.match(workflow,/branches:\s*\n      - 'fix\/dedicated-advanced-workspace'/);
 const publish=workflow.slice(workflow.indexOf('  publish:'));
 assert.match(publish,/if: github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/'\)/);
 for(const ref of ['refs/heads/fix/dedicated-advanced-workspace','refs/heads/main'])assert.equal(ref.startsWith('refs/tags/'),false);
});
