import {createRoot} from 'react-dom/client';
import App from '../src/App';
import '../src/styles.css';
createRoot(document.getElementById('root')!).render(<App/>);
import uPlot from 'uplot';
Object.assign(window,{advancedPlotCursors:()=>uPlot.sync('telemetry').plots.map(p=>({left:p.cursor.left,position:p.cursor.left==null?null:p.posToVal(p.cursor.left,'x')}))});
