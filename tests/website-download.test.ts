import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const script=readFileSync(new URL('../website/main.js',import.meta.url),'utf8');
async function render(platform:string,userAgent:string,options:{hint?:string;offline?:boolean}={}){
 const nodes:Record<string,{href:string;textContent:string}>={
  '#hero-download':{href:'#download',textContent:''},'#hero-download-label':{href:'',textContent:'Download'},
  '.header-download':{href:'#download',textContent:''},'#header-download-label':{href:'',textContent:'Download'},
  '#hero-version':{href:'',textContent:''},'#mac-version':{href:'',textContent:''},
  '#mac-download':{href:'https://example.com/fallback.dmg',textContent:''},
  '#windows-download':{href:'https://example.com/windows-beta.exe',textContent:''},
 };
 runInNewContext(script,{
  navigator:{platform,userAgent,maxTouchPoints:/iPad/.test(userAgent)?5:0,userAgentData:options.hint?{platform:options.hint}:undefined},
  document:{querySelector:(selector:string)=>nodes[selector]??null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener:()=>{}},
  window:{addEventListener:()=>{}},setTimeout,clearTimeout,AbortController,
  fetch:async()=>{if(options.offline)throw new Error('Offline');return {ok:true,json:async()=>({tag_name:'v9.0.0',assets:[{name:'app_aarch64.dmg',browser_download_url:'https://example.com/latest.dmg'}]})};},
 });
 await new Promise(resolve=>setImmediate(resolve));return nodes;
}
describe('homepage download navigation',()=>{
 it('has a plain Download link and no homepage demo',()=>{
  const html=readFileSync(new URL('../website/index.html',import.meta.url),'utf8');
  expect(html).toContain('id="hero-download-label">Download</span>');
  expect(html).toContain('id="header-download-label">Download</span>');
  expect(html).not.toMatch(/id="(?:live-demo|demo-open|demo-stage)"|Choose your download/);
 });
 it.each([['Win32','Windows NT'],['MacIntel','Macintosh'],['MacIntel','iPad'],['Linux','Linux'],['iPhone','iPhone'],['','']])('keeps top links pointing to the download section on %s',async(platform,userAgent)=>{
  for(const offline of [false,true]){
   const nodes=await render(platform,userAgent,{offline});
   expect(nodes['#hero-download'].href).toBe('#download');
   expect(nodes['.header-download'].href).toBe('#download');
   expect(nodes['#hero-download-label'].textContent).toBe('Download');
   expect(nodes['#header-download-label'].textContent).toBe('Download');
  }
 });
 it('still updates the Mac installer in the download section',async()=>{
  const nodes=await render('Win32','Windows NT');
  expect(nodes['#mac-download'].href).toBe('https://example.com/latest.dmg');
  expect(nodes['#windows-download'].href).toBe('https://example.com/windows-beta.exe');
 });
});
