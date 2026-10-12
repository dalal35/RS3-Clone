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
export async function analyzeSession(sessionId: string, primaryId: string, comparisonId: string | null, axis: Axis, channelIds: string[],formulas:import('./advancedState').Formula[]=[]): Promise<Analysis> {
  return invoke<Analysis>('analyze_session', { sessionId, primaryId, comparisonId, axis, channelIds,formulas });
}
export const analyzeAdvanced=(sessionId:string,primaryId:string,comparisonId:string|null,axis:Axis,request:import('./advancedState').AdvancedConfig,formulas:import('./advancedState').Formula[])=>invoke<import('./types').AdvancedResult>('analyze_advanced',{sessionId,primaryId,comparisonId,axis,request,formulas});
export const validateFormulas=(sessionId:string,formulas:import('./advancedState').Formula[])=>invoke<{id:string;name:string;unit:string}[]>('validate_formulas',{sessionId,formulas});
export async function subscribeFileDrop(callback: (paths: string[]) => void): Promise<() => void> {
  if (!isNative) return () => {};
  return getCurrentWebview().onDragDropEvent(event => {
    if (event.payload.type === 'drop') callback(event.payload.paths);
  });
}
export async function librarySnapshot(){return isNative?invoke<import('./types').LibrarySnapshot>('library_snapshot'):{entries:[],activeSessionId:null,warnings:[]};}
export const loadSession=(sessionId:string)=>invoke<Session>('load_library_session',{sessionId});
export const saveWorkspace=(sessionId:string,workspace:import('./workspace').Workspace)=>invoke<void>('save_workspace',{sessionId,workspace,expectedContentVersion:workspace.contentVersion});
export const removeSession=(sessionId:string)=>invoke<import('./types').LibrarySnapshot>('remove_library_session',{sessionId});
export const refreshSession=(sessionId:string)=>invoke<Session>('refresh_library_session',{sessionId});
export async function locateSession(sessionId:string){const path=await open({multiple:false,directory:false,filters:[{name:'AiM telemetry',extensions:['xrk']}]});return typeof path==='string'?invoke<Session>('locate_library_session',{sessionId,path}):null;}
export const setCornerBoundaries=(sessionId:string,primaryId:string,boundaries:number[]|null)=>invoke<void>('set_corner_boundaries',{sessionId,primaryId,boundaries});
