import {useMemo} from 'react';
import type {Analysis,Axis,TrackSegment} from './types';
import {mapTimeToPrimary,trackGeometry,trackPath,trackMarker} from './telemetry';
export default function Track({analysis,cursor,axis,selected,onSelect}:{analysis:Analysis;cursor:number|null;axis:Axis;selected:string|null;onSelect:(segment:TrackSegment)=>void}){
  const geometry=useMemo(()=>{
    const all=[...analysis.primary.track,...(analysis.comparison?.track??[])];
    if(!all.length)return {primary:[],comparison:[]};
    const bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
    all.forEach(p=>{bounds.minX=Math.min(bounds.minX,p.x);bounds.maxX=Math.max(bounds.maxX,p.x);bounds.minY=Math.min(bounds.minY,p.y);bounds.maxY=Math.max(bounds.maxY,p.y);});
    return {primary:trackGeometry(analysis.primary.track,bounds),comparison:trackGeometry(analysis.comparison?.track??[],bounds)};
  },[analysis]);
  const path=trackPath;
  const marker=(points:ReturnType<typeof trackGeometry>)=>{
    if(cursor==null||!points.length)return null;
    const point=trackMarker(points,cursor);
    return point?<circle cx={point.x} cy={point.y} r="4"/>:null;
  };
  const comparisonTime=cursor!=null&&axis==='time'&&analysis.alignment?.method==='spatial'&&analysis.comparison&&trackMarker(geometry.primary,cursor)&&trackMarker(geometry.comparison,cursor)?mapTimeToPrimary(cursor,analysis.primary.mapping,analysis.comparison.mapping):null;
  return <section className="track-section"><div className="section-heading"><span>CIRCUIT TRACE</span><span className="muted">GPS</span></div>{geometry.primary.length?<><svg className="track" viewBox="0 0 320 260" aria-label="GPS racing lines and selectable track segments"><path className="track-underlay" d={path(geometry.primary)}/>{geometry.comparison.length>0&&<path className="comparison-line" d={path(geometry.comparison)}/>}<path className="primary-line" d={path(geometry.primary)}/>{(analysis.segments??[]).map(segment=><path key={segment.id} role="button" tabIndex={0} aria-label={`Focus ${segment.label}`} aria-pressed={selected===segment.id} className={`track-segment ${selected===segment.id?'selected':''}`} d={path(geometry.primary.filter(p=>p.position>=segment.start&&p.position<=segment.end))} onClick={()=>onSelect(segment)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(segment);}}}><title>{segment.label} · approximate boundary resolution {segment.uncertaintyMeters.toFixed(0)} m</title></path>)}<g className="primary-marker">{marker(geometry.primary)}</g><g className="comparison-marker">{marker(geometry.comparison)}</g></svg><div className="map-caption">{cursor==null?'Click a track section to focus its telemetry':`${cursor.toFixed(1)} ${axis==='distance'?'m':'s'} into primary lap${comparisonTime==null?'':` · comparison ${comparisonTime.toFixed(1)} s`}`}</div></>:<div className="map-empty">GPS position is unavailable for this lap.</div>}</section>;
}
