# Website

The homepage is static HTML/CSS with a small bundled vanilla Motion module. The interactive demo loads on demand in a dialog or at `demo/index.html`; it reuses the real React application with browser-only adapters. All telemetry, coach evidence and illustrated video in the demo are synthetic, and no native runtime or AI model is loaded.

## Build and verify

- `npm run build:website` typechecks the shared frontend and builds `dist-website`.
- `npm run test:website` exercises the production artifact beneath `/Ten-Tenths-Telemetry/`, including navigation, feature tabs, demo lifecycle, lap/channel selection, keyboard scrubbing, corner selection, analysis, coaching preview, video, responsive layouts and reduced motion.
- `npx vitest run website/demo/bridge.test.ts` tests the browser data adapters.
- `node scripts/capture-website-previews.mjs` refreshes the WebP screenshots from the built demo. Run the build again afterward to include the updated images. The story reuses the same real workspace screenshots.

Browser commands require local HTTP server and Chrome/Playwright access. There is no configured lint command; JavaScript syntax can be checked with `node --check website/main.js` and `node --check scripts/capture-website-previews.mjs`.

The existing `.github/workflows/deploy-website.yml` builds and publishes `dist-website`. Vite uses relative asset paths; no server, routing fallback or API key is required. Release lookup is optional and retains the existing download URL when unavailable. Motion coordinates one continuous scroll narrative; reduced motion disables decorative transformations and animated scrolling. The React/uPlot workspace loads on first demo launch and is retained across dialog closes.

## Continuous scroll narrative

`motion.js` uses the existing Motion vanilla `scroll` API as the single scroll source. No React landing rewrite, new dependency, smooth-scroll library or animation loop is required. Document progress drives the hero trace, settling workspace, feature focus, persistent telemetry rail, workflow, debrief evidence marker, demo frame and finish marker. Each chapter derives its own overlapping range from cached document coordinates; the root exposes `data-narrative-progress` and `data-chapter` for inspection.

The opening begins with the original headline and a small synthetic telemetry signal. The signal curves around the workspace heading and follows the outer content edge as the full interface settles into a sticky analysis position. The same screenshot element stays anchored while comparison, grip/shifts and video copy pass beside it. Scroll position selects the corresponding real screenshot. A short scroll-linked opacity dip softens each handoff; reversing or jumping restores the identical state without a delayed crossfade. Manual tab controls retain their arrow-key behavior and take priority while focused.

The persistent visual thread combines a narrow progress rail with a viewport-sized SVG connector. Cached layout anchors define the curved trajectory from the hero around the workspace heading and sticky interface, then into workflow, debrief, demo and finish line. Only visible spans are painted; a shared cursor follows the route in either scroll direction. Mobile retains the simpler rail and local signals. The complete screenshot remains visible throughout; the decorative cursor stays on the outer trajectory. Background grid opacity evolves continuously and recedes approaching download. Sections share the same dark ground with overlapping visual ranges rather than alternating background rectangles.

Geometry is measured on initialization, font readiness and resize. Layout offsets ignore animated transforms, preventing measurement feedback. The scroll callback writes presentation values and changes the screenshot only at chapter boundaries; transform/opacity dominate, with small SVG path/cursor and custom-property updates. It never measures layout or updates React state. Resize and Motion observers are disposed when suspended/destroyed and restored on back/forward-cache navigation. There are no idle animation timers.

At 800px and below the workspace returns to normal document flow, feature descriptions use compact layouts and movements shorten. Short desktop windows constrain screenshot height. Reduced motion disables decorative scroll transformations and uses a compact static story. The unenhanced/no-JavaScript page keeps headings, product content, full-page demo and download links available; animation initialization failure also restores a complete static presentation.

The demo is loaded only when launched. Its iframe is retained on dialog close, preserving lap selection, controls and keyboard state when reopened. While open, decorative motion is suspended and cannot cover the application or consume input. The full-page demo remains directly accessible. The desktop AI coach remains explicitly marked in development and absent from linked releases; all browser sample data remains labeled synthetic.

## Verification and bundle budget

Use `npm run build:website`, `npm run test:website` and `node --check website/motion.js`. The production browser verifier covers shared progress, intermediate chapter screenshots, feature-stage image selection, forward/backward jumps, live reduced-motion changes, no-JavaScript access, desktop/mobile overflow and retained demo state. Browser screenshots are written to `test-results/`.

Vite reports these decimal sizes with the same local dependencies:

| Landing asset | Before | After | Before gzip | After gzip |
| --- | ---: | ---: | ---: | ---: |
| JavaScript | 25.70 kB | 20.97 kB | 9.99 kB | 8.53 kB |
| CSS | 19.70 kB | 32.93 kB | 5.22 kB | 7.76 kB |

The single-source orchestration removes independent entrance-animation machinery. The responsive story styling increases compressed CSS by 2.54 kB, while JavaScript decreases by 1.46 kB (combined increase: 1.08 kB). The heavy application remains separately loaded on demand; existing WebP assets are reused. Bundle size alone does not establish frame rate or Core Web Vitals.

Measured on 2026-10-20 using Lighthouse 12.8.2, Chrome headless, default simulated mobile throttling and local production servers. The committed baseline scored 98, LCP 2257 ms, CLS 0.000004 and TBT 0 ms. The final website-only artifact scored 99, LCP 2030 ms, CLS 0 and TBT 0 ms. An intermediate version scored 85 (LCP 3604 ms); self-hosting the same licensed WOFF2 fonts, prioritizing initial content and deferring noncritical screenshot prefetch until scrolling resolved that regression. Fonts remain `font-display: swap`; no typography fallback experiment was shipped. Fonts add 69.35 kB of local assets, replacing the same fonts previously fetched from Google. These single-run local lab comparisons are not field metrics or a guarantee of a higher score on every run.

Chrome native-scroll sampling at 1440×900 recorded baseline median 16.7 ms and p95 16.8 ms frame intervals, and final median/p95 16.7 ms over a 299-frame forward/reverse traversal. Neither run recorded frames above 34 ms or long tasks. This is a limited local measurement, not a cross-device 60 FPS claim.

The final artifact was built using committed application code plus only the website changes, excluding unrelated desktop work in progress. Browser acceptance includes intermediate desktop/mobile screenshots, reverse jumps, live reduced motion, manual tab persistence, short windows, no-JavaScript access and demo keyboard controls. Caption space is reserved on narrow screens so changing the active screenshot does not move the scroll position. Reproduce with `npx --yes lighthouse@12.8.2 http://127.0.0.1:4181/ --only-categories=performance --output=json --output-path=/tmp/telemetry-lighthouse.json --chrome-flags='--headless --no-sandbox'`.
