import type {PlaybackState, PlayerSnapshot, VideoPlayer} from './player';

interface YouTubeInstance {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(time: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
  getAvailablePlaybackRates(): number[];
  getCurrentTime(): number;
  getDuration(): number;
  getPlaybackRate(): number;
  destroy(): void;
}
interface YouTubeOptions {
  width: number;
  height: number;
  videoId: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady(): void;
    onStateChange(event: {data: number}): void;
    onPlaybackRateChange(): void;
    onError(event: {data: number}): void;
    onAutoplayBlocked(): void;
  };
}
interface YouTubeApi { Player: new(host: HTMLElement, options: YouTubeOptions) => YouTubeInstance }
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface ApiLoad { promise: Promise<YouTubeApi>; release(): void }
interface SharedLoad { promise: Promise<YouTubeApi>; references: number; cancel(): void }
const loads = new WeakMap<Window, SharedLoad>();

function retainLoad(load: SharedLoad): ApiLoad {
  load.references++;
  let released = false;
  return {promise: load.promise, release() {
    if (released) return;
    released = true;
    if (--load.references === 0) load.cancel();
  }};
}

function acquireApi(): ApiLoad {
  if (window.YT?.Player) return {promise: Promise.resolve(window.YT), release() {}};
  const existing = loads.get(window);
  if (existing) return retainLoad(existing);
  const targetWindow = window;
  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  script.async = true;
  const previous = targetWindow.onYouTubeIframeAPIReady;
  let settled = false;
  let rejectLoad: (reason: Error) => void;
  let timer: ReturnType<typeof setTimeout>;
  const cleanup = () => {
    clearTimeout(timer);
    script.removeEventListener('error', onError);
    script.remove();
    if (targetWindow.onYouTubeIframeAPIReady === onReady) targetWindow.onYouTubeIframeAPIReady = previous;
    loads.delete(targetWindow);
  };
  let resolveLoad: (api: YouTubeApi) => void;
  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectLoad(new Error(message));
  };
  const onError = () => fail('YouTube API script could not load. Check the network connection.');
  const onReady = () => {
    if (!targetWindow.YT?.Player) return;
    settled = true;
    cleanup();
    resolveLoad(targetWindow.YT);
    previous?.();
  };
  const promise = new Promise<YouTubeApi>((resolve, reject) => { resolveLoad = resolve; rejectLoad = reject; });
  const load: SharedLoad = {promise, references: 0, cancel: () => fail('YouTube player was disposed.')};
  loads.set(targetWindow, load);
  targetWindow.onYouTubeIframeAPIReady = onReady;
  script.addEventListener('error', onError);
  timer = setTimeout(() => fail('YouTube API script load timed out. Check the network connection.'), 15_000);
  document.head.appendChild(script);
  return retainLoad(load);
}

const errorMessages: Record<number, string> = {
  2: 'YouTube rejected the video ID (2).',
  5: 'YouTube cannot play this video in this WebView (5).',
  100: 'YouTube video is unavailable or private (100).',
  101: 'YouTube embedding is disabled for this video (101).',
  150: 'YouTube embedding is disabled for this video (150).',
  153: 'YouTube playback is unavailable (153): the WebView did not supply accepted client identity (HTTP Referer).',
};

/** Official IFrame API only. Two observations within 0.25 s are approximate, not frame accuracy. */
export function createYouTubePlayer(host: HTMLElement, videoId: string): VideoPlayer {
  let instance: YouTubeInstance | undefined;
  let mount: HTMLElement | undefined;
  let disposed = false;
  let isReady = false;
  let failure: Error | null = null;
  let state: PlaybackState = 'loading';
  let pendingSeek: { finish(error?: Error): void } | undefined;
  let pendingPlay: { finish(error?: Error): void } | undefined;
  let sample: PlayerSnapshot = {time: 0, duration: null, rate: 1, state, observedAtMs: performance.now(), seeking: false};
  const listeners = new Set<(snapshot: PlayerSnapshot) => void>();
  let resolveReady: () => void;
  let rejectReady: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  void ready.catch(() => {});
  const observe = () => {
    if (disposed) return;
    if (isReady && instance && !failure) {
      const duration = instance.getDuration();
      sample = {time: instance.getCurrentTime(), duration: duration > 0 ? duration : null,
        rate: instance.getPlaybackRate(), state, observedAtMs: performance.now(), seeking: !!pendingSeek};
    } else sample = {...sample, state, seeking: !!pendingSeek, observedAtMs: performance.now(), error: failure?.message};
    listeners.forEach(listener => listener({...sample}));
  };
  const fail = (error: Error) => {
    if (disposed || failure) return;
    failure = error; state = 'error';
    clearTimeout(readinessTimer); clearInterval(observationTimer);
    rejectReady(error); pendingSeek?.finish(error); pendingPlay?.finish(error); observe();
  };
  const readinessTimer = setTimeout(() => fail(new Error('YouTube player readiness timed out. Playback is unavailable.')), 15_000);
  const observationTimer = setInterval(observe, 50);
  const api = acquireApi();
  void api.promise.then(youtube => {
    if (disposed || failure) return;
    mount = document.createElement('div'); host.appendChild(mount);
    instance = new youtube.Player(mount, {
      width: 640, height: 360, videoId,
      playerVars: {autoplay: 0, controls: 1, playsinline: 1, origin: window.location.origin},
      events: {
        onReady() {
          if (disposed || failure) return;
          isReady = true; state = 'paused'; clearTimeout(readinessTimer); resolveReady(); observe();
        },
        onStateChange(event) {
          if (disposed || failure) return;
          const states: Record<number, PlaybackState> = {[-1]: 'paused', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'paused'};
          state = states[event.data] ?? 'loading';
          if (state === 'playing') pendingPlay?.finish();
          observe();
        },
        onPlaybackRateChange: observe,
        onError: event => fail(new Error(errorMessages[event.data] ?? `YouTube playback failed (${event.data}).`)),
        onAutoplayBlocked() {
          if (disposed || failure) return;
          state = 'paused';
          pendingPlay?.finish(new Error('YouTube playback was blocked. Use the native player play button.'));
          observe();
        },
      },
    });
  }).catch(error => fail(error instanceof Error ? error : new Error(String(error))));
  const requireReady = async () => {
    await ready;
    if (disposed) throw new Error('YouTube player was disposed.');
    if (failure) throw failure;
    return instance!;
  };
  const supportedRates = () => isReady && !disposed && !failure
    ? [...new Set(instance!.getAvailablePlaybackRates().filter(rate => Number.isFinite(rate) && rate >= .25 && rate <= 4))]
    : [];
  return {
    ready,
    play() {
      pendingPlay?.finish(new DOMException('Video play superseded.', 'AbortError'));
      return new Promise<void>((resolve, reject) => {
        if (disposed || failure) { reject(failure ?? new Error('YouTube player was disposed.')); return; }
        let settled = false;
        const timer = setTimeout(() => operation.finish(new Error('YouTube playback did not start. Use the native player play button.')), 5000);
        const operation = { finish(error?: Error) {
          if (settled) return;
          settled = true; clearTimeout(timer); if (pendingPlay === operation) pendingPlay = undefined;
          if (error) reject(error); else resolve();
        } };
        pendingPlay = operation;
        void ready.then(() => {
          if (settled) return;
          try { instance!.playVideo(); if (state === 'playing') operation.finish(); }
          catch (error) { operation.finish(error instanceof Error ? error : new Error(String(error))); }
        }, error => operation.finish(error));
      });
    },
    async pause() {
      pendingPlay?.finish(new DOMException('Video play cancelled.', 'AbortError'));
      const player = await requireReady(); player.pauseVideo();
    },
    async setRate(rate) {
      const player = await requireReady();
      if (!supportedRates().includes(rate)) throw new Error('This playback rate is not supported by the YouTube video.');
      player.setPlaybackRate(rate);
    },
    supportedRates,
    seek(time, signal) {
      pendingSeek?.finish(new DOMException('Video seek superseded.', 'AbortError'));
      return new Promise<void>((resolve, reject) => {
        if (disposed || failure) { reject(failure ?? new Error('YouTube player was disposed.')); return; }
        if (!Number.isFinite(time) || time < 0) { reject(new Error('Video seek time must be finite and nonnegative.')); return; }
        if (signal.aborted) { reject(new DOMException('Video seek cancelled.', 'AbortError')); return; }
        let settled = false;
        let matches = 0;
        let timer: ReturnType<typeof setInterval> | undefined;
        const timeout = setTimeout(() => operation.finish(new Error('Approximate YouTube seek timed out.')), 5000);
        const abort = () => operation.finish(new DOMException('Video seek cancelled.', 'AbortError'));
        const operation = { finish(error?: Error) {
          if (settled) return;
          settled = true; clearTimeout(timeout); clearInterval(timer); signal.removeEventListener('abort', abort);
          if (pendingSeek === operation) pendingSeek = undefined;
          observe(); if (error) reject(error); else resolve();
        } };
        pendingSeek = operation; signal.addEventListener('abort', abort, {once: true});
        void ready.then(() => {
          if (settled) return;
          const player = instance!;
          if (player.getDuration() > 0 && time > player.getDuration()) return operation.finish(new Error('Video seek time is beyond the video duration.'));
          try {
            player.seekTo(time, true); observe();
            timer = setInterval(() => {
              matches = Math.abs(player.getCurrentTime() - time) <= .25 ? matches + 1 : 0;
              if (matches >= 2) operation.finish();
            }, 50);
          } catch (error) { operation.finish(error instanceof Error ? error : new Error(String(error))); }
        }, error => operation.finish(error));
      });
    },
    snapshot: () => ({...sample}),
    subscribe(listener) { if (!disposed) listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      const error = new Error('YouTube player was disposed.');
      rejectReady(error); pendingSeek?.finish(error); pendingPlay?.finish(error);
      clearTimeout(readinessTimer); clearInterval(observationTimer);
      api.release(); instance?.destroy(); mount?.remove(); listeners.clear();
    },
  };
}
