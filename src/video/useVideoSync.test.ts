import {describe,it,expect} from 'vitest';
import type {Analysis,Session} from '../types';
import {projectVideoTime} from './useVideoSync';
const session:Session={id:'s',source:'fixture',name:'fixture',track:'',driver:'',recordedAt:'',channels:[],warnings:[],laps:[{id:'a',number:1,start:100,end:120,duration:20,complete:true},{id:'b',number:2,start:120,end:140,duration:20,complete:true}]};
const analysis=(lapId:string,mapping=[{time:0,meters:0},{time:20,meters:200}]):Analysis=>({primary:{lapId,mapping,duration:20,length:200,series:[],track:[],warnings:[]},comparison:null,segments:[],delta:null,alignment:{method:'spatial',referenceLength:200,positionUncertaintyM:1,timingUncertaintyS:.1,coverage:1,notes:[]},warnings:[]});
describe('latest absolute video clock projection',()=>{
 it('withholds stale analysis and projects latest time only onto its matching lap',async()=>{const p=projectVideoTime;expect(p(session,125,'b',analysis('a'),'distance')).toEqual({lapId:'b',cursor:null,cornerId:null});expect(p(session,127,'b',analysis('b'),'distance')).toEqual({lapId:'b',cursor:70,cornerId:null});});
 it('never invents distance position when the lap mapping is unsupported',async()=>{const p=projectVideoTime;expect(p(session,125,'b',analysis('b',[]),'distance').cursor).toBeNull();expect(p(session,125,'b',analysis('b',[]),'time').cursor).toBe(5);});
});
