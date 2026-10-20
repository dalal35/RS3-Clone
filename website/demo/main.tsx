import {useEffect,useState} from 'react';
import ReactDOM from 'react-dom/client';
import App from '../../src/App';
import '../../src/styles.css';
import '../../src/explorer.css';
import './demo.css';

function Demo(){
 const [guide,setGuide]=useState(false);
 useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key!=='Escape')return;if(guide){setGuide(false);event.stopImmediatePropagation();}else if(window.parent!==window)window.parent.postMessage('demo:escape',location.origin);};window.addEventListener('keydown',escape,true);return()=>window.removeEventListener('keydown',escape,true);},[guide]);
 return <div className="demo-shell">
  <div className="demo-disclosure"><a href="../" target="_top" className="demo-back">← <span>Ten Tenths Telemetry</span></a><span className="demo-session-label"><i/> LIVE WORKSPACE <span> / SYNTHETIC SESSION</span></span><div className="demo-banner-actions"><button aria-expanded={guide} aria-controls="demo-guide" onClick={()=>setGuide(v=>!v)}>{guide?'Close guide':'Quick guide'} <span aria-hidden="true">{guide?'−':'+'}</span></button><a href="../#download" target="_top">Get the desktop app ↗</a></div></div>
  {guide&&<section className="demo-guide" id="demo-guide" aria-label="Demo quick guide"><div><span className="demo-guide-kicker">YOUR FIRST LAP</span><h2>Follow the difference.</h2><p>The real analysis interface. Two generated sessions. Everything stays in this browser.</p></div><ol><li><b>01 / COMPARE</b><p>Open Sessions and choose a lap. Use ＋ beside another lap to compare its traces.</p></li><li><b>02 / FIND THE TENTH</b><p>Scrub the lap slider to sync the charts and GPS. Select a track section to focus its telemetry.</p></li><li><b>03 / GO DEEPER</b><p>Try Advanced for G-G and RPM analysis, or Video for synthetic synchronized playback.</p></li></ol><p className="demo-guide-note">Synthetic telemetry and illustrated video, not imported race data. XRK import, file operations and local AI explanations require desktop. Edits reset when switching sessions or reloading.</p></section>}
  <App/>
 </div>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Demo/>);
