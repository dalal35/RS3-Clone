import { describe, expect, it } from 'vitest';
import { fastestLap, formatTime, interpolate, mergeSeries, trackGeometry } from './telemetry';
describe('telemetry presentation', () => {
  it('only recommends complete laps', () => {
    expect(fastestLap([{id:'partial',number:1,start:0,end:8,duration:8,complete:false},{id:'full',number:2,start:8,end:68,duration:60,complete:true}])?.id).toBe('full');
  });
  it('keeps independent sample frequencies aligned by position', () => {
    expect(mergeSeries([{x:[0,2],values:[10,20]},{x:[0,1,2],values:[30,40,50]}])).toEqual([[0,1,2],[10,15,20],[30,40,50]]);
  });
  it('interpolates only inside known samples', () => {
    expect(interpolate([0,2],[10,20],1)).toBe(15);
    expect(interpolate([0,2],[10,20],3)).toBeNull();
  });
  it('formats minutes without rolling seconds to 60', () => { expect(formatTime(59.9999)).toBe('1:00.000'); });
  it('preserves circuit aspect ratio and flips map north upward', () => {
    const points=trackGeometry([{x:0,y:0,position:0,speed:null},{x:200,y:100,position:1,speed:null}]);
    expect(points[1].x-points[0].x).toBe(280);
    expect(points[0].y-points[1].y).toBe(140);
  });
});

describe('recording outages', () => {
  it('suppresses cursor interpolation inside declared gaps', () => {
    expect(interpolate([0,1,9,10],[0,1,9,10],5,[[1,9]])).toBeNull();
    expect(interpolate([0,1,9,10],[0,1,9,10],1,[[1,9]])).toBe(1);
  });
  it('breaks rendered lines while retaining independent sampling', () => {
    expect(mergeSeries([{x:[0,1,9,10],values:[0,1,9,10],gaps:[[1,9]]}])).toEqual([[0,1,5,9,10],[0,1,null,9,10]]);
  });
});
