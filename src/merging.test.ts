import {describe,it,expect} from 'vitest';
import type {Session,MergeInfo} from './types';
import {videoSourceContext,sourceVideoAnalysis,canSeekVideoLap,lapDisplayNumber,lapSourceLabel} from './merging';
import {restoreWorkspace,serializeWorkspace} from './workspace';
import {defaultVideoState} from './video/state';
import {projectVideoTime} from './video/useVideoSync';
const a:Session={id:'source-a',source:'a.xrk',name:'Run A',driver:'',track:'Track',recordedAt:'2026-10-14 12:00:00',channels:[],warnings:[],laps:[{id:'lap-1',number:7,start:0,end:10,duration:10,complete:true}]};
const b:Session={...a,id:'source-b',source:'b.xrk',name:'Run B'};
const qa=JSON.stringify([a.id,'lap-1']),qb=JSON.stringify([b.id,'lap-1']);
const refs=[{sessionId:a.id,contentVersion:'a'.repeat(64)},{sessionId:b.id,contentVersion:'b'.repeat(64)}];
const info:MergeInfo={sources:[{...refs[0],session:a},{...refs[1],session:b}],preview:{sources:refs,day:'2026-10-14',previewVersion:'m'.repeat(64),warnings:[],channels:[],laps:[{...a.laps[0],id:qa,sourceSessionId:a.id,sourceLapId:'lap-1',displayNumber:1},{...b.laps[0],id:qb,sourceSessionId:b.id,sourceLapId:'lap-1',displayNumber:2}]}};
const merged:Session={...a,id:'merge',merge:info,laps:info.preview.laps};
const mappedVideo=(source:Session,version:string)=>({...defaultVideoState(source,version),source:{type:'local' as const,path:`/tmp/${source.id}.mp4`,size:10,modifiedMs:10},segments:[{id:'segment',videoStart:0,videoEnd:10,anchorVideoTime:0,anchorTelemetryTime:0,anchorLapId:'lap-1',correctionSeconds:0}]});
describe('merged source adapters',()=>{
 it('merged_video_source_isolation: overlapping source clocks never select foreign laps',()=>{
  const context=videoSourceContext(merged,qb)!;expect(context.sourceSession.id).toBe(b.id);expect(context.sourcePrimaryId).toBe('lap-1');expect(context.toMergedLapId('lap-1')).toBe(qb);expect(context.toMergedLapId('foreign')).toBeNull();
  expect(projectVideoTime(merged,5,qb,null,'time').lapId).toBeNull();
  const projected=projectVideoTime(context.sourceSession,5,context.sourcePrimaryId,null,'time');expect(context.toMergedLapId(projected.lapId!)).toBe(qb);expect(projected.lapId).not.toBe(qa);
  expect(lapDisplayNumber(merged,qb)).toBe(2);expect(lapSourceLabel(merged,qb)).toContain('b.xrk');expect(videoSourceContext(merged,'missing')).toBeNull();
 });
 it('merged_video_source_switch: an old source player cannot seek a new source lap',()=>{
  expect(canSeekVideoLap(merged,qa,qb)).toBe(false);expect(canSeekVideoLap(merged,qa,qa)).toBe(true);expect(videoSourceContext(merged,qa)!.contentVersion).toBe(refs[0].contentVersion);
  expect(sourceVideoAnalysis(null,videoSourceContext(merged,qb)!,qb)).toBeNull();
 });
 it('merged_workspace_roundtrip: restores independent mappings and rejects aggregate oversize',()=>{
  const videos={[a.id]:mappedVideo(a,refs[0].contentVersion),[b.id]:mappedVideo(b,refs[1].contentVersion)};
  const raw={contentVersion:'merge-version',primary:qa,axis:'time',view:'video',sourceVideos:videos};const restored=restoreWorkspace(merged,raw,'merge-version');
  expect(restored.sourceVideos?.[a.id].state?.source).toEqual(videos[a.id].source);expect(restored.sourceVideos?.[b.id].state?.source).toEqual(videos[b.id].source);expect(restored.video).toBeUndefined();expect(restored.view).toBe('video');
  expect(serializeWorkspace(restored).sourceVideos).toEqual(videos);
  const oversize=restoreWorkspace(merged,{...raw,sourceVideos:{[a.id]:{...videos[a.id],version:999,payload:'x'.repeat(40000)},[b.id]:{...videos[b.id],version:999,payload:'x'.repeat(40000)}}},'merge-version');expect(()=>serializeWorkspace(oversize)).toThrow(/64 KiB/);
 });
 it('merged_video_future_state: keeps unknown schemas opaque and never borrows a different source mapping',()=>{
  const future={sessionId:b.id,contentVersion:refs[1].contentVersion,version:999,payload:'retain'};
  const restored=restoreWorkspace(merged,{contentVersion:'v',primary:qb,sourceVideos:{[b.id]:future}},'v');expect(restored.sourceVideos?.[b.id].futureRaw).toEqual(future);expect(restored.sourceVideos?.[a.id]?.state).toBeNull();expect((serializeWorkspace(restored).sourceVideos as Record<string,unknown>)[b.id]).toEqual(future);
 });
});
