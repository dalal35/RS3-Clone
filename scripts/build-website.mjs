import {build} from 'vite';
import {cp, mkdir} from 'node:fs/promises';

// Keep the landing page static; only the on-demand app iframe needs bundling.
await build({configFile: 'vite.website.config.ts'});
await mkdir('dist-website', {recursive: true});
for (const file of ['index.html', 'main.js', 'styles.css', 'assets']) {
  await cp(`website/${file}`, `dist-website/${file}`, {recursive: true});
}
