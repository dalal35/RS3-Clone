# Premium telemetry website implementation plan

Goal: Put the real telemetry product at the center of a fast, responsive motorsport website.

Design: Keep cyan/amber branding, dark graphite surfaces and precise mono labels. Pair a large editorial headline with real browser-demo captures; replace repetitive feature cards with a selectable product stage. Open the real reused React workspace on demand. Keep download notices, URLs and relative GitHub Pages assets.

- [x] Capture telemetry, advanced analysis and synchronized video from the actual browser demo with explicit synthetic-data captions.
- [x] Implement responsive hero, product selector, workflow, driving-insights section and accessible on-demand demo.
- [x] Use Motion's small vanilla animation API plus CSS transitions, with reduced-motion support and no continuous background loops.
- [x] Improve website-only demo onboarding and keyboard exploration in parallel.
- [x] Extend production-prefix browser checks for selectors, demo lifecycle, mobile and reduced motion; run website typecheck, adapter tests and production build.
- [x] Inspect desktop/mobile browser captures and obtain independent acceptance review. Preserve unrelated dirty files and native applications.

Verification: production build/typecheck passed; 6 browser-adapter tests passed; Chrome production-prefix interactions, 320/390/768/1440/1920 responsive layouts and reduced-motion checks passed. Both existing installer URLs returned HTTP 200. No lint command is configured; JavaScript syntax and diff whitespace checks passed. Deployment workflow preserved; no deployment was performed.
