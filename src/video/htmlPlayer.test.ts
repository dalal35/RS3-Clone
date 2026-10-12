import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ open: vi.fn(), invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: native.invoke }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: native.open }));

import { authorizeLocalVideo, pickLocalVideo } from '../bridge';

describe('native local video picker bridge', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns null on cancellation without authorizing or replacing the attached source', async () => {
    native.open.mockResolvedValue(null);
    const current = { type: 'local', path: '/tmp/current.mp4', size: 16, modifiedMs: 100 };
    let attached = current;
    const selected = await pickLocalVideo();
    if (selected) attached = { type: 'local', ...selected };
    expect(selected).toBeNull();
    expect(attached).toBe(current);
    expect(native.invoke).not.toHaveBeenCalled();
  });

  it('authorizes a selected path once and returns canonical metadata', async () => {
    native.open.mockResolvedValue('/tmp/走行.MP4');
    native.invoke.mockResolvedValue({ path: '/private/tmp/走行.MP4', size: 16, modifiedMs: 100, status: 'ready' });
    expect(await pickLocalVideo()).toEqual({ path: '/private/tmp/走行.MP4', size: 16, modifiedMs: 100, status: 'ready' });
    expect(native.open).toHaveBeenCalledWith({ multiple: false, directory: false, filters: [{ name: 'Local video', extensions: ['mp4', 'mov'] }] });
    expect(native.invoke).toHaveBeenCalledExactlyOnceWith('authorize_local_video', { path: '/tmp/走行.MP4' });
  });

  it('reauthorizes saved references through the same validator and preserves missing status', async () => {
    native.invoke.mockResolvedValue({ path: '/tmp/moved.mov', size: 0, modifiedMs: 0, status: 'missing' });
    expect(await authorizeLocalVideo('/tmp/moved.mov')).toEqual({ path: '/tmp/moved.mov', size: 0, modifiedMs: 0, status: 'missing' });
    expect(native.invoke).toHaveBeenCalledExactlyOnceWith('authorize_local_video', { path: '/tmp/moved.mov' });
    expect(native.open).not.toHaveBeenCalled();
    native.invoke.mockRejectedValueOnce('Unreadable local video');
    await expect(authorizeLocalVideo('/tmp/unreadable.mp4')).rejects.toBe('Unreadable local video');
  });
});
