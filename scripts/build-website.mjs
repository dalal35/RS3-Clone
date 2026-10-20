import {build} from 'vite';
import {cp, mkdir} from 'node:fs/promises';

// Bundle the lightweight landing module separately from the on-demand React demo.
await build({configFile: 'vite.website.config.ts'});
await mkdir('dist-website', {recursive: true});
for (const file of ['assets']) {
  await cp(`website/${file}`, `dist-website/${file}`, {recursive: true});
}
