export interface Channel { id: string; name: string; unit: string; times: number[]; values: number[]; gaps?:[number,number][] }
export interface Lap { id: string; number: number; start: number; end: number; duration: number; complete: boolean }
export interface Session { merge?:MergeInfo; id: string; source: string; name: string; driver: string; track: string; recordedAt: string; channels: Channel[]; laps: Lap[]; warnings: string[] }
export interface Series { channelId: string; name: string; unit: string; x: number[]; values: number[]; gaps?: [number, number][] }
export interface TrackPoint { breakBefore?:boolean; x: number; y: number; position: number; speed: number | null }
export interface PositionTime { meters: number; time: number }
export interface SegmentMetrics { elapsed: number | null; entrySpeed: number | null; minSpeed: number | null; exitSpeed: number | null; channels: {channelId:string;name:string;unit:string;mean:number|null}[] }
export interface TrackSegment { id:string; label:string; kind:'corner'|'straight'; start:number; end:number; startMeters:number; endMeters:number; uncertaintyMeters:number; primary:SegmentMetrics; comparison:SegmentMetrics|null; deltaSeconds:number|null }
export interface LapView { mapping: PositionTime[]; lapId: string; duration: number; length: number | null; series: Series[]; track: TrackPoint[]; warnings: string[] }
export interface Analysis { cornerBoundaries?:number[]|null; primary: LapView; comparison: LapView | null; alignment: { method:'spatial'|'estimated'|'unavailable'; referenceLength:number|null;positionUncertaintyM:number|null;timingUncertaintyS:number|null;coverage:number;notes:string[] }; segments:TrackSegment[]; delta: { x: number[]; values: number[]; method:'spatial'|'estimated'; uncertaintySeconds:number|null } | null; warnings: string[] }
export type Axis = 'distance' | 'time';
export interface LibraryEntry {mergeSources?:SourceRef[];id:string;contentVersion:string;source:string;name:string;driver:string;track:string;recordedAt:string;lapCount:number;channelCount:number;status:'ready'|'missing'|'modified';workspace:unknown;lastUsed:number}
export interface LibrarySnapshot {entries:LibraryEntry[];activeSessionId:string|null;warnings:string[]}
export interface AdvancedPoint {sourceTime:number;position:number|null;x:number;y:number;color:number|null}
export interface AdvancedStats {count:number;duration:number;min:number|null;max:number|null;mean:number|null;median:number|null;p05:number|null;p95:number|null;absoluteP95:number|null}
export interface AdvancedEvent {id:string;lapId:string;kind:string;evidence:string;sourceTime:number;endTime:number;position:number|null;endPosition:number|null;rpmBefore:number|null;rpmAfter:number|null;rpmChange:number|null;minRpm:number|null;duration:number|null;recoveryTime:number|null;cornerId:string|null}
export interface AdvancedLap {lapId:string;points:AdvancedPoint[];stats:AdvancedStats;yStats?:AdvancedStats;histogram:{low:number;high:number;value:number}[];events:AdvancedEvent[];excludedCount:number;unsupportedCount?:number}
export interface AdvancedResult {tool:string;xUnit:string;yUnit:string;laps:AdvancedLap[];notes:string[]}

export interface SourceRef {sessionId:string;contentVersion:string}
export interface MergedLap extends Lap {sourceSessionId:string;sourceLapId:string;displayNumber:number}
export interface MergedChannel extends Channel {sourceSessionId:string;sourceChannelId:string}
export interface MergePreview {sources:SourceRef[];day:string;laps:MergedLap[];channels:MergedChannel[];warnings:string[];previewVersion:string}

export interface MergeSource extends SourceRef {session:Session}
export interface MergeInfo {preview:MergePreview;sources:MergeSource[]}
