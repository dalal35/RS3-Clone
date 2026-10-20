# Website

The homepage is static HTML/CSS with a small bundled vanilla Motion module. The interactive demo loads on demand in a dialog or at `demo/index.html`; it reuses the real React application with browser-only adapters. All telemetry, coach evidence and illustrated video in the demo are synthetic, and no native runtime or AI model is loaded.

## Build and verify

- `npm run build:website` typechecks the shared frontend and builds `dist-website`.
- `npm run test:website` exercises the production artifact beneath `/Ten-Tenths-Telemetry/`, including navigation, feature tabs, demo lifecycle, lap/channel selection, keyboard scrubbing, corner selection, analysis, coaching preview, video, responsive layouts and reduced motion.
- `npx vitest run website/demo/bridge.test.ts` tests the browser data adapters.
- `node scripts/capture-website-previews.mjs` refreshes the WebP screenshots from the built demo. Run the build again afterward to include the updated images. The hero uses a crop of the same real interface.

Browser commands require local HTTP server and Chrome/Playwright access. There is no configured lint command; JavaScript syntax can be checked with `node --check website/main.js` and `node --check scripts/capture-website-previews.mjs`.

The existing `.github/workflows/deploy-website.yml` builds and publishes `dist-website`. Vite uses relative asset paths; no server, routing fallback or API key is required. Release lookup is optional and retains the existing download URL when unavailable. Motion uses transform/opacity reveals, and reduced motion disables transitions and animated scrolling. The React/uPlot workspace does not load until the demo is opened and is removed on close.

## Landing motion

`motion.js` centralizes the existing Motion library's vanilla APIs and timing; no React landing rewrite or additional dependency is needed. The hero uses one staggered entrance, while the synthetic SVG speed comparison follows native scroll with normalized dash offsets, a cursor transform and a quantized decorative delta. The graphic is explicitly labeled synthetic and hidden from assistive technology. It does not represent measured application results.

Intersection-triggered copy reveals, a restrained desktop workspace perspective correction, feature signal illustrations, workflow progress and demo/download entrances share the same easing. Mobile shows the hero immediately to protect first paint and removes workspace perspective and decorative page parallax. Nothing pins or hijacks scrolling; there are no idle animation loops, React state updates, canvas redraws or synchronous layout reads in our scroll callbacks.

All content is visible in CSS before enhancement. Motion cancels and restores inline styles when reduced motion changes live or the demo dialog opens. Closing the dialog resumes scroll tracking without replaying the hero or remounting the demo. Page lifecycle cleanup also supports back/forward cache restoration. Animation initialization failures leave content and functional controls usable.

The production browser checks cover forward/reverse trace progress, delta updates, live reduced-motion changes, suspended motion in the modal, mobile simplification and no-JavaScript content/download access, in addition to the existing application demo checks. Screenshots are written to `test-results/` for desktop and mobile inspection.

Production landing bundle comparison (Vite reported decimal kB; same local dependency installation):

| Asset | Before | After | Before gzip | After gzip |
| --- | ---: | ---: | ---: | ---: |
| Landing JavaScript | 13.81 kB | 25.70 kB | 5.50 kB | 9.99 kB |
| Landing CSS | 18.22 kB | 19.70 kB | 4.88 kB | 5.22 kB |

The 4.49 kB gzipped JavaScript increase adds Motion's scroll timeline/observer runtime and the coordinated landing orchestration. The heavy interactive application remains a separate, on-demand bundle. Performance scores require an actual production Lighthouse measurement; bundle size alone does not establish LCP or responsiveness.

Measured locally on 2026-10-20 with Lighthouse 12.8.2, Chrome headless, default simulated mobile throttling (4× CPU, 150 ms RTT), production builds served on localhost, and existing external fonts enabled. Baseline samples scored 90/98 with LCP 2.93/2.10 s. The final mobile treatment (hero visible immediately) scored 96, LCP 2.62 s, CLS 0.000004 and total blocking time 0 ms. The performance-score target passed in that run; the 2.5 s LCP target was not reached. These are local lab measurements, not field metrics; external-font timing and run variance affect comparison. An earlier animated mobile hero scored 89/90 and was simplified before shipping.

Reproduce against a production server with `npx --yes lighthouse@12.8.2 http://127.0.0.1:4181/ --only-categories=performance --output=json --output-path=/tmp/telemetry-lighthouse.json --chrome-flags='--headless --no-sandbox'`. The deployable snapshot was separately built and browser-tested using committed application code plus only the website changes, leaving unrelated desktop work in progress out of the deployment.
