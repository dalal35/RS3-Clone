import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {Session} from './types';

const native = vi.hoisted(() => ({invoke: vi.fn(), open: vi.fn(), onDragDropEvent: vi.fn()}));
vi.mock('@tauri-apps/api/core', () => ({isTauri: () => true, invoke: native.invoke}));
vi.mock('@tauri-apps/api/webview', () => ({getCurrentWebview: () => ({onDragDropEvent: native.onDragDropEvent})}));
vi.mock('@tauri-apps/plugin-dialog', () => ({open: native.open}));
import {importFiles, importPaths, locateSession, pickLocalVideo, subscribeFileDrop} from './bridge';

const paths = [
  'C:\\Telemetry café\\走行 [final].xrk',
  '\\\\?\\C:\\Telemetry\\' + 'recording\\'.repeat(30) + '走行.xrk',
  '\\\\?\\UNC\\server\\laps\\走行.xrk',
];
const session = (source: string): Session => ({id: source, source, name: 'Recording', track: '', driver: '', recordedAt: '', warnings: [], laps: [], channels: []});
beforeEach(() => vi.resetAllMocks());

describe('Windows native file boundary', () => {
  it('imports every selected Windows path verbatim, including a long canonical path', async () => {
    expect(paths[1].length).toBeGreaterThan(260);
    native.open.mockResolvedValue(paths);
    native.invoke.mockImplementation(async (_command, args) => session(args.path));
    expect((await importFiles()).map(value => value.source)).toEqual(paths);
    expect(native.open).toHaveBeenCalledWith({multiple: true, directory: false, filters: [{name: 'AiM telemetry', extensions: ['xrk']}]});
    expect(native.invoke.mock.calls).toEqual(paths.map(path => ['import_session', {path}]));
  });
  it('treats cancelled import, Locate and video dialogs as no changes', async () => {
    native.open.mockResolvedValue(null);
    expect(await importFiles()).toEqual([]);
    expect(await locateSession('saved-session')).toBeNull();
    expect(await pickLocalVideo()).toBeNull();
    expect(native.invoke).not.toHaveBeenCalled();
  });
  it('passes a single selected file and missing-session replacement through intact', async () => {
    native.open.mockResolvedValue(paths[0]);
    native.invoke.mockResolvedValue(session(paths[0]));
    expect(await importFiles()).toEqual([session(paths[0])]);
    await locateSession('saved-session');
    expect(native.invoke).toHaveBeenLastCalledWith('locate_library_session', {sessionId: 'saved-session', path: paths[0]});
  });
  it('authorizes the selected local video without rewriting its Windows path', async () => {
    const path = '\\\\?\\UNC\\server\\laps\\走行 café [final].mov';
    const info = {path, size: 123, modifiedMs: 456, status: 'ready'};
    native.open.mockResolvedValue(path); native.invoke.mockResolvedValue(info);
    expect(await pickLocalVideo()).toEqual(info);
    expect(native.open).toHaveBeenCalledWith({multiple: false, directory: false, filters: [{name: 'Local video', extensions: ['mp4', 'mov']}]});
    expect(native.invoke).toHaveBeenCalledWith('authorize_local_video', {path});
  });
  it('retains successful imports and reports failures without stopping the queue', async () => {
    native.invoke.mockImplementation(async (_command, args) => {
      if (args.path === paths[1]) throw new Error('Unreadable XRK');
      return session(args.path);
    });
    const results = await importPaths(paths);
    expect(results.map(value => value.source)).toEqual([paths[0], paths[2]]);
    expect(results[0].warnings).toEqual(['Error: Unreadable XRK']);
    expect(native.invoke).toHaveBeenCalledTimes(3);
  });
  it('reports a wholly failed import instead of returning an empty successful result', async () => {
    native.invoke.mockRejectedValue(new Error('Unreadable XRK'));
    await expect(importPaths(paths)).rejects.toThrow('Unreadable XRK');
    expect(native.invoke).toHaveBeenCalledTimes(3);
  });
  it('forwards actual drop payloads intact and returns the native unsubscribe function', async () => {
    const unsubscribe = vi.fn();
    native.onDragDropEvent.mockResolvedValue(unsubscribe);
    const callback = vi.fn();
    expect(await subscribeFileDrop(callback)).toBe(unsubscribe);
    const listener = native.onDragDropEvent.mock.calls[0][0];
    for (const type of ['enter', 'over', 'leave']) listener({payload: {type, paths}});
    expect(callback).not.toHaveBeenCalled();
    listener({payload: {type: 'drop', paths}});
    expect(callback).toHaveBeenCalledExactlyOnceWith(paths);
  });
});
