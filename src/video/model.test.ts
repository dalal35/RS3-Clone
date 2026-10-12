import { describe, expect, it } from 'vitest';
import type { Lap, LapView } from '../types';
import {
  cursorToSessionTime, lapCoverage, lapMarkers, parseYouTubeUrl, sessionTimeToCursor,
  telemetryToVideo, validateSegments, videoToTelemetry,
  type VideoSegment,
} from './model';

const segmentA: VideoSegment = {
  id: 'A', videoStart: 0, videoEnd: 10, anchorVideoTime: 2,
  anchorTelemetryTime: 102, correctionSeconds: 0,
};
const segmentB: VideoSegment = {
  id: 'B', videoStart: 10, videoEnd: 20, anchorVideoTime: 10,
  anchorTelemetryTime: 200, correctionSeconds: 0,
};
const segments = [segmentA, segmentB];
const lap = (id: string, start: number, end: number, number = 1): Lap => ({
  id, number, start, end, duration: end - start, complete: true,
});
const laps = [lap('lap1', 100, 105), lap('lap2', 105, 110, 2), lap('lap3', 200, 210, 3)];
const mapped = (time: number, segmentId = 'A') => ({ kind: 'mapped', time, segmentId });
const unavailable = { kind: 'unavailable' };

describe('edited segment mapping', () => {
  it('maps independent cuts without filling skipped telemetry or the final endpoint', () => {
    expect(videoToTelemetry(segments, 0)).toEqual(mapped(100));
    expect(videoToTelemetry(segments, 9)).toEqual(mapped(109));
    expect(videoToTelemetry(segments, 10)).toEqual(mapped(200, 'B'));
    expect(videoToTelemetry(segments, 20)).toEqual(unavailable);
    expect(telemetryToVideo(segments, 105)).toEqual(mapped(5));
    expect(telemetryToVideo(segments, 150)).toEqual(unavailable);
    expect(telemetryToVideo(segments, 205)).toEqual(mapped(15, 'B'));
    expect(telemetryToVideo(segments, 110)).toEqual(unavailable);
  });

  it('preserves gaps and works without mutating an unsorted segment array', () => {
    const input = [{ ...segmentB, videoStart: 12, anchorVideoTime: 12 }, segmentA];
    expect(videoToTelemetry(input, 11)).toEqual(unavailable);
    expect(videoToTelemetry(input, 12)).toEqual(mapped(200, 'B'));
    expect(input.map(s => s.id)).toEqual(['B', 'A']);
    expect(validateSegments(input, laps, 20)).toEqual([]);
  });

  it('does not choose repeated footage implicitly', () => {
    const repeated = [segmentA, { ...segmentB, anchorTelemetryTime: 100 }];
    expect(telemetryToVideo(repeated, 105)).toEqual({ kind: 'ambiguous', segmentIds: ['A', 'B'] });
    expect(telemetryToVideo(repeated, 105, 'B')).toEqual(mapped(15, 'B'));
    expect(telemetryToVideo(repeated, 105, 'missing')).toEqual(unavailable);
    expect(telemetryToVideo(segments, 205, 'A')).toEqual(unavailable);
  });

  it('rejects nonfinite lookup inputs and malformed segments', () => {
    for (const time of [NaN, Infinity, -Infinity]) {
      expect(videoToTelemetry(segments, time)).toEqual(unavailable);
      expect(telemetryToVideo(segments, time)).toEqual(unavailable);
    }
    expect(videoToTelemetry([{ ...segmentA, correctionSeconds: NaN }], 5)).toEqual(unavailable);
    expect(telemetryToVideo([{ ...segmentA, videoEnd: Infinity }], 105)).toEqual(unavailable);
  });

  it('does not pick an arbitrary forward match for invalid overlapping footage', () => {
    expect(videoToTelemetry([segmentA, { ...segmentB, videoStart: 5, anchorVideoTime: 5 }], 7))
      .toEqual({ kind: 'ambiguous', segmentIds: ['A', 'B'] });
  });

  it('applies positive correction to telemetry and subtracts it in reverse', () => {
    const corrected = [{ ...segmentA, correctionSeconds: 0.1 }];
    expect(videoToTelemetry(corrected, 5)).toEqual(mapped(105.1));
    expect(telemetryToVideo(corrected, 105)).toMatchObject({ kind: 'mapped', segmentId: 'A' });
    const result = telemetryToVideo(corrected, 105);
    if (result.kind === 'mapped') expect(result.time).toBeCloseTo(4.9);
  });
});

describe('segment validation', () => {
  it('accepts adjacent segments and unmodified anchor lap references', () => {
    expect(validateSegments([{ ...segmentA, anchorLapId: 'lap1' }, segmentB], laps, 20)).toEqual([]);
  });

  it.each([
    ['overlap', [{ ...segmentA, videoEnd: 11 }, segmentB]],
    ['duplicate ID', [segmentA, { ...segmentB, id: 'A' }]],
    ['empty ID', [{ ...segmentA, id: '' }]],
    ['negative boundary', [{ ...segmentA, videoStart: -1 }]],
    ['zero length', [{ ...segmentA, videoEnd: 0 }]],
    ['reversed interval', [{ ...segmentA, videoStart: 3, videoEnd: 2 }]],
    ['anchor before interval', [{ ...segmentA, anchorVideoTime: -1 }]],
    ['anchor at excluded endpoint', [{ ...segmentA, anchorVideoTime: 10 }]],
    ['telemetry anchor outside laps', [{ ...segmentA, anchorTelemetryTime: 150 }]],
    ['unknown anchor lap', [{ ...segmentA, anchorLapId: 'missing' }]],
    ['NaN boundary', [{ ...segmentA, videoStart: NaN }]],
    ['infinite end', [{ ...segmentA, videoEnd: Infinity }]],
    ['NaN anchor', [{ ...segmentA, anchorTelemetryTime: NaN }]],
    ['infinite anchor', [{ ...segmentA, anchorVideoTime: Infinity }]],
    ['NaN correction', [{ ...segmentA, correctionSeconds: NaN }]],
  ])('reports %s', (_name, input) => {
    expect(validateSegments(input as VideoSegment[], laps, 20).length).toBeGreaterThan(0);
  });

  it('rejects boundaries beyond duration and invalid durations', () => {
    expect(validateSegments(segments, laps, 19).length).toBeGreaterThan(0);
    for (const duration of [NaN, Infinity, -1]) {
      expect(validateSegments(segments, laps, duration).length).toBeGreaterThan(0);
    }
    expect(validateSegments([segmentA], [], 20).length).toBeGreaterThan(0);
  });
});

describe('recorded lap propagation', () => {
  it('places markers at each covered recorded start, respecting half-open cuts', () => {
    expect(lapMarkers(segments, laps)).toEqual([
      { segmentId: 'A', lapId: 'lap1', lapNumber: 1, videoTime: 0 },
      { segmentId: 'A', lapId: 'lap2', lapNumber: 2, videoTime: 5 },
      { segmentId: 'B', lapId: 'lap3', lapNumber: 3, videoTime: 10 },
    ]);
    const contiguous = [segmentA, { ...segmentB, anchorTelemetryTime: 110 }];
    expect(lapMarkers(contiguous, [lap('cut', 110, 115)]))
      .toEqual([{ segmentId: 'B', lapId: 'cut', lapNumber: 1, videoTime: 10 }]);
  });

  it('moves only the corrected segment markers earlier for positive correction', () => {
    const corrected = [{ ...segmentA, correctionSeconds: 0.1 }, segmentB];
    const markers = lapMarkers(corrected, laps);
    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({ segmentId: 'A', lapId: 'lap2' });
    expect(markers[0].videoTime).toBeCloseTo(4.9);
    expect(markers[1].videoTime).toBe(10);
  });

  it('derives full, partial and absent coverage from interval unions', () => {
    const coverageLaps = [...laps, lap('partial', 108, 112), lap('none', 150, 160), lap('endpoint', 110, 111)];
    expect(lapCoverage(segments, coverageLaps)).toEqual({
      lap1: 'full', lap2: 'full', lap3: 'full', partial: 'partial', none: 'none', endpoint: 'none',
    });
    const contiguous = [segmentA, { ...segmentB, anchorTelemetryTime: 110 }];
    expect(lapCoverage(contiguous, [lap('joined', 100, 120)])).toEqual({ joined: 'full' });
    expect(lapCoverage([segmentA, { ...segmentB, anchorTelemetryTime: 111 }], [lap('gap', 100, 120)]))
      .toEqual({ gap: 'partial' });
  });
});

const axisLap = lap('axis', 100, 110);
const view: LapView = {
  lapId: 'axis', duration: 10, length: 100, series: [], track: [], warnings: [],
  mapping: [{ meters: 0, time: 0 }, { meters: 50, time: 5 }, { meters: 100, time: 10 }],
};

describe('absolute session and lap cursor conversion', () => {
  it('projects both axes and reverses interpolated positions', () => {
    expect(sessionTimeToCursor(105, axisLap, view, 'time')).toBe(5);
    expect(sessionTimeToCursor(105, axisLap, view, 'distance')).toBe(50);
    expect(cursorToSessionTime(5, axisLap, view, 'time')).toBe(105);
    expect(cursorToSessionTime(50, axisLap, view, 'distance')).toBe(105);
    expect(sessionTimeToCursor(102.5, axisLap, view, 'distance')).toBe(25);
    expect(cursorToSessionTime(25, axisLap, view, 'distance')).toBe(102.5);
    expect(sessionTimeToCursor(100, axisLap, view, 'distance')).toBe(0);
    expect(cursorToSessionTime(100, axisLap, view, 'distance')).toBe(110);
  });

  it('never extrapolates, clamps or substitutes normalized distance', () => {
    for (const time of [99, 111, NaN, Infinity]) {
      expect(sessionTimeToCursor(time, axisLap, view, 'time')).toBeNull();
      expect(sessionTimeToCursor(time, axisLap, view, 'distance')).toBeNull();
    }
    for (const cursor of [-1, 101, NaN, Infinity]) {
      expect(cursorToSessionTime(cursor, axisLap, view, 'distance')).toBeNull();
    }
    expect(cursorToSessionTime(11, axisLap, view, 'time')).toBeNull();
    const truncated = { ...view, mapping: view.mapping.slice(1) };
    expect(sessionTimeToCursor(102, axisLap, truncated, 'distance')).toBeNull();
    expect(cursorToSessionTime(20, axisLap, truncated, 'distance')).toBeNull();
    expect(sessionTimeToCursor(105, axisLap, { ...view, mapping: [] }, 'distance')).toBeNull();
    expect(sessionTimeToCursor(105, axisLap, { ...view, mapping: [] }, 'time')).toBe(5);
    expect(sessionTimeToCursor(105, axisLap, { ...view, lapId: 'old' }, 'time')).toBeNull();
  });

  it('rejects invalid or nonmonotonic distance mappings', () => {
    for (const mapping of [
      [{ meters: 0, time: 0 }, { meters: NaN, time: 5 }],
      [{ meters: 0, time: 0 }, { meters: 10, time: 0 }],
      [{ meters: 0, time: 0 }, { meters: 0, time: 5 }],
      [{ meters: 10, time: 0 }, { meters: 0, time: 5 }],
    ]) {
      expect(sessionTimeToCursor(102, axisLap, { ...view, mapping }, 'distance')).toBeNull();
      expect(cursorToSessionTime(5, axisLap, { ...view, mapping }, 'distance')).toBeNull();
    }
  });
});

describe('YouTube source parsing', () => {
  it.each([
    'https://www.youtube.com/watch?v=M7lc1UVf-VE',
    'https://youtube.com/watch?v=M7lc1UVf-VE&feature=share&t=5',
    'https://m.youtube.com/watch?v=M7lc1UVf-VE',
    'https://youtu.be/M7lc1UVf-VE?si=example',
    'https://www.youtube.com/shorts/M7lc1UVf-VE',
    'https://www.youtube.com/embed/M7lc1UVf-VE',
    'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE',
  ])('accepts official URL %s', input => {
    expect(parseYouTubeUrl(input)).toEqual({ type: 'youtube', videoId: 'M7lc1UVf-VE', url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE' });
  });

  it.each([
    'https://youtube.com.evil.test/watch?v=M7lc1UVf-VE',
    'https://evilyoutube.com/watch?v=M7lc1UVf-VE',
    'https://youtube.com@evil.test/watch?v=M7lc1UVf-VE',
    'https://evil.test@youtube.com/watch?v=M7lc1UVf-VE',
    'javascript:alert(1)', 'file:///watch?v=M7lc1UVf-VE',
    'https://youtube.com/watch?v=short', 'https://youtu.be/M7lc1UVf-V!',
    'https://youtu.be/M7lc1UVf-VE/extra', 'https://youtube.com/watch?v=M7lc1UVf-VE&v=aaaaaaaaaaa',
    'https://youtube.com:8443/watch?v=M7lc1UVf-VE', 'not a URL',
  ])('rejects malformed or unofficial URL %s', input => {
    expect(parseYouTubeUrl(input)).toBeNull();
  });
});
