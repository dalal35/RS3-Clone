/** Browser controls drive the real app's shared telemetry cursor and section selection. */
import {useId} from 'react';
import type {ComponentProps} from 'react';
import NativePlots from '../../src/Plots';

export default function Plots(props:ComponentProps<typeof NativePlots>){
 const id=useId(),{analysis,axis,cursor,onCursor,onSeek,initialZoom}=props;
 const extent=axis==='distance'?(analysis.primary.length??0):analysis.primary.duration;
 const min=Math.max(0,initialZoom?.min??0),max=Math.min(extent,initialZoom?.max??extent);
 const position=Math.min(max,Math.max(min,cursor??min));
 const seek=(value:number)=>{onCursor(value);onSeek?.(value);};
 const section=analysis.segments.find(s=>position>=s.start&&position<s.end)??analysis.segments.at(-1);
 return <>
  <div className="demo-cursor-control">
   <div className="demo-cursor-heading"><label htmlFor={id}>Explore the lap</label><output htmlFor={id}>{position.toFixed(axis==='distance'?0:2)} <span>{axis==='distance'?'m':'s'}</span></output></div>
   <input id={id} type="range" aria-label="Synchronized telemetry cursor" aria-valuetext={`${position.toFixed(axis==='distance'?0:2)} ${axis==='distance'?'meters':'seconds'} into lap${section?`, ${section.label}`:''}`} min={min} max={max} step={axis==='distance'?5:.1} value={position} onChange={e=>seek(Number(e.target.value))}/>
   <div className="demo-cursor-caption"><span>Drag or use ← → to sync graphs + GPS</span><span>{section?.label??'Full lap'}</span></div>
  </div>
  <NativePlots {...props}/>
 </>;
}
