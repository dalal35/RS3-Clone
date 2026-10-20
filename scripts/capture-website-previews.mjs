// Refresh product images from the actual built browser workspace, never a mock UI.
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {launchBrowser} from './browser.mjs';
const root=resolve('dist-website');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const path=resolve(root,'.'+pathname);if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
let browser;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await page.goto(`http://127.0.0.1:${server.address().port}/demo/index.html`);
 await page.locator('.plot-row').first().waitFor();
 for(const [name,button] of [['telemetry','Telemetry'],['advanced','Advanced'],['video','Video']]){
  await page.getByRole('button',{name:button,exact:true}).click();
  await page.locator(name==='telemetry'?'.plot-row':name==='advanced'?'.advanced-workspace':'.video-workspace').first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
  // Allow the canvas ResizeObserver to settle at its final dimensions.
  await page.waitForTimeout(350);
  const png=await page.screenshot();
  const webp=await page.evaluate(async data=>{const image=new Image();image.src=data;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/webp',.88).split(',')[1];},`data:image/png;base64,${png.toString('base64')}`);
  await writeFile(`website/assets/${name}.webp`,Buffer.from(webp,'base64'));
  if(name==='telemetry'){
   const hero=await page.evaluate(async data=>{const image=new Image();image.src=data;await image.decode();const canvas=document.createElement('canvas');canvas.width=1140;canvas.height=450;canvas.getContext('2d').drawImage(image,300,415,1140,450,0,0,1140,450);return canvas.toDataURL('image/webp',.9).split(',')[1];},`data:image/png;base64,${png.toString('base64')}`);
   await writeFile('website/assets/hero-telemetry.webp',Buffer.from(hero,'base64'));
  }
 }
 console.log('Captured three actual workspace previews with synthetic demo data.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
