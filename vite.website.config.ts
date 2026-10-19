import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const fromRoot=(path:string)=>fileURLToPath(new URL(path,import.meta.url));
export default defineConfig({
 root:fromRoot('./website'),base:'./',publicDir:false,
 plugins:[{
  name:'browser-demo-adapters',enforce:'pre',
  resolveId(source,importer){
   if(importer?.includes('/src/')){
    if(source==='./bridge'||source==='../bridge')return fromRoot('./website/demo/bridge.ts');
    if(source==='./video/VideoWorkspace')return fromRoot('./website/demo/VideoWorkspace.tsx');
   }
   return null;
  },
  transform(code,id){
   // The desktop serves this public asset from /. Bundle it for project-path hosting.
   if(id.endsWith('/src/branding.css'))return code.replace("'/brand/ttt-compact.svg'","'../public/brand/ttt-compact.svg'");
   return null;
  }
 },react()],
 build:{outDir:fromRoot('./dist-website'),emptyOutDir:true,rollupOptions:{input:{demo:fromRoot('./website/demo/index.html')}}},
 server:{host:'127.0.0.1',port:4173,fs:{allow:[fromRoot('.')]}}
});
