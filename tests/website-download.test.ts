import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const script=readFileSync(new URL('../website/main.js',import.meta.url),'utf8');
async function render(platform:string,userAgent:string,options:{hint?:string;offline?:boolean}={}){
 const nodes:Record<string,{href:string;textContent:string}>={
  '#hero-download':{href:'#download',textContent:''},'#hero-download-label':{href:'',textContent:'Choose your download'},
  '.header-download':{href:'#download',textContent:''},'#header-download-label':{href:'',textContent:'Get the app'},
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
describe('website platform download',()=>{
 it('routes Windows visitors to the Windows beta even when latest release contains a Mac installer',async()=>{
  const nodes=await render('Win32','Windows NT 10.0');
  expect(nodes['#hero-download-label'].textContent).toContain('Windows');
  expect(nodes['#hero-download'].href).toBe(nodes['#windows-download'].href);
  expect(nodes['.header-download'].href).toBe(nodes['#windows-download'].href);
  expect(nodes['#hero-version'].textContent).toContain('Windows');
 });
 it('uses the latest Mac installer for macOS visitors',async()=>{
  const nodes=await render('MacIntel','Macintosh');expect(nodes['#hero-download-label'].textContent).toContain('macOS');
  expect(nodes['#hero-download'].href).toBe('https://example.com/latest.dmg');
 });
 it('keeps Windows selection when the release lookup fails',async()=>{
  const nodes=await render('Win32','Windows NT',{offline:true});expect(nodes['#hero-download'].href).toBe(nodes['#windows-download'].href);
 });
 it('uses client-hint platform when available',async()=>{
  const nodes=await render('','',{hint:'Windows'});expect(nodes['#hero-download'].href).toBe(nodes['#windows-download'].href);
 });
 it.each([['Linux x86_64','Linux'],['MacIntel','iPad'],['iPhone','iPhone'],['Linux armv8','Android'],['','']])('shows download choices for unsupported/mobile platform %s',async(platform,userAgent)=>{
  const nodes=await render(platform,userAgent);expect(nodes['#hero-download'].href).toBe('#download');
  expect(nodes['#hero-download-label'].textContent).not.toMatch(/for macOS|for Windows/);
 });
});
