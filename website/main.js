import {animate} from 'motion/mini';
import {inView} from 'motion';

/* Landing interactions; the React workspace is loaded only on request. */
(() => {
  const REPO = 'dalal35/Ten-Tenths-Telemetry';
  const FALLBACK_RELEASE = 'v0.1.3';
  const FALLBACK_DMG = `https://github.com/${REPO}/releases/download/${FALLBACK_RELEASE}/Ten-Tenths-Telemetry_0.1.3_aarch64.dmg`;

  const menu = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#primary-navigation');
  function closeMenu() {
    menu?.setAttribute('aria-expanded', 'false');
    menu?.setAttribute('aria-label', 'Open navigation menu');
    nav?.classList.remove('open');
  }
  menu?.addEventListener('click', () => {
    const opening = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(opening));
    menu.setAttribute('aria-label', opening ? 'Close navigation menu' : 'Open navigation menu');
    nav?.classList.toggle('open', opening);
  });
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const reveals = new Set();
  inView('.section-heading, .feature-details > div, .workflow-step, .insights-layout, .demo-layout, .download-card', element => {
    if (!reducedMotion.matches) {
      const animation = animate(element, {opacity:[0,1], transform:['translateY(18px)','translateY(0)']}, {duration:.55,ease:[.2,.7,.3,1]});
      reveals.add(animation);
      animation.then(() => reveals.delete(animation));
    }
  }, {margin:'0px 0px -35px 0px'});
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { reveals.forEach(animation => animation.complete()); reveals.clear(); } });

  const previews = {
    telemetry: {image:'telemetry', alt:'Actual Ten Tenths telemetry workspace with lap overlays, speed and RPM plots and a synchronized GPS track map; synthetic sample data',caption:'Compare speed, RPM and delta. Follow the same moment across every trace and the GPS map.'},
    advanced: {image:'advanced', alt:'Actual Ten Tenths advanced analysis workspace showing G-G traction and shift analysis with synthetic sample data',caption:'Inspect grip usage, channel distributions and shift recovery with advanced analysis views.'},
    video: {image:'video', alt:'Actual Ten Tenths browser video workspace with an explicitly synthetic track illustration and synchronized telemetry',caption:'Connect video and telemetry in one timeline. Browser preview uses an illustrated sample; desktop supports local onboard footage.'}
  };
  const tabs = [...document.querySelectorAll('[data-feature]')];
  const preview = document.querySelector('#showcase-preview');
  function selectFeature(tab) {
    const feature = previews[tab.dataset.feature];
    tabs.forEach(button => { const selected = button === tab; button.setAttribute('aria-selected',String(selected)); button.tabIndex = selected ? 0 : -1; });
    document.querySelector('#showcase-panel').setAttribute('aria-labelledby',tab.id);
    preview.src = `./assets/${feature.image}.webp`;
    preview.alt = feature.alt;
    document.querySelector('#showcase-caption').textContent = feature.caption;
    if (!reducedMotion.matches) animate(preview,{opacity:[.4,1]},{duration:.3});
  }
  tabs.forEach((tab,index) => {
    tab.addEventListener('click',()=>selectFeature(tab));
    tab.addEventListener('keydown',event => {
      let next;
      if (event.key === 'ArrowRight') next = (index+1)%tabs.length;
      if (event.key === 'ArrowLeft') next = (index+tabs.length-1)%tabs.length;
      if (event.key === 'Home') next=0;
      if (event.key === 'End') next=tabs.length-1;
      if (next !== undefined) { event.preventDefault(); tabs[next].focus(); selectFeature(tabs[next]); }
    });
  });

  const dialog = document.querySelector('.demo-dialog');
  document.querySelector('#demo-open').addEventListener('click',() => {
    const frame = document.createElement('iframe');
    frame.title = 'Interactive Ten Tenths Telemetry workspace with synthetic sample data';
    frame.src = './demo/index.html';
    document.querySelector('#demo-mount').append(frame);
    dialog.showModal();
  });
  document.querySelector('#demo-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=> { document.querySelector('#demo-mount').replaceChildren(); document.querySelector('#demo-open').focus(); });
  window.addEventListener('message',event=> { if (event.origin===location.origin && event.source===document.querySelector('#demo-mount iframe')?.contentWindow && event.data==='demo:escape') dialog.close(); });
  const sections = [...document.querySelectorAll('main section[id]')];
  const links = [...document.querySelectorAll('.nav-links a')];
  const activeSections = new Map();
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => activeSections.set(entry.target.id,entry.isIntersecting));
    const active = sections.find(section=>activeSections.get(section.id));
    links.forEach(link=> { if (active && link.hash===`#${active.id}`) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current'); });
  }, {rootMargin:'-15% 0px -50% 0px'});
  sections.forEach(section=>sectionObserver.observe(section));

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  async function hydrateLatestRelease() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error('Release lookup failed');
      const release = await response.json();
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const mac = assets.find(asset => /aarch64\.dmg$/i.test(asset.name || '') && asset.browser_download_url);
      if (mac) {
        document.querySelector('#mac-download').href = mac.browser_download_url;
        const version = (release.tag_name || FALLBACK_RELEASE).replace(/^v/i,'');
        document.querySelector('#hero-version').textContent = `v${version} available`;
        document.querySelector('#mac-version').textContent = `Version ${version} · DMG installer`;
      }
    } catch (error) {
      // Keep the known-good macOS fallback; the Windows beta link is static.
      // No third-party analytics or API keys are used.
      document.querySelector('#mac-download').href = FALLBACK_DMG;
    } finally { clearTimeout(timer); }
  }
  hydrateLatestRelease();
})();
