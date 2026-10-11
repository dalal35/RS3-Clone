export interface Channel { id: string; name: string; unit: string; times: number[]; values: number[] }
export interface Lap { id: string; number: number; start: number; end: number; duration: number; complete: boolean }
export interface Session { id: string; source: string; name: string; driver: string; track: string; recordedAt: string; channels: Channel[]; laps: Lap[]; warnings: string[] }
export interface Series { channelId: string; name: string; unit: string; x: number[]; values: number[]; gaps?: [number, number][] }
export interface TrackPoint { x: number; y: number; position: number; speed: number | null }
export interface LapView { lapId: string; duration: number; length: number | null; series: Series[]; track: TrackPoint[]; warnings: string[] }
export interface Analysis { primary: LapView; comparison: LapView | null; delta: { x: number[]; values: number[] } | null; warnings: string[] }
export type Axis = 'distance' | 'time';
