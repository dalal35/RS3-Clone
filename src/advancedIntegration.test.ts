import {describe,expect,it} from 'vitest';
import {advancedEventWindow,inspectableAdvancedPosition,advancedContextChannels} from './advancedIntegration';
import type {Analysis,AdvancedEvent,Channel} from './types';

const analysis={primary:{lapId:'primary',mapping:[{time:0,meters:0},{time:20,meters:200}]},comparison:{lapId:'comparison',mapping:[{time:0,meters:0},{time:40,meters:200}]},alignment:{method:'spatial'}} as Analysis;
const event={lapId:'comparison',position:5,endPosition:7} as AdvancedEvent;
describe('advanced timeline integration',()=>{
 it('uses backend primary-reference comparison time without a second conversion',()=>{
  expect(inspectableAdvancedPosition('comparison',5,analysis)).toBe(5);
 });
 it('rejects invalid positions and unrelated laps',()=>{
  for(const position of [null,NaN,Infinity])expect(inspectableAdvancedPosition('primary',position,analysis)).toBeNull();
  expect(inspectableAdvancedPosition('other',5,analysis)).toBeNull();
 });
 it('keeps nonspatial comparison inspection informational',()=>{
  const estimated={...analysis,alignment:{...analysis.alignment,method:'estimated' as const}};
  expect(inspectableAdvancedPosition('comparison',5,estimated)).toBeNull();
  expect(inspectableAdvancedPosition('primary',5,estimated)).toBe(5);
 });
 it('focuses time events with two seconds of context and measured end',()=>{
  expect(advancedEventWindow(event,'time',{min:0,max:20})).toEqual({min:3,max:9});
 });
 it('clamps distance context and supports unknown event end',()=>{
  expect(advancedEventWindow({...event,position:5,endPosition:null},'distance',{min:0,max:200})).toEqual({min:0,max:25});
  expect(advancedEventWindow({...event,position:195,endPosition:199},'distance',{min:0,max:200})).toEqual({min:175,max:200});
 });
 it('rejects absent, out of bounds or nonfinite windows',()=>{
  for(const position of [null,NaN,Infinity,-100,300])expect(advancedEventWindow({...event,position},'time',{min:0,max:20})).toBeNull();
  expect(advancedEventWindow(event,'time',{min:20,max:0})).toBeNull();
 });
});
describe('advanced event trace channel selection',()=>{
 const channels=[{id:'rpm',name:'Engine RPM'},{id:'gps-speed',name:'GPS Speed'},{id:'throttle',name:'Throttle'}] as Channel[];
 it('requests RPM and speed for event modes without mutating saved selections',()=>{
  const saved=['throttle'];
  expect(advancedContextChannels(saved,channels,'advanced','bog')).toEqual(['throttle','rpm','gps-speed']);
  expect(advancedContextChannels(saved,channels,'advanced','shifts')).toEqual(['throttle','rpm','gps-speed']);
  expect(saved).toEqual(['throttle']);
 });
 it('preserves normal selection and existing video RPM context',()=>{
  expect(advancedContextChannels(['throttle'],channels,'telemetry','bog')).toEqual(['throttle']);
  expect(advancedContextChannels(['throttle'],channels,'video','bog')).toEqual(['throttle','rpm']);
  expect(advancedContextChannels(['throttle'],channels,'advanced','scatter')).toEqual(['throttle','rpm']);
 });
 it('tolerates missing context channels and deduplicates existing channels',()=>{
  expect(advancedContextChannels(['rpm'],channels,'advanced','shifts')).toEqual(['rpm','gps-speed']);
  expect(advancedContextChannels(['throttle'],[],'advanced','bog')).toEqual(['throttle']);
 });
});
