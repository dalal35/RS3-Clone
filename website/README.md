# Website

The homepage is static HTML/CSS with a small bundled vanilla Motion module. The interactive demo loads on demand in a dialog or at `demo/index.html`; it reuses the real React application with browser-only adapters. All telemetry, coach evidence and illustrated video in the demo are synthetic, and no native runtime or AI model is loaded.

## Build and verify

- `npm run build:website` typechecks the shared frontend and builds `dist-website`.
- `npm run test:website` exercises the production artifact beneath `/Ten-Tenths-Telemetry/`, including navigation, feature tabs, demo lifecycle, lap/channel selection, keyboard scrubbing, corner selection, analysis, coaching preview, video, responsive layouts and reduced motion.
- `npx vitest run website/demo/bridge.test.ts` tests the browser data adapters.
- `node scripts/capture-website-previews.mjs` refreshes the WebP screenshots from the built demo. Run the build again afterward to include the updated images. The hero uses a crop of the same real interface.

Browser commands require local HTTP server and Chrome/Playwright access. There is no configured lint command; JavaScript syntax can be checked with `node --check website/main.js` and `node --check scripts/capture-website-previews.mjs`.

The existing `.github/workflows/deploy-website.yml` builds and publishes `dist-website`. Vite uses relative asset paths; no server, routing fallback or API key is required. Release lookup is optional and retains the existing download URL when unavailable. Motion uses transform/opacity reveals, and reduced motion disables transitions and animated scrolling. The React/uPlot workspace does not load until the demo is opened and is removed on close.
