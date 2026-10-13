import {useCallback,useEffect,useRef,useState} from 'react';
import type {Analysis,Axis,Session} from '../types';
import {createSyncController} from './controller';
import {sessionTimeToCursor,validateSegments,type MappingResult,type VideoSegment} from './model';
import type {VideoPlayer} from './player';

export function projectVideoTime(session:Session,time:number,primaryId:string,analysis:Analysis|null,axis:Axis){
  const lap=session.laps.find(lap=>time>=lap.start&&time<lap.end);
  const cursor=lap&&lap.id===primaryId&&analysis?.primary.lapId===lap.id?sessionTimeToCursor(time,lap,analysis.primary,axis):null;
  const cornerId=cursor===null?null:analysis?.segments.find(segment=>cursor>=segment.start&&cursor<segment.end)?.id??null;
  return {lapId:lap?.id??null,cursor,cornerId};
}
interface Options {
 session:Session|null;contentVersion:string;player:VideoPlayer|null;segments:VideoSegment[];primaryId:string;analysis:Analysis|null;axis:Axis;
 onLap:(lapId:string)=>void;onCursor:(cursor:number|null)=>void;onCorner:(cornerId:string|null)=>void;
}
type Clock={telemetryTime:number|null;result:MappingResult;status:'ready'|'unavailable'|'ambiguous'|'seeking'|'error';error:string|null};
const idle:Clock={telemetryTime:null,result:{kind:'unavailable'},status:'unavailable',error:null};
export function useVideoSync(options:Options){
 const latest=useRef(options);latest.current=options;
 const controllerError=useRef<string|null>(null),requestedTelemetry=useRef<number|null>(null);
 const [clock,setClock]=useState<Clock>(idle);
 const controller=useRef<ReturnType<typeof createSyncController>|null>(null),generation=useRef(0);
 const published=useRef<{cursor:number|null;corner:string|null}|null>(null),wantedLap=useRef<string|null>(null);
 const gate=useCallback(()=>{
  const {session,player,segments}=latest.current;if(!session||!player)return null;
  const duration=player.snapshot().duration;
  return validateSegments(segments,session.laps,duration!==null?duration:undefined).join(' ')||null;
 },[]);
 useEffect(()=>{
  const token=++generation.current;controllerError.current=null;requestedTelemetry.current=null;wantedLap.current=null;published.current=null;setClock(idle);
  const player=options.player;if(!player||!options.session)return;
  const update=(result:MappingResult)=>{
   if(generation.current!==token)return;
   const error=gate()??controllerError.current;
   if(result.kind==='mapped'&&!error||player.snapshot().state==='playing')requestedTelemetry.current=null;
   const telemetryTime=result.kind==='mapped'&&!error?result.time:requestedTelemetry.current;
   setClock(previous=>{
    const next:Clock={telemetryTime,result:error?{kind:'unavailable'}:result,status:error?'error':result.kind==='mapped'?'ready':result.kind,error};
    return JSON.stringify(previous)===JSON.stringify(next)?previous:next;
   });
  };
  const sync=createSyncController(player,{nowMs:()=>performance.now(),segments:()=>gate()?[]:latest.current.segments,onTime:update,onError:error=>{if(generation.current===token){controllerError.current=error;setClock(previous=>({...previous,status:'error',error}));}}});
  controller.current=sync;
  const visibility=()=>sync.setVisible(document.visibilityState!=='hidden');visibility();
  document.addEventListener('visibilitychange',visibility);
  const timer=setInterval(()=>sync.tick(),50);sync.tick();
  return()=>{++generation.current;clearInterval(timer);document.removeEventListener('visibilitychange',visibility);sync.dispose();if(controller.current===sync)controller.current=null;};
 },[options.session?.id,options.contentVersion,options.player,gate]);
 useEffect(()=>{
  if(!options.player){latest.current.onCorner(null);published.current=null;return;}
  const projection=options.session&&clock.telemetryTime!==null&&clock.status==='ready'?projectVideoTime(options.session,clock.telemetryTime,options.primaryId,options.analysis,options.axis):{lapId:null,cursor:null,cornerId:null};
  if(projection.lapId&&projection.lapId!==options.primaryId&&wantedLap.current!==projection.lapId){wantedLap.current=projection.lapId;latest.current.onLap(projection.lapId);}
  if(projection.lapId===options.primaryId)wantedLap.current=null;
  if(!published.current||published.current.cursor!==projection.cursor){latest.current.onCursor(projection.cursor);}
  if(!published.current||published.current.corner!==projection.cornerId){latest.current.onCorner(projection.cornerId);}
  published.current={cursor:projection.cursor,corner:projection.cornerId};
 },[clock,options.session,options.primaryId,options.analysis,options.axis,options.player]);
 const seek=useCallback(async(type:'telemetry'|'video',time:number,segmentId?:string):Promise<MappingResult>=>{
  const sync=controller.current,token=generation.current,error=gate();
  requestedTelemetry.current=type==='telemetry'?time:null;
  if(!sync){setClock(previous=>({...previous,telemetryTime:type==='telemetry'?time:previous.telemetryTime,result:{kind:'unavailable'},status:error?'error':'unavailable',error}));return {kind:'unavailable'};}
  controllerError.current=null;
  setClock(previous=>({...previous,telemetryTime:type==='telemetry'?time:previous.telemetryTime,status:error?'error':'seeking',error}));
  // Invalid mappings still use the controller's bounded pause/hold path with no seekable segments.
  const result=await(type==='telemetry'?sync.seekTelemetry(time,segmentId):sync.seekVideo(time));
  if(token!==generation.current)return {kind:'unavailable'};
  return result;
 },[gate]);
 const seekTelemetry=useCallback((time:number,segmentId?:string)=>seek('telemetry',time,segmentId),[seek]);
 const seekVideo=useCallback((time:number)=>seek('video',time),[seek]);
 return {telemetryTime:clock.telemetryTime,status:clock.status,error:clock.error,seekTelemetry,seekVideo};
}
