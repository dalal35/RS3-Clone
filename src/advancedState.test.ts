import {describe,it,expect} from 'vitest';
import {restoreAdvanced,savePreset,applyPreset,removePreset,defaultAdvanced,changeTool} from './advancedState';
describe('advanced workspace persistence',()=>{
 it('migrates absent Milestone 4 state with 8200 RPM defaults',()=>{const s=restoreAdvanced(undefined);expect(s.config.bogThreshold).toBe(8200);expect(s.presets.length).toBe(5);expect(s.config.tool).toBe('traction');});
 it('preserves formulas while switching presets and restores last used',()=>{let s=defaultAdvanced();s.formulas=[{id:'math-rate',name:'Rate',expression:'derivative([rpm])'}];s=savePreset(s,'custom','Custom');s.config={...s.config,tool:'histogram'};s=applyPreset(s,'custom');expect(s.formulas).toHaveLength(1);expect(s.config.tool).toBe('traction');expect(restoreAdvanced(s).lastPreset).toBe('custom');});
 it('removes a default custom preset without leaving dangling IDs',()=>{let s=savePreset(defaultAdvanced(),'custom','Custom');s.defaultPreset='custom';s=removePreset(s,'custom');expect(s.defaultPreset).toBe('overview');expect(s.lastPreset).toBe('overview');});
 it('protects unsupported future schema from editing',()=>{const s=restoreAdvanced({version:99,payload:'future'});expect(s.readOnly).toBe(true);expect(s.raw).toEqual({version:99,payload:'future'});});
 it('rejects oversized edits and sanitizes invalid numeric settings',()=>{expect(()=>savePreset(defaultAdvanced(),'bad','x'.repeat(100000))).toThrow();expect(restoreAdvanced({version:1,config:{bogThreshold:-1,bins:Infinity}}).config.bogThreshold).toBe(8200);});
 it('presets retain graph axis and keep range coordinates labeled',()=>{let s=defaultAdvanced();expect(s.config.axis).toBe('distance');s.config.axis='time';s=savePreset(s,'time','Time');s.config.axis='distance';expect(applyPreset(s,'time').config.axis).toBe('time');});
 it('keeps axis/channel choices with their own tools',()=>{let s=defaultAdvanced();s.config.tool='scatter';s.config.xChannel='rpm';s.config.xRange=[8000,16000];s=changeTool(s,'traction');expect(s.config.xRange).toBeNull();expect(s.config.xChannel).toBeNull();s=changeTool(s,'scatter');expect(s.config.xRange).toEqual([8000,16000]);expect(s.config.xChannel).toBe('rpm');});
});
