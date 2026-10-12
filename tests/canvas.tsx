import React from 'react';
import {createRoot} from 'react-dom/client';
import AnalysisCanvas from '../src/AnalysisCanvas';
import {defaultAdvanced} from '../src/advancedState';
import type {AdvancedResult} from '../src/types';
const stats={count:0,duration:0,min:null,max:null,mean:null,median:null,p05:null,p95:null,absoluteP95:null};
const result:AdvancedResult={tool:'histogram',xUnit:'rpm',yUnit:'samples',notes:[],laps:[{lapId:'lap-7',stats,events:[],excludedCount:0,points:[],histogram:[{low:-10,high:0,value:40},{low:0,high:10,value:0},{low:10,high:100,value:100},{low:100,high:1000,value:20},{low:1000,high:Infinity,value:50}]}]};
const config={...defaultAdvanced().config,tool:'histogram' as const,xScale:'log' as const,yScale:'log' as const,weighting:'samples' as const,percentage:false};
(window as any).cursors=[];
const root=createRoot(document.getElementById('root')!);
(window as any).renderCanvas=(mode='samples')=>{
 const scatter=mode==='scatter';
 const data=scatter?{...result,tool:'scatter',laps:[{...result.laps[0],histogram:[],points:[{x:10,y:10,sourceTime:1,position:20,color:null},{x:0,y:10,sourceTime:2,position:null,color:null},{x:10,y:-1,sourceTime:3,position:null,color:null}]}]}:result;
 root.render(<div style={{width:700,'--muted':'#999','--grid':'#333','--cyan':'#0ff','--amber':'#fa0'} as React.CSSProperties}><AnalysisCanvas result={data} config={{...config,percentage:mode==='percentage',weighting:mode==='time'?'time':'samples'}} cursor={null} onCursor={v=>(window as any).cursors.push(v)}/></div>);
};
(window as any).renderCanvas();
