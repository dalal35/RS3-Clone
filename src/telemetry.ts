import type { Lap, TrackPoint, PositionTime } from './types';
export const fastestLap = (laps: Lap[]) => laps.filter(l => l.complete && l.duration > 0).sort((a,b) => a.duration-b.duration)[0];
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const ms=Math.round(seconds*1000); return `${Math.floor(ms/60000)}:${(Math.floor(ms/1000)%60).toString().padStart(2,'0')}.${(ms%1000).toString().padStart(3,'0')}`;
}
export function interpolate(x:number[], y:number[], position:number,gaps:[number,number][]=[]):number|null {
  if (gaps.some(([start,end])=>position>start&&position<end)) return null;
  if (!x.length || position<x[0] || position>x[x.length-1]) return null;
  let lo=0,hi=x.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(x[mid]<position)lo=mid+1;else hi=mid;}
  if(x[lo]===position || lo===0)return Number.isFinite(y[lo])?y[lo]:null;
  const value=y[lo-1]+(y[lo]-y[lo-1])*(position-x[lo-1])/(x[lo]-x[lo-1]);
  return Number.isFinite(value)?value:null;
}
export function mergeSeries(series:{x:number[];values:number[];gaps?:[number,number][]}[]):[number[],...(number|null)[][]] {
  const positions=series.flatMap(s=>[...s.x,...(s.gaps??[]).map(([start,end])=>(start+end)/2)]);
  const x=Array.from(new Set(positions)).sort((a,b)=>a-b);
  return [x,...series.map(s=>x.map(position=>interpolate(s.x,s.values,position,s.gaps)))];
}
export function trackGeometry(points:TrackPoint[], bounds?:{minX:number;maxX:number;minY:number;maxY:number}) {
  if(!points.length)return [];
  const box=bounds??{minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};
  const scale=Math.min(280/Math.max(box.maxX-box.minX,1),220/Math.max(box.maxY-box.minY,1));
  return points.map(p=>({...p,x:160+(p.x-(box.minX+box.maxX)/2)*scale,y:130-(p.y-(box.minY+box.maxY)/2)*scale}));
}

export function mapTimeToPrimary(time:number, source:PositionTime[], primary:PositionTime[]):number|null {
  const meters=interpolate(source.map(p=>p.time),source.map(p=>p.meters),time);
  return meters==null?null:interpolate(primary.map(p=>p.meters),primary.map(p=>p.time),meters);
}
export function metricDifference(primary:number|null, comparison:number|null, unit:string):string {
  if(primary==null||comparison==null||!Number.isFinite(primary)||!Number.isFinite(comparison))return '—';
  const delta=primary-comparison;
  return `${delta>0?'+':''}${delta.toFixed(1)} ${unit}`.trim();
}

export function trackPath(points:TrackPoint[]):string {
  return points.map((p,i)=>`${i===0||p.breakBefore?'M':'L'}${p.x},${p.y}`).join(' ');
}
export function trackMarker(points:TrackPoint[],cursor:number):{x:number;y:number}|null {
  if(points.some((p,i)=>i>0&&p.breakBefore&&cursor>points[i-1].position&&cursor<p.position))return null;
  const x=interpolate(points.map(p=>p.position),points.map(p=>p.x),cursor);
  const y=interpolate(points.map(p=>p.position),points.map(p=>p.y),cursor);
  return x==null||y==null?null:{x,y};
}
