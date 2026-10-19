import ReactDOM from 'react-dom/client';
import App from '../../src/App';
import '../../src/styles.css';
import '../../src/explorer.css';
import './demo.css';
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&window.parent!==window)window.parent.postMessage('demo:escape',location.origin);});
ReactDOM.createRoot(document.getElementById('root')!).render(<><div className="demo-disclosure"><a href="../" target="_top">← Ten Tenths Telemetry</a><span><strong>Browser demo</strong> · Synthetic data · File operations require desktop · Edits reset on session change or reload</span><a href="../#download" target="_top">Get the desktop app ↗</a></div><App/></>);
