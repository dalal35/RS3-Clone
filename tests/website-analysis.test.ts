import {describe,expect,it} from 'vitest';
import {analyzeSession,analyzeAdvanced,validateFormulas,librarySnapshot} from '../website/demo/bridge';
import {sampleSessions,CIRCUIT_LENGTH} from '../website/demo/data';
import {defaultAdvanced} from '../src/advancedState';
const session=sampleSessions[0],primary=session.laps[3],comparison=session.laps[1];
describe('browser sample analysis adapter',()=>{
 it('restores a ready multi-session workspace without native APIs',async()=>{
  const library=await librarySnapshot();expect(library.entries).toHaveLength(2);
  expect(library.activeSessionId).toBe(session.id);
  expect(library.entries.every(e=>e.status==='ready')).toBe(true);
 });
 it('aligns comparison plots and map coordinates to primary time',async()=>{
  const analysis=await analyzeSession(session.id,primary.id,comparison.id,'time',['gps-speed']);
  expect(analysis.comparison!.series[0].x).toEqual(analysis.primary.series[0].x);
  expect(analysis.comparison!.track.map(p=>p.position)).toEqual(analysis.primary.track.map(p=>p.position));
  expect(analysis.comparison!.mapping.at(-1)!.time).toBeCloseTo(comparison.duration);
  expect(analysis.delta!.values.at(-1)).toBeCloseTo(primary.duration-comparison.duration);
 });
 it('derives filtered distributions and cursors from the same lap samples',async()=>{
  const c={...defaultAdvanced().config,tool:'histogram' as const,histChannel:'gps-speed',range:[0,CIRCUIT_LENGTH/2] as [number,number]};
  const result=await analyzeAdvanced(session.id,primary.id,comparison.id,'distance',c,[]);
  for(const lap of result.laps){
   expect(lap.points.every(p=>p.position!>=0&&p.position!<=CIRCUIT_LENGTH/2)).toBe(true);
   expect(lap.points.length).toBeGreaterThan(200);
   expect(lap.histogram.reduce((sum,bin)=>sum+bin.value,0)).toBeCloseTo(100,8);
   expect(lap.stats.count).toBe(lap.points.length);
  }
 });
 it('rejects unsupported formulas instead of silently fabricating values',async()=>{
  await expect(validateFormulas(session.id,[{id:'unsupported',name:'Unsupported',expression:'madeUp([rpm])'}])).rejects.toThrow();
 });
});
