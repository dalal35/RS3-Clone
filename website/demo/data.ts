/** Deterministic synthetic telemetry. No customer data or native XRK decoding. */
import type {Channel, Lap, Session} from '../../src/types';
export const SAMPLE_COUNT=601;
export const CIRCUIT_LENGTH=3220;
export const channelDefinitions=[['gps-speed','GPS Speed','km/h'],['rpm','Engine RPM','rpm'],['throttle','Throttle Position','%'],['brake','Brake Pressure','bar'],['lateral','Lateral Acceleration','g'],['longitudinal','Longitudinal Acceleration','g'],['gear','Gear',''],['steering','Steering Angle','deg'],['water','Water Temperature','°C'],['gps-lat','GPS Latitude','deg'],['gps-lon','GPS Longitude','deg']] as const;
const corners=[.12,.29,.46,.62,.79,.92];
const pulse=(p:number,c:number,w:number)=>Math.exp(-(((p-c)/w)**2));
export function speedAt(p:number,lap:number,session=0){return 181- corners.reduce((v,c,i)=>v+(65+(i%3)*12+Math.sin(lap+i)*3)*pulse(p,c,.026+(i%2)*.008),0)+5*Math.sin(p*Math.PI*2)+lap*.34-session*.8;}
export function circuitPoint(p:number){const a=p*Math.PI*2;return {x:520*Math.cos(a)+150*Math.cos(a*2+.6)+55*Math.sin(a*4),y:350*Math.sin(a)+110*Math.sin(a*3+.4)};}
export function sampleValue(id:string,p:number,lap:number,session=0):number {
 const speed=speedAt(p,lap,session),braking=corners.reduce((v,c)=>v+55*pulse(p,c-.025,.014),0),lat=1.35*Math.sin(p*Math.PI*12)*corners.reduce((v,c)=>v+pulse(p,c,.04),0),gear=Math.max(2,Math.min(6,Math.floor((speed-55)/25)+2));
 switch(id){case 'gps-speed':return speed;case 'rpm':return 4400+(speed%25)*108+gear*215+65*Math.sin(p*140);case 'throttle':return Math.max(0,Math.min(100,100-braking*2.1-corners.reduce((v,c)=>v+35*pulse(p,c,.025),0)));case 'brake':return braking;case 'lateral':return lat;case 'longitudinal':return Math.max(-1.15,Math.min(.65,(speedAt(Math.min(1,p+.002),lap,session)-speedAt(Math.max(0,p-.002),lap,session))*.033));case 'gear':return gear;case 'steering':return lat*34+2*Math.sin(p*34);case 'water':return 86+session+lap*.3+1.5*Math.sin(p*7);case 'gps-lat':return 39.7+circuitPoint(p).y/111320;case 'gps-lon':return -86.2+circuitPoint(p).x/85700;default:return 0;}
}
export const positions=Array.from({length:SAMPLE_COUNT},(_,i)=>i/(SAMPLE_COUNT-1));
export function lapTimes(lap:number,session=0){const times=[0];for(let i=1;i<SAMPLE_COUNT;i++){const p=(i-.5)/(SAMPLE_COUNT-1);times.push(times[i-1]+CIRCUIT_LENGTH/(SAMPLE_COUNT-1)/(speedAt(p,lap,session)/3.6));}return times;}
export function makeSession(index:number):Session {
 let start=0;const laps:Lap[]=Array.from({length:6},(_,i)=>{const duration=lapTimes(i+1,index).at(-1)!;const lap={id:`demo-${index}-lap-${i+1}`,number:i+1,start,end:start+duration,duration,complete:true};start+=duration;return lap;});
 const channels:Channel[]=channelDefinitions.map(([id,name,unit])=>({id,name,unit,times:laps.flatMap(l=>lapTimes(l.number,index).map(t=>t+l.start)),values:laps.flatMap(l=>positions.map(p=>sampleValue(id,p,l.number,index)))}));
 return {id:`demo-session-${index}`,name:index?'Afternoon · Race pace':'Morning · Baseline',source:`Synthetic / ${index?'afternoon':'morning'}.xrk`,driver:'Alex Morgan · Demo driver',track:'Ten Tenths Test Circuit',recordedAt:`2026-06-14 ${index?'14:20':'09:40'}:00`,channels,laps,warnings:['Synthetic sample session · illustrative circuit and sensor values, not a recorded XRK file.']};
}
export const sampleSessions=[makeSession(0),makeSession(1)];
