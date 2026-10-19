/** Browser-only visualization. Uses the desktop synchronization controller and editors. */
import {useEffect,useRef,useState} from 'react';
import type {VideoWorkspaceProps} from '../../src/video/VideoWorkspace';
import type {PlayerSnapshot,VideoPlayer} from '../../src/video/player';
import {VideoTimeline} from '../../src/video/VideoTimeline';
import {SegmentEditor} from '../../src/video/SegmentEditor';
import {lapCoverage,lapMarkers,validateSegments} from '../../src/video/model';
import {interpolate} from '../../src/telemetry';

function simulatedPlayer(duration:number,start:number):VideoPlayer {
 let current:PlayerSnapshot={time:start,duration,rate:1,state:'paused',observedAtMs:performance.now(),seeking:false};
 const listeners=new Set<(s:PlayerSnapshot)=>void>();
 const publish=()=>{current={...current,observedAtMs:performance.now()};listeners.forEach(fn=>fn({...current}));};
 let last=performance.now();const timer=window.setInterval(()=>{const now=performance.now();if(current.state==='playing'){current.time=Math.min(duration,current.time+(now-last)/1000*current.rate);if(current.time>=duration)current.state='ended';publish();}last=now;},40);
 return {ready:Promise.resolve(),async play(){if(current.time>=duration)current.time=0;last=performance.now();current.state='playing';publish();},async pause(){current.state='paused';publish();},async seek(time,signal){if(signal.aborted)return;current.time=Math.max(0,Math.min(duration,time));if(current.state==='ended')current.state='paused';publish();},async setRate(rate){current.rate=rate;publish();},supportedRates:()=>[.25,.5,1,1.5,2],snapshot:()=>({...current}),subscribe(fn){listeners.add(fn);return()=>{listeners.delete(fn);};},dispose(){clearInterval(timer);listeners.clear();}};
}
export function VideoWorkspace(props:VideoWorkspaceProps){
 const latest=useRef(props);latest.current=props;
 const duration=props.session.laps.at(-1)!.end;
 const [player,setPlayer]=useState<VideoPlayer|null>(null);
 const [sample,setSample]=useState<PlayerSnapshot>({time:props.state.preferences.pausedVideoTime,duration,rate:1,state:'paused',observedAtMs:0,seeking:false}),[error,setError]=useState('');
 useEffect(()=>{const adapter=simulatedPlayer(duration,latest.current.state.preferences.pausedVideoTime);setPlayer(adapter);setSample(adapter.snapshot());const off=adapter.subscribe(setSample);latest.current.onPlayer(adapter);return()=>{off();adapter.dispose();latest.current.onPlayer(null);};},[duration,props.session.id]);
 if(!player)return <section className="video-workspace" role="status">Loading synthetic playback…</section>;
 const state=props.state,lap=props.session.laps.find(l=>sample.time>=l.start&&sample.time<l.end)??props.session.laps.at(-1)!,p=(sample.time-lap.start)/lap.duration;
 const channel=(id:string)=>{const c=props.session.channels.find(c=>c.id===id);return c?interpolate(c.times,c.values,sample.time)??0:0;};
 const speed=channel('gps-speed')*.621371,rpm=channel('rpm'),steering=channel('steering');
 const coverage=lapCoverage(state.segments,props.session.laps),curve=Math.sin(p*Math.PI*12)*55;
 const seek=(time:number)=>props.onSeekVideo(time);
 const saveSegments=(segments:typeof state.segments)=>{const errors=validateSegments(segments,props.session.laps,duration);if(errors.length){setError(errors.join(' '));return;}setError('');props.onChange({...state,segments});};
 return <section className="video-workspace" aria-label="Video synchronization"><div className="video-sticky-player"><div className="video-section-title"><div><span className="eyebrow">SYNCHRONIZED PLAYBACK DEMONSTRATION</span><h2>Video synchronization</h2></div><span className="video-status" role="status">{sample.state}</span></div>
 <p className="demo-video-note">Synthetic circuit visualization · not recorded footage. Playback follows the telemetry cursor and GPS marker. Attach your own MP4 / MOV or YouTube footage in the desktop app.</p>
 <div className="demo-video-stage" aria-label="Animated synthetic circuit visualization"><svg viewBox="0 0 640 300" role="img" aria-label="Illustrated road with moving center markings"><path d="M0 0H640V130H0Z" fill="#294959"/><path d="M0 122L55 98 104 120 167 94 221 121 304 91 390 123 470 102 530 121 590 97 640 120V165H0Z" fill="#476253"/><path d={`M${300+curve} 128L${60+curve*-.2} 300H${590+curve*-.2}L${340+curve} 128Z`} fill="#343d40"/><path d={`M${300+curve} 128L60 300M${340+curve} 128L590 300`} fill="none" stroke="#ece7d6" strokeWidth="3"/>{Array.from({length:8},(_,i)=>{const depth=((i/8+sample.time*.32)%1)**2,y=130+depth*170,cx=320+curve*(1-depth);return <path key={i} d={`M${cx} ${y}l${-curve*.04} ${4+depth*14}`} stroke="#e5dfc4" strokeWidth={1+depth*4}/>;})}<path d="M0 282Q320 218 640 282V300H0Z" fill="#111b22"/><g transform={`translate(320 300) rotate(${steering*.15})`}><circle r="56" fill="none" stroke="#050b10" strokeWidth="16"/><path d="M-48 0H48M0 0V-45" stroke="#1d2c34" strokeWidth="10"/></g></svg><div className="demo-video-caption">GENERATED CIRCUIT VIEW · SYNTHETIC · LAP {lap.number}</div><div className="demo-video-hud"><span><strong>{Math.round(speed)}</strong> mph</span><span>{Math.round(rpm).toLocaleString()} rpm · Gear {Math.round(channel('gear'))}</span></div></div>
 <div className="video-controls"><button onClick={()=>void(sample.state==='playing'?player.pause():player.play())}>{sample.state==='playing'?'Pause':'Play'}</button><span className="mono">Video {sample.time.toFixed(2)}s / {duration.toFixed(2)}s</span><label>Playback speed<select value={sample.rate} onChange={e=>void player.setRate(Number(e.target.value))}>{player.supportedRates().map(rate=><option value={rate} key={rate}>{rate}×</option>)}</select></label><span className="video-telemetry-time">Telemetry <span className="mono">{props.telemetryTime?.toFixed(2)??'—'}s</span></span></div>
 <label className="demo-native-note">Seek sample playback<input className="demo-video-scrubber" aria-label="Seek sample playback" type="range" min="0" max={duration} step="0.1" value={sample.time} onChange={e=>seek(Number(e.target.value))}/></label></div>
 <div className="video-source-controls"><button disabled title="Attach files in the desktop app">Attach MP4 / MOV · desktop app</button><button disabled title="Use your own footage in the desktop app">Attach YouTube · desktop app</button></div>
 <div className="video-anchor-controls"><p>The sample begins with a continuous 1:1 mapping. Edit its timing correction or bounds below to explore synchronization.</p></div>
 <VideoTimeline segments={state.segments} markers={lapMarkers(state.segments,props.session.laps)} duration={duration} time={sample.time} onSeekVideo={seek}/>
 <div className="video-coverage" aria-label="Recorded lap coverage">{props.session.laps.map(l=><span key={l.id} data-coverage={coverage[l.id]}>Lap {l.number} · {coverage[l.id]} coverage</span>)}</div>
 {error&&<p role="alert">{error}</p>}<SegmentEditor segments={state.segments} laps={props.session.laps} duration={duration} selectedSegmentId={state.selectedSegmentId} onSelect={selectedSegmentId=>props.onChange({...state,selectedSegmentId})} onChange={saveSegments}/>
 <div className="video-graphs">{props.children}</div></section>;
}
