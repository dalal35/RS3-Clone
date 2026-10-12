import { describe, expect, it, vi } from 'vitest';
import { createSyncController } from './controller';
import type { PlayerSnapshot, VideoPlayer } from './player';
import type { VideoSegment } from './model';

const segment: VideoSegment = { id: 'one', videoStart: 0, videoEnd: 30, anchorVideoTime: 0, anchorTelemetryTime: 100, correctionSeconds: 0 };
function fixture() {
  let now = 0;
  let sample: PlayerSnapshot = { time: 5, duration: 60, rate: 2, state: 'playing', seeking: false, observedAtMs: 0 };
  let listener: ((value: PlayerSnapshot) => void) | undefined;
  const requests: { time: number; signal: AbortSignal; resolve: () => void; reject: (error: Error) => void }[] = [];
  const player: VideoPlayer = {
    ready: Promise.resolve(), snapshot: () => ({ ...sample }), supportedRates: () => [1, 2],
    pause: vi.fn(async () => {}), play: vi.fn(async () => {}), setRate: vi.fn(async () => {}), dispose: vi.fn(),
    subscribe: vi.fn(fn => { listener = fn; return unsubscribe; }),
    seek: vi.fn((time, signal) => new Promise<void>((resolve, reject) => { requests.push({ time, signal, resolve, reject }); })),
  };
  const unsubscribe = vi.fn();
  const onTime = vi.fn(); const onError = vi.fn();
  let segments = [segment];
  const controller = createSyncController(player, { nowMs: () => now, segments: () => segments, onTime, onError });
  return { controller, player, requests, onTime, onError, unsubscribe,
    now(value: number) { now = value; }, segments(value: VideoSegment[]) { segments = value; },
    observe(value: Partial<PlayerSnapshot>) { sample = { ...sample, observedAtMs: now, ...value }; listener?.(sample); },
  };
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('source clock controller', () => {
  it('predicts briefly at source rate, reconciles fresh samples, bounds cadence and horizon without seeking', () => {
    const f = fixture();
    f.controller.tick(); f.now(50); f.controller.tick();
    expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'mapped', segmentId: 'one', time: 105.1 });
    f.observe({ time: 5.04 }); f.now(100); f.controller.tick();
    expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'mapped', segmentId: 'one', time: 105.14 });
    f.now(110); f.controller.tick(); expect(f.onTime).toHaveBeenCalledTimes(3);
    f.now(1000); f.controller.tick();
    expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'mapped', segmentId: 'one', time: 105.24 });
    expect(f.player.seek).not.toHaveBeenCalled(); f.controller.dispose();
  });

  it.each(['buffering', 'paused'] as const)('resets prediction on %s and ignores out-of-order samples', state => {
    const f = fixture(); f.now(50); f.observe({ time: 6, state }); f.now(100); f.controller.tick();
    expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'mapped', segmentId: 'one', time: 106 });
    f.observe({ time: 20, state: 'playing', observedAtMs: 0 }); f.now(150); f.controller.tick();
    expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'mapped', segmentId: 'one', time: 106 });
    f.controller.dispose();
  });

  it('resets hidden prediction until a new visible observation arrives', () => {
    const f = fixture(); f.controller.setVisible(false); f.now(1000); f.controller.tick();
    expect(f.onTime).not.toHaveBeenCalled();
    f.controller.setVisible(true); f.controller.tick();
    expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'mapped', segmentId: 'one', time: 105 });
    f.now(1050); f.observe({ time: 8 }); f.now(1100); f.controller.tick();
    expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'mapped', segmentId: 'one', time: 108.1 }); f.controller.dispose();
  });

  it('superseded_seek_cannot_resume and pending source observations cannot publish', async () => {
    const f = fixture();
    const first = f.controller.seekTelemetry(110); await flush();
    const second = f.controller.seekTelemetry(120); await flush();
    expect(f.requests.map(r => r.time)).toEqual([10, 20]);
    expect(f.requests[0].signal.aborted).toBe(true);
    f.observe({ time: 1, state: 'paused' }); f.now(50); f.controller.tick(); expect(f.onTime).not.toHaveBeenCalled();
    f.requests[1].resolve(); expect(await second).toEqual({ kind: 'mapped', segmentId: 'one', time: 120 });
    f.requests[0].resolve(); await first;
    expect(f.player.play).toHaveBeenCalledTimes(1);
    expect(f.onTime.mock.calls).toEqual([[{ kind: 'mapped', segmentId: 'one', time: 120 }]]);
    // A pre-completion sample cannot overwrite the completed target.
    f.now(100); f.controller.tick();
    expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'mapped', segmentId: 'one', time: 120 });
    f.controller.dispose();
  });

  it('failed seek remains paused with a useful error', async () => {
    const f = fixture(); const seek = f.controller.seekVideo(12); await flush();
    f.requests[0].reject(new Error('Decode failed')); expect(await seek).toEqual({ kind: 'unavailable' });
    expect(f.player.play).not.toHaveBeenCalled(); expect(f.onError).toHaveBeenCalledWith('Decode failed');
    f.observe({ time: 4, state: 'paused' }); f.now(50); f.controller.tick();
    expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'unavailable' });
    f.observe({ time: 4, state: 'playing' }); f.now(100); f.controller.tick();
    expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'mapped', segmentId: 'one', time: 104.1 }); f.controller.dispose();
  });

  it('unavailable and ambiguous requests pause without seeking', async () => {
    const f = fixture(); expect(await f.controller.seekVideo(40)).toEqual({ kind: 'unavailable' });
    f.segments([segment, { ...segment, id: 'two', videoStart: 30, videoEnd: 60, anchorVideoTime: 30 }]);
    expect(await f.controller.seekTelemetry(110)).toEqual({ kind: 'ambiguous', segmentIds: ['one', 'two'] });
    expect(f.player.pause).toHaveBeenCalledTimes(2); expect(f.player.seek).not.toHaveBeenCalled(); f.controller.dispose();
  });

  it('uncovered explicit seeks retain unavailable ownership through reflected pauses until native playback restarts', async () => {
    const f = fixture(); await f.controller.seekTelemetry(999);
    f.now(50); f.controller.tick(); expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'unavailable' });
    f.observe({ time: 5, state: 'paused' }); f.now(100); f.controller.tick();
    expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'unavailable' }); expect(f.player.play).not.toHaveBeenCalled();
    f.observe({ time: 6, state: 'playing' }); f.now(150); f.controller.tick();
    expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'mapped', segmentId: 'one', time: 106.1 }); f.controller.dispose();
  });

  it('explicit reverse segment selection seeks once and returns session time', async () => {
    const f = fixture(); f.segments([segment, { ...segment, id: 'two', videoStart: 30, videoEnd: 60, anchorVideoTime: 30 }]);
    const seek = f.controller.seekTelemetry(110, 'two'); await flush(); expect(f.requests[0].time).toBe(40);
    f.requests[0].resolve(); expect(await seek).toEqual({ kind: 'mapped', segmentId: 'two', time: 110 }); f.controller.dispose();
  });

  it('dispose aborts pending work, unsubscribes once and never resumes or publishes', async () => {
    const f = fixture(); const seek = f.controller.seekVideo(10); await flush();
    f.controller.dispose(); f.controller.dispose(); expect(f.requests[0].signal.aborted).toBe(true);
    expect(await seek).toEqual({ kind: 'unavailable' }); f.requests[0].resolve(); await flush();
    expect(f.player.play).not.toHaveBeenCalled(); expect(f.onTime).not.toHaveBeenCalled(); expect(f.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('a stuck seek times out, aborts the adapter and stays paused', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(); const seek = f.controller.seekVideo(10); await flush();
      await vi.advanceTimersByTimeAsync(5000); expect(await seek).toEqual({ kind: 'unavailable' });
      expect(f.requests[0].signal.aborted).toBe(true); expect(f.player.play).not.toHaveBeenCalled();
      expect(f.onError).toHaveBeenCalledWith(expect.stringMatching(/timed out/i)); f.controller.dispose();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('uses source error details after readiness and clears synchronized positions for error/loading clocks', () => {
    const f = fixture(); f.observe({ state: 'error', error: 'YouTube unavailable (153): client identity rejected.' });
    expect(f.onError).toHaveBeenLastCalledWith('YouTube unavailable (153): client identity rejected.');
    f.controller.tick(); expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'unavailable' });
    f.now(50); f.observe({ state: 'loading' }); f.controller.tick();
    expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'unavailable' }); f.controller.dispose();
  });

  it('resets rate prediction on observation and suppresses native pending seek samples', () => {
    const f = fixture(); f.now(50); f.observe({ time: 6, rate: .5 }); f.now(100); f.controller.tick();
    expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'mapped', segmentId: 'one', time: 106.025 });
    f.now(150); f.observe({ seeking: true }); f.controller.tick(); expect(f.onTime).toHaveBeenCalledTimes(1);
    f.now(200); f.observe({ time: 8, seeking: false, state: 'paused' }); f.controller.tick();
    expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'mapped', segmentId: 'one', time: 108 }); f.controller.dispose();
  });

  it('bounds the whole seek when readiness or pause stalls', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(); let releasePause: () => void;
      vi.mocked(f.player.pause).mockImplementationOnce(() => new Promise<void>(resolve => { releasePause = resolve; }));
      const seek = f.controller.seekVideo(10); await vi.advanceTimersByTimeAsync(5000);
      expect(await seek).toEqual({ kind: 'unavailable' });
      expect(f.onError).toHaveBeenCalledWith(expect.stringMatching(/timed out/i));
      expect(f.player.seek).not.toHaveBeenCalled(); f.controller.dispose(); releasePause!(); await flush();
      expect(f.player.seek).not.toHaveBeenCalled(); expect(f.player.play).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('reports errors arriving after readiness and publishes unmapped native scrub positions as unavailable', () => {
    const f = fixture(); f.observe({ state: 'error' }); expect(f.onError).toHaveBeenCalledWith(expect.stringMatching(/playback/i));
    f.observe({ time: 40, state: 'paused' }); f.controller.tick(); expect(f.onTime).toHaveBeenLastCalledWith({ kind: 'unavailable' }); f.controller.dispose();
  });
});
