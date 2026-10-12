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
