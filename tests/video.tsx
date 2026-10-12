import {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createYouTubePlayer} from '../src/video/youtubePlayer';
import type {PlayerSnapshot, VideoPlayer} from '../src/video/player';

function Probe() {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<VideoPlayer | null>(null);
  const [sample, setSample] = useState<PlayerSnapshot | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [rates, setRates] = useState<number[]>([]);
  const log = (message: string) => setEvents(events => [...events.slice(-29), `${new Date().toISOString()} ${message}`]);
  useEffect(() => {
    const adapter = createYouTubePlayer(host.current!, 'M7lc1UVf-VE');
    player.current = adapter;
    let active = true;
    let previous = '';
    const unsubscribe = adapter.subscribe(snapshot => {
      if (!active) return;
      setSample(snapshot);
      if (snapshot.state !== previous) { previous = snapshot.state; log(`state=${snapshot.state}`); }
    });
    void adapter.ready.then(() => {
      if (!active) return;
      setRates(adapter.supportedRates());
      log('ready');
    }).catch(error => { if (active) log(String(error)); });
    return () => { active = false; unsubscribe(); adapter.dispose(); player.current = null; };
  }, []);
  const action = async (label: string, run: (player: VideoPlayer) => Promise<void>) => {
    try { await run(player.current!); log(`${label}: requested/completed; inspect observed clock below`); }
    catch (error) { log(`${label}: ${String(error)}`); }
  };
  return <main style={{fontFamily: 'system-ui', padding: 24, color: '#20242a'}}>
    <h1>Native YouTube compatibility probe</h1>
    <p>Official IFrame API · M7lc1UVf-VE · approximate asynchronous timing</p>
    <p>Origin: {location.origin} · {navigator.userAgent}</p>
    <div ref={host} style={{width: 640, height: 360, minWidth: 200, minHeight: 200}} />
    <p>Keep YouTube controls and branding unobstructed. Native play button is available in the frame.</p>
    <div style={{display: 'flex', gap: 12}}>
      <button onClick={() => void action('Play', p => p.play())}>Play</button>
      <button onClick={() => void action('Pause', p => p.pause())}>Pause</button>
      <button onClick={() => void action('Seek 10s', p => p.seek(10, new AbortController().signal))}>Seek 10s</button>
      {rates.map(rate => <button key={rate} onClick={() => void action(`Rate ${rate}`, p => p.setRate(rate))}>{rate}×</button>)}
    </div>
    <pre aria-label="Player snapshot">{JSON.stringify(sample, null, 2)}</pre>
    <pre aria-label="Probe events" style={{whiteSpace: 'pre-wrap'}}>{events.join('\n')}</pre>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Probe />);
