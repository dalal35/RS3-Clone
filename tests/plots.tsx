import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import uPlot from 'uplot';
import Plots from '../src/Plots';
import type { Analysis } from '../src/types';
import analysis from '../.tools/analysis.json';
function Harness() {
  const [reset,setReset]=useState(0);
  const [cursor,setCursor]=useState<number|null>(null);
  return <><button onClick={()=>setReset(v=>v+1)}>Reset</button><output>{cursor}</output><Plots analysis={analysis as Analysis} axis="distance" onCursor={setCursor} resetVersion={reset}/></>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
Object.assign(window,{getPlotRanges:()=>uPlot.sync('telemetry').plots.map(plot=>({min:plot.scales.x.min,max:plot.scales.x.max}))});
