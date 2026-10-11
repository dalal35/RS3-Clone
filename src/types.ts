export interface Channel { id: string; name: string; unit: string; times: number[]; values: number[] }
export interface Lap { id: string; number: number; start: number; end: number; duration: number; complete: boolean }
export interface Session { id: string; source: string; name: string; driver: string; track: string; recordedAt: string; channels: Channel[]; laps: Lap[]; warnings: string[] }
export interface Series { channelId: string; name: string; unit: string; x: number[]; values: number[]; gaps?: [number, number][] }
export interface TrackPoint { breakBefore?:boolean; x: number; y: number; position: number; speed: number | null }
export interface PositionTime { meters: number; time: number }
export interface SegmentMetrics { elapsed: number | null; entrySpeed: number | null; minSpeed: number | null; exitSpeed: number | null; channels: {channelId:string;name:string;unit:string;mean:number|null}[] }
export interface TrackSegment { id:string; label:string; kind:'corner'|'straight'; start:number; end:number; startMeters:number; endMeters:number; uncertaintyMeters:number; primary:SegmentMetrics; comparison:SegmentMetrics|null; deltaSeconds:number|null }
export interface LapView { mapping: PositionTime[]; lapId: string; duration: number; length: number | null; series: Series[]; track: TrackPoint[]; warnings: string[] }
export interface Analysis { primary: LapView; comparison: LapView | null; alignment: { method:'spatial'|'estimated'|'unavailable'; referenceLength:number|null;positionUncertaintyM:number|null;timingUncertaintyS:number|null;coverage:number;notes:string[] }; segments:TrackSegment[]; delta: { x: number[]; values: number[]; method:'spatial'|'estimated'; uncertaintySeconds:number|null } | null; warnings: string[] }
export type Axis = 'distance' | 'time';
