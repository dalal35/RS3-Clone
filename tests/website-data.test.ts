import {describe,expect,it} from 'vitest';
import {sampleSessions,lapTimes,speedAt,CIRCUIT_LENGTH,SAMPLE_COUNT,positions,circuitPoint} from '../website/demo/data';

describe('self-contained demo session',()=>{
 it('uses realistic complete laps with one coherent clock for all channels',()=>{
  for(const [index,session] of sampleSessions.entries()){
   expect(session.laps.length).toBeGreaterThanOrEqual(3);
   for(const lap of session.laps){
    const times=lapTimes(lap.number,index);
    expect(times).toHaveLength(SAMPLE_COUNT);
    expect(times.at(-1)).toBeCloseTo(lap.duration,9);
    expect(lap.end-lap.start).toBeCloseTo(lap.duration,9);
    expect(lap.duration).toBeGreaterThan(60);
    expect(lap.duration).toBeLessThan(180);
    // Each interval's distance integrates to the same lap length at sample speed.
    const distance=times.slice(1).reduce((sum,t,i)=>sum+(t-times[i])*speedAt((i+.5)/(SAMPLE_COUNT-1),lap.number,index)/3.6,0);
    expect(distance).toBeCloseTo(CIRCUIT_LENGTH,6);
   }
   for(const channel of session.channels){
    expect(channel.times).toHaveLength(session.laps.length*SAMPLE_COUNT);
    expect(channel.values).toHaveLength(channel.times.length);
    expect(channel.values.every(Number.isFinite)).toBe(true);
    expect(channel.times.every((time,i)=>i===0||time>=channel.times[i-1])).toBe(true);
   }
  }
 });
 it('provides a closed GPS circuit and distinct lap traces',()=>{
  const first=circuitPoint(positions[0]),last=circuitPoint(positions.at(-1)!);
  expect(last.x).toBeCloseTo(first.x,8);expect(last.y).toBeCloseTo(first.y,8);
  expect(sampleSessions[0].laps[0].duration).not.toBe(sampleSessions[0].laps[1].duration);
  expect(sampleSessions[0].channels.find(c=>c.id==='throttle')!.values.every(v=>v>=0&&v<=100)).toBe(true);
 });
});
