import {animate} from 'motion/mini';
import {inView, scroll} from 'motion';

// One motion vocabulary, progressive enhancement: CSS never hides page content.
const timing = {duration:.65, ease:[.22,1,.36,1]};
const clamp = value => Math.max(0, Math.min(1, value));

export function createLandingMotion() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 800px)');
  const cleanups = [];
  const originals = new Map();
  const seen = new WeakSet();
  let previewTransition;
  let suspended = false;
  let entered = false;
  const remember = element => {
    if (!originals.has(element)) originals.set(element, element.getAttribute('style'));
    return element;
  };
  const play = (element, keyframes, options = {}) => {
    remember(element);
    const animation = animate(element, keyframes, {...timing, ...options});
    cleanups.push(()=>animation.cancel());
    return animation;
  };
  const linked = (element, keyframes, target, offset) => {
    const animation = play(element, keyframes, {duration:1,ease:'linear'});
    cleanups.push(scroll(animation, {target,offset}));
  };
  function stop() {
    previewTransition?.cancel();
    previewTransition=undefined;
    cleanups.splice(0).reverse().forEach(cleanup=>cleanup());
    originals.forEach((style,element)=> {
      if (style === null) element.removeAttribute('style'); else element.setAttribute('style',style);
    });
    originals.clear();
    document.querySelector('.telemetry-delta').textContent = '−0.00 s';
  }
  function start() {
    stop();
    document.documentElement.dataset.motionState = suspended ? 'suspended' : reduced.matches ? 'reduced' : 'active';
    if (suspended || reduced.matches) return;
    const mobile = compact.matches;
    const rise = mobile ? 12 : 24;
    if (!entered && !mobile) {
      entered = true;
      const sequence = ['.hero-content .eyebrow','.hero-title-line:first-child','.hero-title-line:last-child','.hero-subtitle','.hero-actions','.hero-meta','.hero-instrument'];
      sequence.forEach((selector,index)=>play(document.querySelector(selector),{
        opacity:[0,1],transform:[`translateY(${index===6 ? 18 : rise}px)`,'translateY(0px)']
      },{delay:index*.065,duration:index===6 ? .8 : .6}));
    }

    // Intersection reveals start only when visible; offscreen content is always readable.
    cleanups.push(inView('.section-heading, .feature-details > div, .workflow-step, .insights-layout > div, .demo-layout > div, .demo-prompts li, .download-card, .end-cta-inner > h2', element=> {
      if (seen.has(element)) return;
      seen.add(element);
      const siblings = [...element.parentElement.children];
      const stagger = Math.min(siblings.indexOf(element),2)*.075;
      play(element,{opacity:[.3,1],transform:[`translateY(${rise}px)`,'translateY(0px)']},{delay:stagger});
    },{margin:'0px 0px -24px 0px'}));

    // A single shared progress sample drives the synthetic lap illustration.
    // Only SVG paint/transform and a quantized text value change; no layout reads.
    const hero = document.querySelector('.hero');
    const primary = remember(document.querySelector('.telemetry-primary'));
    const reference = remember(document.querySelector('.telemetry-reference'));
    const cursor = remember(document.querySelector('.telemetry-cursor'));
    const delta = document.querySelector('.telemetry-delta');
    let previousDelta;
    cleanups.push(scroll(progress=> {
      const p = clamp(progress);
      primary.style.strokeDashoffset = String(1-clamp(.16+p*1.7));
      reference.style.strokeDashoffset = String(1-clamp((p-.08)*2.15));
      reference.style.opacity = String(.25+clamp(p*3)*.6);
      cursor.style.transform = `translateX(${p*440}px)`;
      const value = (p*.24 + Math.sin(p*Math.PI*3)*.025).toFixed(2);
      if (value !== previousDelta) { delta.textContent = `−${value} s`; previousDelta=value; }
    },{target:hero,offset:['start start','end start']}));

    const workspace = document.querySelector('.showcase-panel');
    if (!mobile) {
      linked(workspace,{opacity:[.8,1],transform:['perspective(1400px) translateY(38px) rotateX(2deg) scale(.985)','perspective(1400px) translateY(0px) rotateX(0deg) scale(1)']},workspace,['start 95%','start 35%']);
      linked(document.querySelector('.hero-content'),{opacity:[1,.55],transform:['translateY(0px)','translateY(24px)']},hero,['start start','end start']);
      linked(document.querySelector('.demo-prompts'),{opacity:[.65,1],transform:['translateY(22px) scale(.98)','translateY(0px) scale(1)']},document.querySelector('.demo-section'),['start 90%','start 35%']);
    }
    const workflow = document.querySelector('.workflow-grid');
    const steps = [...workflow.querySelectorAll('.workflow-number')].map(remember);
    cleanups.push(scroll(progress=>steps.forEach((step,index)=> {
      step.style.setProperty('--step-progress',String(clamp(progress*3-index)));
    }),{target:workflow,offset:['start 85%','end 40%']}));
    const details = document.querySelector('.feature-details');
    linked(document.querySelector('.signal-comparison'),{transform:['translateY(-4px)','translateY(0px)']},details,['start 95%','end 45%']);
    linked(document.querySelector('.grip-markers'),{opacity:[.2,1],transform:['translateY(4px)','translateY(0px)']},details,['start 95%','end 45%']);
    linked(document.querySelector('.video-cursor'),{transform:['translateX(10px)','translateX(230px)']},details,['start 95%','end 45%']);
  }
  const update = ()=> {
    try { start(); } catch { stop(); }
  };
  reduced.addEventListener('change',update);
  compact.addEventListener('change',update);
  // Failure in decorative setup must never break links, tabs, or the live demo.
  update();
  return {
    transitionPreview(element) {
      previewTransition?.cancel();
      if (!suspended && !reduced.matches) {
        remember(element);
        previewTransition=animate(element,{opacity:[.4,1]},{...timing,duration:.3});
      }
    },
    suspend() { suspended=true; update(); },
    resume() { suspended=false; update(); },
    destroy() { stop(); reduced.removeEventListener('change',update); compact.removeEventListener('change',update); }
  };
}
