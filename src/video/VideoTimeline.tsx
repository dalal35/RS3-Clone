import type {lapMarkers, VideoSegment} from './model';

export interface VideoTimelineProps {
  segments: VideoSegment[];
  markers: ReturnType<typeof lapMarkers>;
  duration: number | null;
  time: number;
  onSeekVideo: (time: number) => void;
}

export function VideoTimeline({segments, markers, duration, time, onSeekVideo}: VideoTimelineProps) {
  const known = duration !== null && Number.isFinite(duration) && duration > 0;
  const end = known ? duration : 1;
  return <div className="video-timeline">
    <div className="video-timeline-heading"><span>Footage timeline</span><small>Lap crossings predicted from telemetry</small></div>
    <div className="video-timeline-rail" aria-hidden="true">
      {segments.map((segment, index) => <span key={segment.id} className="video-timeline-segment" style={{left:`${100*segment.videoStart/end}%`,width:`${100*(segment.videoEnd-segment.videoStart)/end}%`}}>{index+1}</span>)}
      <span className="video-playhead" style={{left:`${100*Math.min(end, Math.max(0,time))/end}%`}} />
    </div>
    <input type="range" aria-label="Video timeline" min={0} max={end} step={.1} value={Math.min(end,Math.max(0,time))} disabled={!known} onChange={event=>onSeekVideo(Number(event.target.value))}/>
    <div className="video-marker-list">
      {markers.map(marker=><button key={`${marker.segmentId}:${marker.lapId}`} data-marker-segment={marker.segmentId} data-video-time={marker.videoTime}
        aria-label={`Predicted lap ${marker.lapNumber} crossing at ${marker.videoTime.toFixed(2)} seconds`} onClick={()=>onSeekVideo(marker.videoTime)}>
        <span className="dot cyan"/> Lap {marker.lapNumber} <span className="mono">{marker.videoTime.toFixed(2)}s</span>
      </button>)}
      {!markers.length&&<small>No predicted lap crossings in mapped footage.</small>}
    </div>
  </div>;
}
