import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import type { Analysis, Axis, Session } from './types';
export const isNative = isTauri();
export async function importPaths(paths: string[]): Promise<Session[]> {
  if (!isNative) throw new Error('Open the native macOS app to import XRK files.');
  const results: Session[] = [];
  const errors: string[] = [];
  for (const path of paths) {
    try { results.push(await invoke<Session>('import_session', { path })); }
    catch (error) { errors.push(String(error)); }
  }
  if (errors.length && !results.length) throw new Error(errors.join('\n'));
  if (errors.length) results[0].warnings.push(...errors);
  return results;
}
export async function importFiles(): Promise<Session[]> {
  if (!isNative) throw new Error('Open the native macOS app to import XRK files.');
  const selected = await open({ multiple: true, directory: false, filters: [{ name: 'AiM telemetry', extensions: ['xrk'] }] });
  return selected ? importPaths(Array.isArray(selected) ? selected : [selected]) : [];
}
export async function analyzeSession(sessionId: string, primaryId: string, comparisonId: string | null, axis: Axis, channelIds: string[]): Promise<Analysis> {
  return invoke<Analysis>('analyze_session', { sessionId, primaryId, comparisonId, axis, channelIds });
}
export async function subscribeFileDrop(callback: (paths: string[]) => void): Promise<() => void> {
  if (!isNative) return () => {};
  return getCurrentWebview().onDragDropEvent(event => {
    if (event.payload.type === 'drop') callback(event.payload.paths);
  });
}
