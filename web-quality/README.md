# Customer web quality gates

This isolated package serves the deployed root landing page and `customer/` from
`backend/indooro_server/src/main/resources/META-INF/resources/`. It does not build
or use the legacy `app/`, the root smoke config, or a running backend.

```sh
cd web-quality
npm ci
npx playwright install chromium
npm test
```

`npm run test:a11y` checks WCAG 2 A/AA and 2.1 A/AA with axe, failing on serious
or critical violations. Complete axe JSON results are attached to the report.
Automated checks do not replace manual keyboard/screen-reader reviews.

`npm run test:visual` compares full-page screenshots at 390×844, 768×1024 and
1440×900. Coverage includes landing, store selection, finder/map, populated
search (including an unlocated product), shopping list/route with a completed
item, empty results and a connection error. API calls are intercepted with
`page.route`; unknown endpoints fail. Fixtures, locale, timezone, light theme,
reduced motion and disabled screenshot animations keep rendering deterministic.
The SVG map has fixed geometry and routes, so no masking is needed. There are
no live dates, IDs or randomized canvases. The allowed pixel difference is 0.5%.

## Linux baseline procedure

Baselines are produced on `ubuntu-24.04` with Playwright 1.60.0 Chromium, not on
the development Mac. On the initial push only, CI runs visual tests with
`--update-snapshots=missing` and uploads `web-quality-linux-snapshots`. Download
that artifact with `gh run download RUN_ID -n web-quality-linux-snapshots -D
web-quality/tests/snapshots`, review the images, commit them, and remove the
bootstrap flag from CI in the same commit. Subsequent CI runs compare strictly.
Do not accept updates just to make an unexplained difference pass.

For intentional future visual changes, temporarily generate reviewed updates in
an Ubuntu 24.04 CI run, download and inspect the artifact, commit the approved
images, and restore strict comparison before merging. Local Mac screenshots are
useful for inspection but must never replace committed Linux baselines.
