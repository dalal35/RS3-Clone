/* Ten Tenths Telemetry landing page. No framework or build step required. */
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

  // Deterministic illustration points, not measured telemetry or actual lap data.
  function populateDots(selector, cx, cy, rx, ry, n) {
    const group = document.querySelector(selector);
    if (!group) return;
    for (let i = 0; i < n; i++) {
      const theta = (i * 2.399963229728653); // golden angle, in radians
      const r = Math.sqrt((i + 1) / (n + 1));
      const wobble = 0.76 + 0.22 * Math.sin(i * 4.11);
      const x = cx + Math.cos(theta) * r * rx * wobble;
      const y = cy + Math.sin(theta) * r * ry * wobble;
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1));
      dot.setAttribute('r', String(i % 9 === 0 ? 2.3 : 1.6));
      dot.setAttribute('opacity', (0.36 + (i % 5) * 0.11).toFixed(2));
      group.appendChild(dot);
    }
  }
  populateDots('#feature-gg-dots',145,78,63,62,90);

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
