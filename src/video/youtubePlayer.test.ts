import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createYouTubePlayer} from './youtubePlayer';

class ElementStub extends EventTarget {
  src = '';
  async = false;
  removed = false;
  remove() { this.removed = true; }
  appendChild(child: ElementStub) { return child; }
}

describe('official YouTube API loader', () => {
  let scripts: ElementStub[];
  let host: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers();
    scripts = [];
    host = new ElementStub() as unknown as HTMLElement;
    vi.stubGlobal('window', {location: {origin: 'http://127.0.0.1:1420'}});
    vi.stubGlobal('document', {
      createElement: () => new ElementStub(),
      head: {appendChild: (script: ElementStub) => { scripts.push(script); return script; }},
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('reports API script failure instead of hanging', async () => {
    const player = createYouTubePlayer(host, 'M7lc1UVf-VE');
    const rejected = expect(player.ready).rejects.toThrow(/YouTube.*script.*load/i);
    expect(scripts[0].src).toBe('https://www.youtube.com/iframe_api');
    scripts[0].dispatchEvent(new Event('error'));
    await rejected;
    expect(player.snapshot().state).toBe('error');
    player.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds readiness when the API never responds', async () => {
    const player = createYouTubePlayer(host, 'M7lc1UVf-VE');
    const rejected = expect(player.ready).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(player.snapshot().state).toBe('error');
    player.dispose();
  });

  it('disposal rejects pending readiness and releases the script and callback', async () => {
    const player = createYouTubePlayer(host, 'M7lc1UVf-VE');
    const rejected = expect(player.ready).rejects.toThrow(/disposed/i);
    player.dispose();
    await rejected;
    expect(scripts[0].removed).toBe(true);
    expect(window.onYouTubeIframeAPIReady).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposing one pending player does not cancel another player API load', async () => {
    const first = createYouTubePlayer(host, 'M7lc1UVf-VE');
    const second = createYouTubePlayer(host, 'M7lc1UVf-VE');
    const firstRejected = expect(first.ready).rejects.toThrow(/disposed/i);
    first.dispose();
    await firstRejected;
    expect(scripts).toHaveLength(1);
    expect(scripts[0].removed).toBe(false);
    const secondRejected = expect(second.ready).rejects.toThrow(/script.*load/i);
    scripts[0].dispatchEvent(new Event('error'));
    await secondRejected;
    second.dispose();
  });

  it('reports native player error 153 without implying origin establishes identity', async () => {
    let onError: (event: {data: number}) => void;
    const api = {
      Player: class {
        constructor(_host: HTMLElement, options: {events: {onError: typeof onError}}) {
          onError = options.events.onError;
        }
        destroy() {}
      },
    };
    Object.assign(window, {YT: api});
    const player = createYouTubePlayer(host, 'M7lc1UVf-VE');
    const rejected = expect(player.ready).rejects.toThrow(/153.*identity/i);
    await Promise.resolve();
    onError!({data: 153});
    await rejected;
    expect(player.snapshot().state).toBe('error');
    await expect(player.play()).rejects.toThrow(/153/);
    player.dispose();
  });
});

describe('approximate YouTube playback adapter', () => {
  let host: HTMLElement;
  let events: { onReady(): void; onStateChange(event: { data: number }): void; onPlaybackRateChange(): void; onError(event: { data: number }): void; onAutoplayBlocked(): void };
  let time: number;
  let instance: { playVideo: ReturnType<typeof vi.fn>; pauseVideo: ReturnType<typeof vi.fn>; seekTo: ReturnType<typeof vi.fn>; setPlaybackRate: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    vi.useFakeTimers(); time = 0; host = new ElementStub() as unknown as HTMLElement;
    vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:1420' }, YT: {
      Player: class {
        constructor(_host: HTMLElement, options: { events: typeof events }) { events = options.events; instance = this; }
        playVideo = vi.fn(); pauseVideo = vi.fn(); seekTo = vi.fn(); setPlaybackRate = vi.fn(); destroy = vi.fn();
        getCurrentTime() { return time; } getDuration() { return 60; } getPlaybackRate() { return 1; }
        getAvailablePlaybackRates() { return [NaN, 0, .25, .5, 1, 1, 2, 4, 8]; }
      },
    } });
    vi.stubGlobal('document', { createElement: () => new ElementStub() });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  async function setup() {
    const player = createYouTubePlayer(host, 'M7lc1UVf-VE'); await Promise.resolve(); events.onReady(); await player.ready; return player;
  }

  it.each([100, 101, 150, 153])('surfaces post-ready native error %s and rejects pending operations immediately', async code => {
    const player = await setup(); const listener = vi.fn(); player.subscribe(listener);
    const seek = player.seek(10, new AbortController().signal); const rejected = expect(seek).rejects.toThrow(new RegExp(String(code)));
    await Promise.resolve(); events.onError({ data: code }); await rejected;
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'error', seeking: false, error: expect.stringContaining(String(code)) }));
    await expect(player.play()).rejects.toThrow(new RegExp(String(code))); player.dispose(); expect(vi.getTimerCount()).toBe(0);
  });

  it('filters supported rates and rejects unavailable rates', async () => {
    const player = await setup(); expect(player.supportedRates()).toEqual([.25, .5, 1, 2, 4]);
    await expect(player.setRate(1.5)).rejects.toThrow(/rate/i); await player.setRate(2);
    expect(instance.setPlaybackRate).toHaveBeenCalledExactlyOnceWith(2); player.dispose();
  });

  it('requires two nearby observations for approximate convergence and resets after a miss', async () => {
    const player = await setup(); let finished = false;
    const seek = player.seek(10, new AbortController().signal).then(() => { finished = true; }); await Promise.resolve();
    expect(instance.seekTo).toHaveBeenCalledExactlyOnceWith(10, true);
    time = 9.8; await vi.advanceTimersByTimeAsync(50); expect(finished).toBe(false);
    time = 9; await vi.advanceTimersByTimeAsync(50); time = 10.2; await vi.advanceTimersByTimeAsync(50); expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(50); await seek; expect(player.snapshot().seeking).toBe(false); player.dispose();
  });

  it('bounds approximate seek timeout at five seconds', async () => {
    const player = await setup(); const seek = player.seek(10, new AbortController().signal);
    const rejected = expect(seek).rejects.toThrow(/approximate.*timed out/i);
    await vi.advanceTimersByTimeAsync(5000); await rejected; expect(player.snapshot().seeking).toBe(false); player.dispose();
  });

  it('cancels older seeks without clearing newer seeking state and disposes immediately', async () => {
    const player = await setup(); const first = player.seek(10, new AbortController().signal);
    const cancelled = expect(first).rejects.toThrow(/superseded/i); await Promise.resolve();
    const second = player.seek(20, new AbortController().signal); const disposed = expect(second).rejects.toThrow(/disposed/i);
    await cancelled; expect(player.snapshot().seeking).toBe(true);
    player.dispose(); player.dispose(); await disposed;
    expect(instance.destroy).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a seek even before readiness without waiting for API loading', async () => {
    delete window.YT;
    vi.stubGlobal('document', { createElement: () => new ElementStub(), head: { appendChild: (child: ElementStub) => child } });
    const player = createYouTubePlayer(host, 'M7lc1UVf-VE'); const abort = new AbortController();
    const seek = player.seek(10, abort.signal); const rejected = expect(seek).rejects.toThrow(/cancel/i);
    abort.abort(); await rejected; player.dispose(); expect(vi.getTimerCount()).toBe(0);
  });

  it('autoplay blocking rejects play but native Play can recover without permanently failing the API', async () => {
    const player = await setup(); const play = player.play(); const blocked = expect(play).rejects.toThrow(/native.*play/i);
    await Promise.resolve(); events.onAutoplayBlocked(); await blocked;
    expect(player.snapshot().state).toBe('paused');
    events.onStateChange({ data: 1 }); expect(player.snapshot().state).toBe('playing');
    const retry = player.play(); await Promise.resolve(); events.onStateChange({ data: 1 }); await retry;
    expect(player.supportedRates()).toContain(1); player.dispose();
  });
});
