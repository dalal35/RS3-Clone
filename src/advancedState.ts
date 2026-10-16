export type Tool='traction'|'shifts'|'bog'|'scatter'|'histogram'|'formulas';
export interface Formula {id:string;name:string;expression:string}
export interface AdvancedConfig {
 axis:'time'|'distance';tool:Tool;xChannel:string|null;yChannel:string|null;histChannel:string|null;colorChannel:string|null;
 bins:number;binWidth:number|null;weighting:'time'|'samples';percentage:boolean;
 range:[number,number]|null;cornerId:string|null;valueFilter:{channel:string;min:number|null;max:number|null}|null;
 xSign:number;ySign:number;xOffset:number;yOffset:number;bogThreshold:number;minDuration:number;sensitivity:number;
 toolViews?:Partial<Record<Tool,ToolView>>;excludedIds:string[];grid:number;xScale:'linear'|'log';yScale:'linear'|'log';xRange:[number,number]|null;yRange:[number,number]|null;panelHeight:number;
}
export type ToolView=Pick<AdvancedConfig,'xChannel'|'yChannel'|'histChannel'|'colorChannel'|'xScale'|'yScale'|'xRange'|'yRange'>;
export interface Preset {id:string;name:string;builtIn?:boolean;config:AdvancedConfig}
export interface AdvancedState {version:1;config:AdvancedConfig;formulas:Formula[];presets:Preset[];defaultPreset:string;lastPreset:string;readOnly?:boolean;raw?:unknown}
const tools:Tool[]=['traction','shifts','bog','scatter','histogram','formulas'];
const base=():AdvancedConfig=>({axis:'distance',tool:'traction',xChannel:null,yChannel:null,histChannel:null,colorChannel:null,bins:30,binWidth:null,weighting:'time',percentage:true,range:null,cornerId:null,valueFilter:null,xSign:1,ySign:1,xOffset:0,yOffset:0,bogThreshold:8200,minDuration:.2,sensitivity:1,excludedIds:[],grid:.5,xScale:'linear',yScale:'linear',xRange:null,yRange:null,panelHeight:400});
export function defaultAdvanced():AdvancedState {
 const presets:Preset[]=[['overview','Overview','traction'],['handling','Traction and Handling','traction'],['shifting','Shifting','shifts'],['engine','RPM and Engine Performance','bog'],['corner','Corner Analysis','histogram']].map(([id,name,tool])=>({id,name,builtIn:true,config:{...base(),tool:tool as Tool}}));
 return {version:1,config:base(),formulas:[],presets,defaultPreset:'overview',lastPreset:'overview'};
}
const finite=(n:unknown,fallback:number,min:number,max:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max?n:fallback;
const range=(r:unknown):[number,number]|null=>Array.isArray(r)&&r.length===2&&r.every(v=>typeof v==='number'&&Number.isFinite(v))&&r[1]>r[0]?[r[0],r[1]]:null;
function config(raw:unknown):AdvancedConfig {
 const d=base(),r=(raw&&typeof raw==='object'?raw:{}) as Partial<AdvancedConfig>;
 const toolViews:Partial<Record<Tool,ToolView>>={};for(const t of tools){const v=r.toolViews?.[t];if(v)toolViews[t]=toolView(v);}
 return {...d,...r,toolViews,axis:r.axis==='time'?'time':'distance',tool:tools.includes(r.tool as Tool)?r.tool!:d.tool,
 xChannel:typeof r.xChannel==='string'?r.xChannel:null,yChannel:typeof r.yChannel==='string'?r.yChannel:null,histChannel:typeof r.histChannel==='string'?r.histChannel:null,colorChannel:typeof r.colorChannel==='string'?r.colorChannel:null,
 bins:Math.round(finite(r.bins,30,2,200)),binWidth:r.binWidth==null?null:finite(r.binWidth,1,.000001,1e9),bogThreshold:finite(r.bogThreshold,8200,1,100000),minDuration:finite(r.minDuration,.2,.01,60),sensitivity:finite(r.sensitivity,1,.25,4),
 xSign:r.xSign===-1?-1:1,ySign:r.ySign===-1?-1:1,xOffset:finite(r.xOffset,0,-1000,1000),yOffset:finite(r.yOffset,0,-1000,1000),grid:finite(r.grid,.5,.05,10),panelHeight:finite(r.panelHeight,400,240,900),
 weighting:r.weighting==='samples'?'samples':'time',percentage:r.percentage!==false,range:range(r.range),xRange:range(r.xRange),yRange:range(r.yRange),xScale:r.xScale==='log'?'log':'linear',yScale:r.yScale==='log'?'log':'linear',
 cornerId:typeof r.cornerId==='string'?r.cornerId:null,excludedIds:Array.isArray(r.excludedIds)?r.excludedIds.filter(x=>typeof x==='string').slice(0,200):[],
 valueFilter:r.valueFilter&&typeof r.valueFilter.channel==='string'?{channel:r.valueFilter.channel,min:typeof r.valueFilter.min==='number'&&Number.isFinite(r.valueFilter.min)?r.valueFilter.min:null,max:typeof r.valueFilter.max==='number'&&Number.isFinite(r.valueFilter.max)?r.valueFilter.max:null}:null};
}
export function restoreAdvanced(raw:unknown):AdvancedState {
 const d=defaultAdvanced();if(!raw||typeof raw!=='object')return d;
 const r=raw as Partial<AdvancedState>;
 if(r.version!==1)return {...d,readOnly:true,raw};
 const custom=Array.isArray(r.presets)?r.presets.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&!d.presets.some(b=>b.id===p.id)).slice(0,20).map(p=>({id:p.id,name:p.name.slice(0,80),config:config(p.config)})):[];
 const presets=[...d.presets,...custom];
 return {version:1,config:config(r.config),formulas:Array.isArray(r.formulas)?r.formulas.filter(f=>f&&typeof f.id==='string'&&typeof f.name==='string'&&typeof f.expression==='string').slice(0,20):[],presets,defaultPreset:presets.some(p=>p.id===r.defaultPreset)?r.defaultPreset!:'overview',lastPreset:presets.some(p=>p.id===r.lastPreset)?r.lastPreset!:'overview'};
}
export function boundedAdvanced(s:AdvancedState):AdvancedState {
 if(s.readOnly)throw new Error('This advanced workspace uses a newer schema. Update Ten Tenths Telemetry to edit it.');
 if(s.formulas.length>20||s.presets.length>25||s.config.excludedIds.length>200||new TextEncoder().encode(JSON.stringify(s)).length>56000)throw new Error('Advanced preferences exceed the local storage limit. Remove a preset, formula or exclusion.');
 return s;
}
export function savePreset(s:AdvancedState,id:string,name:string):AdvancedState {
 if(!name.trim()||name.length>80)throw new Error('Preset name must contain 1–80 characters.');
 if(s.presets.some(p=>p.id===id&&p.builtIn))throw new Error('Duplicate a built-in preset to customize it.');
 return boundedAdvanced({...s,lastPreset:id,presets:[...s.presets.filter(p=>p.id!==id),{id,name:name.trim(),config:structuredClone(s.config)}]});
}
export function applyPreset(s:AdvancedState,id:string):AdvancedState {const p=s.presets.find(p=>p.id===id);return p?boundedAdvanced({...s,lastPreset:id,config:structuredClone(p.config)}):s;}
export function removePreset(s:AdvancedState,id:string):AdvancedState {return boundedAdvanced({...s,presets:s.presets.filter(p=>p.id!==id||p.builtIn),defaultPreset:s.defaultPreset===id?'overview':s.defaultPreset,lastPreset:s.lastPreset===id?'overview':s.lastPreset});}
function toolView(c:Partial<AdvancedConfig>):ToolView {return {xChannel:typeof c.xChannel==='string'?c.xChannel:null,yChannel:typeof c.yChannel==='string'?c.yChannel:null,histChannel:typeof c.histChannel==='string'?c.histChannel:null,colorChannel:typeof c.colorChannel==='string'?c.colorChannel:null,xScale:c.xScale==='log'?'log':'linear',yScale:c.yScale==='log'?'log':'linear',xRange:range(c.xRange),yRange:range(c.yRange)};}
export function changeTool(s:AdvancedState,tool:Tool):AdvancedState {
 const c=s.config;if(c.tool===tool)return s;
 const toolViews={...c.toolViews,[c.tool]:toolView(c)};
 return boundedAdvanced({...s,config:{...c,...(toolViews[tool]??toolView(base())),tool,toolViews}});
}
