import {scroll} from 'motion';

const clamp = value => Math.max(0, Math.min(1, value));
const mix = (from, to, progress) => from + (to - from) * clamp(progress);
const between = (position, start, end) => clamp((position - start) / Math.max(1, end - start));

/** One native scroll source; every chapter is a range of the same document progress.
 * Geometry is cached on resize, never read inside the scroll callback. No springs,
 * timers or entrance animations can lag behind a jump or a change of direction.
 */
export function createLandingMotion() {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 800px)');
  const select = selector => document.querySelector(selector);
  const originals = new Map();
  const elements = {
    preview: select('#showcase-preview'),
    hero: select('.hero-content'), trace: select('.hero-instrument'),
    primary: select('.telemetry-primary'), reference: select('.telemetry-reference'),
    cursor: select('.telemetry-cursor'), workspace: select('.workspace-stage'),
    marker: select('.thread-marker'),
    comparison: select('.signal-comparison'), grip: select('.grip-markers'),
    video: select('.video-cursor'), debrief: select('.debrief-marker > span'),
    demo: select('.demo-window'), demoMarker: select('.demo-trace-marker'),
    finish: select('.finish-marker > span')
  };
  const routeLine = select('.signal-route-line');
  const routeTip = select('.signal-route-tip');
  const chapters = [...document.querySelectorAll('[data-story-feature]')];
  const steps = [...document.querySelectorAll('.workflow-step')];
  const numbers = [...document.querySelectorAll('.workflow-number')];
  const delta = select('.telemetry-delta');
  const counter = select('.thread-count');
  let suspended = false;
  let cancelScroll;
  let resizeObserver;
  let frame;
  let geometry;
  let lastFeature;
  let lastStage;
  let lastDelta;
  const style = (element, values) => {
    if (!originals.has(element)) originals.set(element, element.getAttribute('style'));
    Object.entries(values).forEach(([property,value]) => {
      if (property.startsWith('--')) element.style.setProperty(property,value);
      else element.style[property] = value;
    });
  };
  function restore() {
    cancelScroll?.();
    cancelScroll = undefined;
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    cancelAnimationFrame(frame);
    originals.forEach((value, element) => {
      if (value === null) element.removeAttribute('style');
      else element.setAttribute('style', value);
    });
    originals.clear();
    root.style.removeProperty('--lap-progress');
    root.style.removeProperty('--atmosphere');
    root.removeAttribute('data-narrative-progress');
    root.removeAttribute('data-chapter');
    delta.textContent = '−0.00 s';
    lastFeature = lastStage = lastDelta = undefined;
  }
  function measure() {
    const height = window.innerHeight;
    // offset geometry ignores our own transforms, so font/resize recalculation
    // cannot feed yesterday's visual translation back into chapter positions.
    const top = element => {
      let value = 0;
      for (let node = element; node; node = node.offsetParent) value += node.offsetTop;
      return value;
    };
    const feature = select('#features');
    const workflow = select('#workflow');
    const debrief = select('#debrief');
    const demo = select('#live-demo');
    const finish = select('#download');
    const anchor = (selector, x = 0, y = 0) => {
      const element = select(selector);
      let left = 0;
      for (let node = element; node; node = node.offsetParent) left += node.offsetLeft;
      return {x:left + element.offsetWidth * x,y:top(element) + element.offsetHeight * y};
    };
    // Keep the trajectory in the measured outer gutter for the entire sticky
    // workspace. Its document anchors must not depend on the current sticky top.
    const heading = anchor('#features .section-heading');
    const gutter = heading.x / 2;
    const launchAnchor = anchor('.hero-trace', .72, .65);
    const workspaceRoute = [
      launchAnchor,
      {x:launchAnchor.x, y:anchor('.trace-destination', 0, 1).y + 12},
      {x:gutter, y:anchor('.hero-foot > span').y - 16},
      {x:gutter, y:anchor('.workflow-grid').y - 28},
    ];
    geometry = {
      height, total: Math.max(1, root.scrollHeight - height),
      workspace: top(feature),
      features: chapters.map(element => ({top:top(element), height:element.offsetHeight})),
      workflow: top(workflow), workflowEnd: top(workflow) + workflow.offsetHeight,
      debrief: top(debrief), demo: top(demo), finish: top(finish),
      steps: steps.map(element => ({top:top(element), height:element.offsetHeight})),
      rail: select('.thread-track').getBoundingClientRect().height,
      route: [...workspaceRoute,
        ...numbers.map((element,index) => anchor(`.workflow-step:nth-child(${index+1}) .workflow-number`,0,1)),
        anchor('.debrief-marker',0,.5),anchor('.demo-window',.2,.5),anchor('.finish-marker',1,.5)]
    };
    render(window.scrollY);
  }
  function render(position) {
    if (!geometry) return;
    const g = geometry;
    const h = g.height;
    const mobile = compact.matches;
    const lap = clamp(position / g.total);
    const launch = between(position, 0, g.workspace);
    const opening = between(position, g.workspace - h * .82, g.features[0].top - h * .5);
    const travel = between(position, g.features[0].top - h * .5, g.features[2].top - h * .5);
    const workflow = between(position, g.workflow - h * .65, g.workflowEnd - h * .5);
    const debrief = between(position, g.debrief - h * .75, g.demo - h * .5);
    const demo = between(position, g.demo - h * .7, g.demo - h * .12);
    const finish = between(position, g.finish - h * .85, g.finish - h * .15);
    if (!mobile) {
      // A viewport-sized SVG joins the cached local signal anchors. Only visible
      // spans are painted; the same cursor travels the route in either direction.
      let path = '';
      let tip;
      for (let index = 1; index < g.route.length; index++) {
        const a = g.route[index-1], b = g.route[index];
        const ay = a.y-position, by = b.y-position;
        if (by < 0 || ay > h || b.y <= a.y) continue;
        const mid = (ay+by)/2;
        path += `M${a.x} ${ay}C${a.x} ${mid} ${b.x} ${mid} ${b.x} ${by}`;
        const focus = h*.55;
        if (ay <= focus && by >= focus) {
          // Invert the cubic's monotonic y coordinate with a few bounded steps.
          let low=0, high=1;
          for(let step=0;step<10;step++) {
            const t=(low+high)/2, u=1-t;
            const y=u*u*u*ay+3*u*u*t*mid+3*u*t*t*mid+t*t*t*by;
            if(y<focus)low=t;else high=t;
          }
          const t=(low+high)/2;
          tip={x:mix(a.x,b.x,t*t*(3-2*t)),y:focus};
        }
      }
      style(routeLine,{d:`path("${path || 'M0 0'}")`});
      style(routeTip,{transform:`translate(${tip?.x ?? 0}px,${tip?.y ?? 0}px)`,opacity:tip?'1':'0'});
    }
    root.style.setProperty('--lap-progress', lap.toFixed(5));
    root.style.setProperty('--atmosphere', String((.12 + Math.sin(lap * Math.PI) * .88) * (1 - finish * .85)));
    root.dataset.narrativeProgress = lap.toFixed(5);
    const stage = position < g.workspace - h * .45 ? 'hero'
      : position < g.features[0].top - h * .55 ? 'workspace'
      : position < g.features[1].top - h * .55 ? 'comparison'
      : position < g.features[2].top - h * .55 ? 'advanced'
      : position < g.workflow - h * .55 ? 'video'
      : position < g.debrief - h * .55 ? 'workflow'
      : position < g.demo - h * .55 ? 'debrief'
      : position < g.finish - h * .55 ? 'demo' : 'finish';
    if (stage !== lastStage) {
      root.dataset.chapter = stage;
      counter.textContent = `${stage === 'hero' ? '00' : ['workspace','comparison','advanced','video'].includes(stage) ? '01' : stage === 'workflow' ? '02' : stage === 'debrief' ? '03' : stage === 'demo' ? '04' : '05'} / 05`;
      lastStage = stage;
    }
    style(elements.marker, {transform:`translateY(${lap * g.rail}px)`,opacity:String(1 - finish * .6)});
    style(elements.hero, {transform:`translateY(${-launch * (mobile ? 10 : 50)}px)`,opacity:String(mix(1, .48, launch))});
    style(elements.trace, {transform:`translateY(${-launch * (mobile ? 4 : 16)}px) scaleX(${mix(1, mobile ? 1 : 1.14, launch)})`,opacity:String(mix(1,.45,launch))});
    style(elements.primary, {strokeDashoffset:String(1 - mix(.16,1,launch * 1.4))});
    style(elements.reference, {strokeDashoffset:String(1 - clamp(launch * 1.65)),opacity:String(mix(.28,.85,launch))});
    style(elements.cursor, {transform:`translateX(${mix(10,438,launch)}px)`});
    const value = `−${(launch * .24).toFixed(2)} s`;
    if (lastDelta !== value) { delta.textContent = value; lastDelta = value; }
    if (!mobile) {
      style(elements.workspace, {transform:`translateY(${mix(22,0,opening)}px)`});
    }
    // Soften only the short handoff window. Both image choice and emphasis are
    // deterministic functions of position, including on reverse scroll.
    const distance = Math.min(...g.features.slice(1).map(feature => Math.abs(position - (feature.top - h * .55))));
    style(elements.preview, {opacity:String(mix(.7,1,distance / (h * .16))),transform:'none'});
    chapters.forEach((chapter,index) => {
      const p = between(position, g.features[index].top - h * .9, g.features[index].top - h * .35);
      style(chapter, {opacity:String(mix(.55,1,p)),transform:`translateY(${mix(mobile ? 8 : 24,0,p)}px)`});
    });
    const featureIndex = position >= g.features[2].top - h * .55 ? 2 : position >= g.features[1].top - h * .55 ? 1 : 0;
    if (featureIndex !== lastFeature) {
      lastFeature = featureIndex;
      document.dispatchEvent(new CustomEvent('narrative:feature', {detail:chapters[featureIndex].dataset.storyFeature}));
    }
    style(elements.comparison, {transform:`translateY(${mix(-4,0,opening)}px)`});
    style(elements.grip, {opacity:String(mix(.3,1,travel * 2)),transform:`scale(${mix(.8,1,travel * 2)})`,transformOrigin:'center'});
    style(elements.video, {transform:`translateX(${mix(10,230,(travel-.5)*2)}px)`});
    steps.forEach((step,index) => {
      const p = mobile ? between(position,g.steps[index].top-h*.85,g.steps[index].top-h*.4) : clamp(workflow * 3 - index);
      style(numbers[index], {'--step-progress':String(p)});
      style(step, {opacity:String(mix(.55,1,p)),transform:`translateY(${mix(mobile ? 5 : 14,0,p)}px)`});
    });
    style(elements.debrief, {transform:`scaleX(${mix(.2,1,debrief)})`});
    style(elements.demo, {transform:`translateY(${mix(mobile ? 8 : 24,0,demo)}px) scaleX(${mix(mobile ? .99 : .94,1,demo)})`,opacity:String(mix(.5,1,demo))});
    style(elements.demoMarker, {left:`${mix(20,80,demo)}%`});
    style(elements.finish, {transform:`scaleX(${finish})`});
  }
  function start() {
    restore();
    root.dataset.motionState = suspended ? 'suspended' : reduced.matches ? 'reduced' : 'active';
    if (suspended || reduced.matches) return;
    measure();
    // Motion owns the sole scroll subscription. Chapter starts are normalized
    // against the same total; rendering only writes styles and quantized labels.
    cancelScroll = scroll((progress, info) => render(info?.y?.current ?? progress * geometry.total));
    resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    resizeObserver.observe(document.querySelector('main'));
  }
  const update = () => {
    try { start(); }
    catch { restore(); root.dataset.motionState = 'fallback'; }
  };
  const resize = () => {
    if (root.dataset.motionState !== 'active') return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  };
  reduced.addEventListener('change',update);
  compact.addEventListener('change',update);
  window.addEventListener('resize',resize,{passive:true});
  document.fonts?.ready.then(resize);
  update();
  return {
    transitionPreview() {}, // Tabs settle immediately; no delayed crossfade can outlive a jump.
    suspend() { suspended = true; update(); },
    resume() { suspended = false; update(); },
    destroy() {
      restore();
      reduced.removeEventListener('change',update);
      compact.removeEventListener('change',update);
      window.removeEventListener('resize',resize);
    }
  };
}
