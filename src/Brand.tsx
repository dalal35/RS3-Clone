import './branding.css';

export default function Brand({compact=false}:{compact?:boolean}) {
  return <span className={`ttt-brand${compact?' ttt-brand-compact':''}`} role="img" aria-label="Ten Tenths Telemetry">
    <span className="ttt-mark" aria-hidden="true"/>
    {!compact&&<span className="ttt-wordmark" aria-hidden="true"><span>Ten Tenths</span><small>Telemetry</small></span>}
  </span>;
}
