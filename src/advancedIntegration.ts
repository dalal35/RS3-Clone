import type {AdvancedEvent,Analysis,Axis,Channel} from './types';
import type {Tool} from './advancedState';

// Rust returns spatial comparison positions in the primary reference frame.
export function inspectableAdvancedPosition(lapId:string,position:number|null,analysis:Analysis):number|null {
 if(position==null||!Number.isFinite(position))return null;
 if(lapId===analysis.primary.lapId)return position;
 return lapId===analysis.comparison?.lapId&&analysis.alignment.method==='spatial'?position:null;
}

export function advancedEventWindow(event:AdvancedEvent,axis:Axis,bounds:{min:number;max:number}):{min:number;max:number}|null {
 const start=event.position;
 if(start==null||!Number.isFinite(start)||!Number.isFinite(bounds.min)||!Number.isFinite(bounds.max)||bounds.max<=bounds.min||start<bounds.min||start>bounds.max)return null;
 const end=event.endPosition!=null&&Number.isFinite(event.endPosition)?Math.max(start,event.endPosition):start;
 const padding=axis==='time'?2:20;
 return {min:Math.max(bounds.min,start-padding),max:Math.min(bounds.max,end+padding)};
}

export function advancedContextChannels(selected:string[],channels:Channel[],view:string|undefined,tool:Tool):string[] {
 if(view!=='advanced'&&view!=='video')return selected;
 const rpm=channels.find(c=>/rpm|engine.*(speed|revs)/i.test(c.name));
 const speed=view==='advanced'&&(tool==='shifts'||tool==='bog')?(channels.find(c=>c.id==='gps-speed')??channels.find(c=>/speed/i.test(c.name))):undefined;
 return [...new Set([...selected,...(rpm?[rpm.id]:[]),...(speed?[speed.id]:[])])];
}
