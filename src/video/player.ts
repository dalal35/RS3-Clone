export type PlaybackState = 'loading' | 'paused' | 'playing' | 'buffering' | 'ended' | 'error';

export interface PlayerSnapshot {
  time: number;
  duration: number | null;
  rate: number;
  state: PlaybackState;
  observedAtMs: number;
  seeking: boolean;
}

export interface VideoPlayer {
  ready: Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(time: number, signal: AbortSignal): Promise<void>;
  setRate(rate: number): Promise<void>;
  supportedRates(): number[];
  snapshot(): PlayerSnapshot;
  subscribe(listener: (snapshot: PlayerSnapshot) => void): () => void;
  dispose(): void;
}
