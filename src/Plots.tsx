import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { Analysis, Axis, Series } from './types';
import { interpolate, mergeSeries } from './telemetry';
type Row={id:string;name:string;unit:string;primary:Series;comparison?:Series};
export default function Plots({analysis,axis,onCursor,resetVersion}:{analysis:Analysis;axis:Axis;onCursor:(x:number|null)=>void;resetVersion:number}){
  const host=useRef<HTMLDivElement>(null),plots=useRef<uPlot[]>([]),callback=useRef(onCursor);callback.current=onCursor;
  const readouts=useRef(new Map<string,HTMLElement>());
  const rows:Row[]=analysis.primary.series.map(s=>({id:s.channelId,name:s.name,unit:s.unit,primary:s,comparison:analysis.comparison?.series.find(c=>c.channelId===s.channelId)}));
  if(analysis.delta)rows.push({id:'__delta',name:'Estimated time delta',unit:'s',primary:{channelId:'__delta',name:'Estimated time delta',unit:'s',...analysis.delta}});
  useEffect(()=>{
    if(!host.current)return;
    const nodes=host.current.querySelectorAll<HTMLDivElement>('[data-plot]');
    const theme=getComputedStyle(host.current);const ink=theme.getPropertyValue('--muted').trim(),grid=theme.getPropertyValue('--grid').trim();
    const cyan=theme.getPropertyValue('--cyan').trim(),amber=theme.getPropertyValue('--amber').trim();
    plots.current=rows.map((row,i)=>{
      const pairs=[row.primary,...(row.comparison?[row.comparison]:[])];
      const plot=new uPlot({width:Math.max(nodes[i].clientWidth,200),height:178,padding:[14,18,0,0],legend:{show:false},cursor:{sync:{key:'telemetry'},drag:{x:true,y:false,setScale:true},points:{size:5}},select:{show:true,left:0,top:0,width:0,height:0},scales:{x:{time:false}},axes:[{stroke:ink,grid:{show:false},ticks:{stroke:grid},size:32,values:(_u,ticks)=>ticks.map(n=>`${Math.round(n*10)/10}`)},{stroke:ink,grid:{stroke:grid,width:1},ticks:{stroke:grid},size:54,gap:10}],series:[{},...pairs.map((s,index)=>({label:s.name,stroke:index?amber:cyan,width:1.5,spanGaps:false}))],hooks:{setCursor:[u=>{
        const x=u.cursor.left==null||u.cursor.left<0?null:u.posToVal(u.cursor.left,'x');
        if(i===0)callback.current(x);
        const readout=readouts.current.get(row.id);
        if(readout)readout.textContent=pairs.map(s=>{const value=x==null?null:interpolate(s.x,s.values,x,s.gaps);return value==null?'—':value.toFixed(row.unit==='rpm'?0:1);}).join(' / ')+' '+row.unit;
      }],setScale:[u=>{if(u.scales.x.min!=null&&u.scales.x.max!=null)plots.current.forEach(other=>{if(other!==u&&(other.scales.x.min!==u.scales.x.min||other.scales.x.max!==u.scales.x.max))other.setScale('x',{min:u.scales.x.min!,max:u.scales.x.max!});});}]}},mergeSeries(pairs) as uPlot.AlignedData,nodes[i]);
      const el=nodes[i];let pan:{start:number;min:number;max:number}|null=null;
      const down=(e:PointerEvent)=>{if(e.shiftKey||e.button===1){e.preventDefault();pan={start:e.clientX,min:plot.scales.x.min!,max:plot.scales.x.max!};el.setPointerCapture(e.pointerId);}};
      const move=(e:PointerEvent)=>{if(pan){const dx=(e.clientX-pan.start)/(plot.bbox.width/window.devicePixelRatio)*(pan.max-pan.min);plot.setScale('x',{min:pan.min-dx,max:pan.max-dx});}};
      const up=()=>{pan=null;};
      el.addEventListener('pointerdown',down,true);el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);
      const observer=new ResizeObserver(()=>plot.setSize({width:Math.max(el.clientWidth,200),height:178}));observer.observe(el);
      (plot as uPlot & {dispose:()=>void}).dispose=()=>{observer.disconnect();el.removeEventListener('pointerdown',down,true);el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);plot.destroy();};
      return plot;
    });
    return()=>{plots.current.forEach(p=>(p as uPlot&{dispose:()=>void}).dispose());plots.current=[];};
  },[analysis,axis]);
  useEffect(()=>{plots.current.forEach(p=>p.setScale('x',{min:analysis.primary.series[0]?.x[0]??0,max:Math.max(...analysis.primary.series.map(s=>s.x[s.x.length-1]??0),1)}));},[resetVersion]);
  return <div ref={host} className="plots">{rows.map(row=><section className="plot-row" key={row.id}><div className="plot-label"><span>{row.name}</span><span className="mono readout" ref={el=>{if(el)readouts.current.set(row.id,el);}} >— {row.unit}</span></div><div data-plot /></section>)}<div className="axis-label">{axis==='distance'?'Distance into lap · meters':'Time into lap · seconds'}</div></div>;
}
