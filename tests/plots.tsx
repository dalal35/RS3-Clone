import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import uPlot from 'uplot';
import Plots from '../src/Plots';
import Track from '../src/Track';
import Segments from '../src/Segments';
import '../src/styles.css';
import type { Analysis, TrackSegment } from '../src/types';
import analysis from '../.tools/analysis.json';
function Harness() {
  const [reset,setReset]=useState(0),[channelMode,setChannelMode]=useState<'all'|'delta'|'partial'>('all');
  const plotAnalysis=useMemo(()=>{
    if(channelMode==='all')return analysis;
    const channels=(view:Analysis['primary'])=>({...view,series:channelMode==='delta'?[]:view.series.slice(0,1).map(series=>({...series,x:[0,5],values:series.values.slice(0,2),gaps:[]}))});
    const source=analysis as Analysis;
    return {...source,primary:channels(source.primary),comparison:source.comparison?channels(source.comparison):null};
  },[channelMode]);
  const [editing,setEditing]=useState(false),[boundaries,setBoundaries]=useState<number[]|null>(null);
  const [zoom,setZoom]=useState<{min:number;max:number}|null>(null),[compact,setCompact]=useState(false);
  const [focus,setFocus]=useState<TrackSegment|null>(null);
  const select=(segment:TrackSegment)=>{setFocus(segment);setCursor((segment.start+segment.end)/2);};
  const [cursor,setCursor]=useState<number|null>(null);
  return <><button onClick={()=>{setChannelMode('delta');setZoom(null);}}>Delta only</button><button onClick={()=>{setChannelMode('partial');setZoom(null);}}>Partial channel</button><button onClick={()=>setZoom({min:10,max:20})}>Restore delta zoom</button><button onClick={()=>setZoom({min:0,max:1e9})}>Restore incompatible zoom</button><button onClick={()=>{setFocus(null);setCursor(null);setReset(v=>v+1);}}>Reset</button><button onClick={()=>setEditing(!editing)}>Edit boundaries</button><button onClick={()=>setCompact(!compact)}>Density</button><output>{cursor}</output><pre data-boundaries>{JSON.stringify(boundaries)}</pre><pre data-zoom>{JSON.stringify(zoom)}</pre><div style={{display:'flex',maxHeight:300,overflow:'auto'}}><div style={{width:240,flexShrink:0}}><Track analysis={analysis as Analysis} axis="distance" cursor={cursor} selected={focus?.id??null} onSelect={select} editing={editing} onEdit={setBoundaries}/></div><div style={{width:300}}><Segments analysis={analysis as Analysis} selected={focus?.id??null} onSelect={select}/></div></div><Plots analysis={plotAnalysis as Analysis} axis="distance" onCursor={setCursor} resetVersion={reset} focus={focus} initialZoom={zoom} onZoom={setZoom} layout={compact?'compact':'comfortable'}/></>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
Object.assign(window,{getPlotRanges:()=>uPlot.sync('telemetry').plots.map(plot=>({min:plot.scales.x.min,max:plot.scales.x.max,cursor:plot.cursor.left==null?null:plot.posToVal(plot.cursor.left,'x')}))});
