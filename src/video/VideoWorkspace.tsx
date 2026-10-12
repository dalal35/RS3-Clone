import {useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {convertFileSrc} from '@tauri-apps/api/core';
import {authorizeLocalVideo,pickLocalVideo,isNative} from '../bridge';
import type {Session} from '../types';
import {lapCoverage,lapMarkers,parseYouTubeUrl,telemetryToVideo,validateSegments} from './model';
import type {VideoSegment,VideoSource,VideoStateV1} from './model';
import {assessVideoReference,chooseVideoReference} from './state';
import {createHtmlPlayer} from './htmlPlayer';
import {createYouTubePlayer} from './youtubePlayer';
import type {PlayerSnapshot,VideoPlayer} from './player';
import {SegmentEditor} from './SegmentEditor';
import {VideoTimeline} from './VideoTimeline';

export interface VideoWorkspaceProps {
  session:Session;
  state:VideoStateV1;
  availability:'ready'|'missing'|'changed'|'error';
  telemetryTime:number|null;
  onChange:(next:VideoStateV1)=>void;
  onPlayer:(player:VideoPlayer|null)=>void;
  onSeekTelemetry:(time:number,segmentId?:string)=>void;
  onSeekVideo:(time:number)=>void;
  children?:ReactNode;
}
const idle:PlayerSnapshot={time:0,duration:null,rate:1,state:'loading',observedAtMs:0,seeking:false};
const message=(error:unknown)=>error instanceof Error?error.message:String(error);
const clampHeight=(height:number)=>Math.max(240,Math.min(900,height));

export function VideoWorkspace(props:VideoWorkspaceProps) {
  const {session,state,availability,telemetryTime,onChange,onSeekTelemetry,onSeekVideo}=props;
  const latest=useRef(props);latest.current=props;
  const host=useRef<HTMLDivElement>(null),video=useRef<HTMLVideoElement>(null),player=useRef<VideoPlayer|null>(null);
  const [sample,setSample]=useState<PlayerSnapshot>(idle);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[url,setUrl]=useState('');
  const [pending,setPending]=useState<{source:VideoSource;preserve:boolean}|null>(null);
  const [referenceStatus,setReferenceStatus]=useState<'ready'|'missing'|'changed'>('ready');
  const [acceptedKey,setAcceptedKey]=useState<string|null>(null);
  const [anchorLapId,setAnchorLapId]=useState(session.laps[0]?.id??'');
  const [height,setHeight]=useState(clampHeight(state.preferences.panelHeight));
  const sourceKey=JSON.stringify(state.source);
  const effectiveAvailability=acceptedKey===sourceKey?'ready':availability;
  const currentAvailability=effectiveAvailability==='ready'?referenceStatus:effectiveAvailability;
  const usable=!!state.source&&currentAvailability==='ready';
  const nativeYouTube=state.source?.type==='youtube'&&isNative&&!/^https?:$/.test(location.protocol);
  const selected=state.segments.find(segment=>segment.id===state.selectedSegmentId);
  const paused=sample.state==='paused'||sample.state==='ended';
  const knownDuration=sample.duration!==null&&Number.isFinite(sample.duration)&&sample.duration>0?sample.duration:null;
  const coverage=lapCoverage(state.segments,session.laps);
  const reverse=telemetryTime===null?{kind:'unavailable' as const}:telemetryToVideo(state.segments,telemetryTime);
  useEffect(()=>setAcceptedKey(null),[availability]);
  useEffect(()=>setHeight(clampHeight(state.preferences.panelHeight)),[state.preferences.panelHeight]);
  useEffect(()=>{setReferenceStatus('ready');setPending(null);setError('');},[sourceKey]);

  useEffect(()=>{
    let active=true,restored=false;
    let adapter:VideoPlayer|null=null,unsubscribe:(()=>void)|undefined;
    setSample(idle);
    latest.current.onPlayer(null);
    if(!state.source||effectiveAvailability!=='ready'||referenceStatus!=='ready'||nativeYouTube)return;
    const source=state.source;
    const initialize=async()=>{
      try {
        if(source.type==='local'){
          const info=await authorizeLocalVideo(source.path);
          if(!active)return;
          const assessment=assessVideoReference(source,info.status==='ready'?info:null);
          if(!assessment.canPlay){setReferenceStatus(assessment.status);if(info.status==='ready')setPending({source:{type:'local',path:info.path,size:info.size,modifiedMs:info.modifiedMs},preserve:true});return;}
          adapter=createHtmlPlayer(video.current!,convertFileSrc(source.path));
        }else adapter=createYouTubePlayer(host.current!,source.videoId);
        if(!active){adapter.dispose();return;}
        player.current=adapter;
        setSample(adapter.snapshot());
        let previousState=adapter.snapshot().state,previousRate=adapter.snapshot().rate,previousSeeking=false;
        unsubscribe=adapter.subscribe(next=>{
          if(!active)return;
          setSample(next);
          // Native controls may pause/rate-change outside our common controls. Save semantic transitions only.
          if(!restored){previousState=next.state;previousRate=next.rate;previousSeeking=next.seeking;return;}
          const current=latest.current.state;
          const savePause=(next.state==='paused'||next.state==='ended')&&(next.state!==previousState||previousSeeking&&!next.seeking)&&!next.seeking;
          const saveRate=next.rate!==previousRate&&next.state!=='loading'&&next.state!=='error';
          previousState=next.state;previousRate=next.rate;previousSeeking=next.seeking;
          if(savePause||saveRate)latest.current.onChange({...current,preferences:{...current.preferences,
            ...(savePause?{pausedVideoTime:next.time}:{}),...(saveRate?{playbackRate:next.rate}:{})}});
        });
        await adapter.ready;
        if(!active)return;
        await adapter.pause();
        const preferences=latest.current.state.preferences;
        if(adapter.supportedRates().includes(preferences.playbackRate))await adapter.setRate(preferences.playbackRate);
        if(preferences.pausedVideoTime>0)await adapter.seek(Math.min(preferences.pausedVideoTime,adapter.snapshot().duration??preferences.pausedVideoTime),new AbortController().signal);
        if(!active)return;
        restored=true;setSample(adapter.snapshot());latest.current.onPlayer(adapter);
      }catch(error){if(active)setError(message(error));}
    };
    void initialize();
    return()=>{active=false;unsubscribe?.();adapter?.dispose();if(player.current===adapter)player.current=null;latest.current.onPlayer(null);};
  },[sourceKey,effectiveAvailability,referenceStatus,nativeYouTube,session.id]);

  const change=(next:VideoStateV1)=>{setError('');onChange(next);};
  const commitSource=(source:VideoSource,preserve:boolean)=>{
    const chosen=chooseVideoReference(state.source,source,true);
    if(!chosen)return;
    setAcceptedKey(JSON.stringify(chosen));setReferenceStatus('ready');setPending(null);setError('');
    onChange({...state,source:chosen,segments:preserve?state.segments:[],selectedSegmentId:preserve?state.selectedSegmentId:null,
      preferences:preserve?state.preferences:{...state.preferences,pausedVideoTime:0}});
  };
  const choose=async(preserve:boolean)=>{
    setBusy(true);setError('');
    const sessionId=session.id,originalSourceKey=sourceKey;
    try {
      const info=await pickLocalVideo();if(!info||latest.current.session.id!==sessionId||JSON.stringify(latest.current.state.source)!==originalSourceKey)return;
      if(info.status!=='ready')throw new Error('Footage unavailable. Choose an existing MP4 or MOV file.');
      const source:VideoSource={type:'local',path:info.path,size:info.size,modifiedMs:info.modifiedMs};
      if(state.source)setPending({source,preserve});else commitSource(source,false);
    }catch(error){setError(message(error));}finally{setBusy(false);}
  };
  const operation=async(run:(player:VideoPlayer)=>Promise<void>)=>{
    const adapter=player.current;if(!adapter)return;
    setBusy(true);setError('');
    try {await run(adapter);if(player.current!==adapter)return;const next=adapter.snapshot();setSample(next);
    }catch(error){if(player.current===adapter)setError(message(error));}finally{setBusy(false);}
  };
  const saveSegments=(segments:VideoSegment[],selectedSegmentId:string|null=state.selectedSegmentId)=>{
    const errors=validateSegments(segments,session.laps,knownDuration??undefined);
    if(segments.length>100)errors.push('At most 100 segments can be saved.');
    if(errors.length){setError(errors.join(' '));return;}
    change({...state,segments,selectedSegmentId:segments.some(segment=>segment.id===selectedSegmentId)?selectedSegmentId:null});
  };
  const anchor=(adding:boolean)=>{
    const lap=session.laps.find(lap=>lap.id===anchorLapId);
    if(!lap||!knownDuration||!paused)return;
    const time=player.current?.snapshot().time??sample.time;
    if(time>=knownDuration){setError('Choose a frame before the end of the footage.');return;}
    if(!state.segments.length){const segment:VideoSegment={id:crypto.randomUUID(),videoStart:0,videoEnd:knownDuration,anchorVideoTime:time,anchorTelemetryTime:lap.start,anchorLapId:lap.id,correctionSeconds:0};saveSegments([segment],segment.id);return;}
    if(adding){
      if(state.segments.some(segment=>time>=segment.videoStart&&time<segment.videoEnd)){setError('Trim the existing segment first, then pause inside an unmapped interval to add a cut.');return;}
      const start=Math.max(0,...state.segments.filter(segment=>segment.videoEnd<=time).map(segment=>segment.videoEnd));
      const end=Math.min(knownDuration,...state.segments.filter(segment=>segment.videoStart>time).map(segment=>segment.videoStart));
      const segment:VideoSegment={id:crypto.randomUUID(),videoStart:start,videoEnd:end,anchorVideoTime:time,anchorTelemetryTime:lap.start,anchorLapId:lap.id,correctionSeconds:0};saveSegments([...state.segments,segment],segment.id);
    }else{
      const segment=selected&&time>=selected.videoStart&&time<selected.videoEnd?selected:state.segments.find(segment=>time>=segment.videoStart&&time<segment.videoEnd);
      if(!segment){setError('This frame is in an unmapped gap. Use Add segment here.');return;}
      saveSegments(state.segments.map(item=>item.id===segment.id?{...item,anchorVideoTime:time,anchorTelemetryTime:lap.start,anchorLapId:lap.id,correctionSeconds:0}:item),segment.id);
    }
  };
  const resize=(value:number,save:boolean)=>{
    const panelHeight=clampHeight(value);setHeight(panelHeight);
    if(save){const current=latest.current.state;latest.current.onChange({...current,preferences:{...current.preferences,panelHeight}});}
  };
  return <section className="video-workspace" aria-label="Video synchronization">
    <div className="video-sticky-player">
      <div className="video-section-title"><div><span className="eyebrow">ONBOARD FOOTAGE</span><h2>Video synchronization</h2></div><span className="video-status" role="status">{!state.source?'No footage':nativeYouTube?'YouTube unavailable':usable?sample.state:'Footage unavailable'}</span></div>
      {state.source&&<p className="video-source-name">{state.source.type==='local'?state.source.path:state.source.url}</p>}
      {!usable||nativeYouTube?<div className="video-placeholder">
        <strong>{state.source?'Footage unavailable':'Bring your onboard footage alongside telemetry'}</strong>
        <p>{nativeYouTube?'YouTube playback is unavailable in this native WebView (Error 153: client identity). Attach a local MP4 / MOV, or use the HTTP browser version for YouTube.':currentAvailability==='missing'?'The saved file is missing. Locate it to preserve your segments.':currentAvailability==='changed'?'The file metadata changed. Confirm that the existing mappings still apply.':currentAvailability==='error'?'The video reference could not be checked. Locate the file or replace the footage.':'Attach a local MP4 / MOV or paste a YouTube link. Files stay on your computer.'}</p>
      </div>:<div className="video-player-space" style={{height}}><div className="video-viewport">
        {state.source?.type==='local'?<video ref={video} controls playsInline preload="metadata"/>:<div ref={host} className="video-youtube-host"/>}
      </div></div>}
      <div className="video-controls">
        <button disabled={!usable||!player.current||busy||nativeYouTube} onClick={()=>void operation(adapter=>sample.state==='playing'||sample.state==='buffering'?adapter.pause():adapter.play())}>{sample.state==='playing'||sample.state==='buffering'?'Pause':'Play'}</button>
        <span className="mono">Video {sample.time.toFixed(2)}s {knownDuration?`/ ${knownDuration.toFixed(2)}s`:''}</span>
        <label>Playback speed<select disabled={!usable||!player.current||busy||nativeYouTube} value={sample.rate} onChange={event=>{const rate=Number(event.target.value);void operation(adapter=>adapter.setRate(rate));}}>{(player.current?.supportedRates()??[1]).map(rate=><option key={rate} value={rate}>{rate}×</option>)}</select></label>
        <span className="video-telemetry-time">Telemetry <span className="mono">{telemetryTime===null?'unavailable':`${telemetryTime.toFixed(2)}s`}</span></span>
      </div>
      {state.source?.type==='youtube'&&<p className="video-note">YouTube synchronization uses approximate asynchronous timing. Native YouTube controls remain available in the player.</p>}
      {state.source?.type==='local'&&<p className="video-note">Timing follows media timestamps and manual alignment; frame accuracy is not guaranteed.</p>}
      <div role="separator" tabIndex={0} aria-label="Resize video panel" aria-orientation="horizontal" aria-valuenow={height} aria-valuemin={240} aria-valuemax={900}
        className="video-resize" onKeyDown={event=>{if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();resize(event.key==='Home'?240:event.key==='End'?900:height+(event.key==='ArrowDown'?20:-20),true);}}}
        onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.dataset.startY=String(event.clientY);event.currentTarget.dataset.startHeight=String(height);}}
        onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))resize(Number(event.currentTarget.dataset.startHeight)+event.clientY-Number(event.currentTarget.dataset.startY),false);}}
        onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId)){event.currentTarget.releasePointerCapture(event.pointerId);resize(height,true);}}}><span/></div>
    </div>
    <div className="video-source-controls">
      <button disabled={busy} onClick={()=>void choose(false)}>{state.source?'Replace footage':'Attach MP4 / MOV'}</button>
      {state.source&&currentAvailability!=='ready'&&<button disabled={busy} onClick={()=>void choose(true)}>Locate</button>}
      <form onSubmit={event=>{event.preventDefault();const source=parseYouTubeUrl(url);if(!source){setError('Enter a valid YouTube watch, share or short video URL.');return;}if(state.source)setPending({source,preserve:false});else commitSource(source,false);}}>
        <label>YouTube URL<input type="url" value={url} placeholder="https://www.youtube.com/watch?v=…" onChange={event=>setUrl(event.target.value)}/></label><button type="submit" disabled={busy}>Attach YouTube</button>
      </form>
    </div>
    {pending&&<div className="video-confirm" role="group" aria-label={pending.preserve?'Confirm relocated footage':'Confirm replacement'}>
      <p>{pending.preserve?'File metadata cannot prove footage identity. Confirm that these segments still apply to the located file.':'Replacing footage clears all existing segments. The telemetry session stays available.'}</p>
      <div className="video-actions"><button className="video-primary" onClick={()=>commitSource(pending.source,pending.preserve)}>{pending.preserve?'Confirm mappings still apply':'Replace and clear segments'}</button><button onClick={()=>setPending(null)}>Cancel</button></div>
    </div>}
    {(error||sample.error)&&<p role="alert" className="video-error">{error||sample.error} {state.source?.type==='local'?'If this file cannot decode, try a supported H.264 MP4 / MOV export.':''}</p>}
    <div className="video-anchor-controls">
      <p>Pause on the start/finish crossing, choose the matching recorded lap, then sync.</p>
      <div className="video-actions"><label>Anchor lap<select aria-label="Anchor lap" value={anchorLapId} onChange={event=>setAnchorLapId(event.target.value)}>{session.laps.map(lap=><option key={lap.id} value={lap.id}>Lap {lap.number} · start {lap.start.toFixed(2)}s</option>)}</select></label>
        <button className="video-primary" disabled={!usable||!paused||!knownDuration||busy||nativeYouTube} onClick={()=>anchor(false)}>Sync Here</button>
        <button disabled={!usable||!paused||!knownDuration||!state.segments.length||busy||nativeYouTube} onClick={()=>anchor(true)}>Add segment here</button>
      </div>
      {!knownDuration&&state.source&&usable&&!nativeYouTube&&<p className="video-note">Waiting for a known video duration before creating segments.</p>}
      {!!state.segments.length&&<p className="video-note">The first segment spans the known footage. Edit the bounds below for cuts and unmapped gaps.</p>}
    </div>
    <VideoTimeline segments={state.segments} markers={lapMarkers(state.segments,session.laps)} duration={knownDuration} time={sample.time} onSeekVideo={onSeekVideo}/>
    {reverse.kind==='ambiguous'&&<div className="video-confirm"><p>Repeated footage: choose a segment to seek.</p><div className="video-actions">{reverse.segmentIds.map(id=><button key={id} onClick={()=>{change({...state,selectedSegmentId:id});onSeekTelemetry(telemetryTime!,id);}}>Use segment {state.segments.findIndex(segment=>segment.id===id)+1}</button>)}</div></div>}
    {state.segments.length>0&&reverse.kind==='unavailable'&&<p className="video-note">Footage unavailable at this telemetry time.</p>}
    <div className="video-coverage" aria-label="Recorded lap coverage">{session.laps.map(lap=><span key={lap.id} data-coverage={coverage[lap.id]}>Lap {lap.number} · {coverage[lap.id]==='none'?'no':coverage[lap.id]} coverage</span>)}</div>
    <SegmentEditor segments={state.segments} laps={session.laps} duration={knownDuration} selectedSegmentId={state.selectedSegmentId} onSelect={id=>change({...state,selectedSegmentId:id})} onChange={segments=>saveSegments(segments)}/>
    {props.children&&<div className="video-graphs">{props.children}</div>}
  </section>;
}
