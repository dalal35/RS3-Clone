import type {Analysis,Session} from './types';
export interface VideoSourceContext {
  sourceSession:Session;sourcePrimaryId:string;contentVersion:string;
  toMergedLapId:(id:string)=>string|null;
}
/** Video observes only one original recording, never a virtual collection's clock. */
export function videoSourceContext(session:Session,primaryId:string):VideoSourceContext|null {
  if(!session.merge){
    if(!session.laps.some(l=>l.id===primaryId))return null;
    return {sourceSession:session,sourcePrimaryId:primaryId,contentVersion:'',toMergedLapId:id=>session.laps.some(l=>l.id===id)?id:null};
  }
  const lap=session.merge.preview.laps.find(l=>l.id===primaryId);
  const source=session.merge.sources.find(s=>s.sessionId===lap?.sourceSessionId);
  if(!lap||!source||!source.session.laps.some(l=>l.id===lap.sourceLapId))return null;
  const laps=session.merge.preview.laps.filter(l=>l.sourceSessionId===source.sessionId);
  return {sourceSession:source.session,sourcePrimaryId:lap.sourceLapId,contentVersion:source.contentVersion,toMergedLapId:id=>laps.find(l=>l.sourceLapId===id)?.id??null};
}
export function sourceVideoAnalysis(analysis:Analysis|null,context:VideoSourceContext,primaryId:string):Analysis|null {
  return analysis?.primary.lapId===primaryId?{...analysis,primary:{...analysis.primary,lapId:context.sourcePrimaryId},comparison:null}:null;
}
export function canSeekVideoLap(session:Session,fromId:string,toId:string):boolean {
  const from=videoSourceContext(session,fromId),to=videoSourceContext(session,toId);
  return !!from&&!!to&&from.sourceSession.id===to.sourceSession.id;
}
export const lapDisplayNumber=(session:Session,id:string)=>session.merge?.preview.laps.find(l=>l.id===id)?.displayNumber??session.laps.find(l=>l.id===id)?.number??0;
export function lapSourceLabel(session:Session,id:string):string {
  const context=videoSourceContext(session,id);if(!session.merge||!context)return '';
  const lap=context.sourceSession.laps.find(l=>l.id===context.sourcePrimaryId);
  return `${context.sourceSession.source.split(/[\\/]/).pop()||context.sourceSession.name} · original lap ${lap?.number??'—'}`;
}
export function channelSourceLabel(session:Session,id:string):string {
  const channel=session.merge?.preview.channels.find(c=>c.id===id);
  const source=session.merge?.sources.find(s=>s.sessionId===channel?.sourceSessionId);
  return source?.session.source.split(/[\\/]/).pop()??'';
}
