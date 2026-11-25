## 1. Planning (orchestrator)

- [x] 1.1 Inventory POST endpoints, clients and admin pages; write proposal, design, spec deltas.
- [x] 1.2 Validate the change with `openspec validate polish-platform-consistency --strict` and merge it.

## 2. P1 Backend create contract (polish-backend)

- [x] 2.1 List every `@POST` in `backend/indooro_server/src/main/java/at/htl/resource/**` and classify it as create, upsert or action in `design.md` appendix.
- [x] 2.2 Return `201 Created` + `Location` + empty body for every single-resource create endpoint.
- [x] 2.3 Return `201`/`204` + `Location` for upsert endpoints.
- [x] 2.4 Add missing `GET` endpoints for every `Location` target with the same role rules.
- [x] 2.5 Update backend tests (status, header, empty body, GET on Location); `./mvnw verify` green.
- [x] 2.6 Update `api/openapi/**` and `api-tests/httpyac/**` to the new responses.
- [x] 2.7 Update `admin-ui/src/api/**` with a tolerant create helper and tests.

## 3. P2 Admin pages and tables (polish-admin-pages)

- [x] 3.1 Remove the intermediate page after "Store anlegen"; land on the new store detail.
- [x] 3.2 Add a shared responsive table container and apply it to every admin table (Beacons first).
- [x] 3.3 Sweep every admin page for overflow, scroll traps and spacing at 1280 px and 1440 px.
- [x] 3.4 Unify buttons, labels and German copy.
- [x] 3.5 Add or fix empty, loading and error states on every data page.
- [x] 3.6 Tests, lint, typecheck, build green; before/after screenshots recorded.

## 4. P3 Admin layout editor (polish-admin-editor)

- [x] 4.1 Make the editor route fill the viewport; panels and canvas scroll internally; no document scroll at 1280x800 and 1440x900.
- [x] 4.2 Check the legacy editor route for the same issue and fix it.
- [x] 4.3 Tests, lint, typecheck, build green; before/after screenshots recorded.

## 5. P4 iOS sweep (polish-ios)

- [ ] 5.1 Confirm the app calls no changed create endpoint; adapt if it does.
- [ ] 5.2 Sweep all screens for overflow, truncation, Dynamic Type, safe-area and dark-mode issues and fix them.
- [ ] 5.3 Unify German copy and button styles.
- [ ] 5.4 Build and unit tests green; simulator screenshots recorded.

## 6. P5 Web clients sweep (polish-web)

- [x] 6.1 Sweep `pilot-showcase` at 375 px and 1440 px for overflow and consistency issues and fix them; tests and build green.
- [x] 6.2 Sweep the legacy `app/` web pages that are still deployed for the same issues; fix or document as legacy.
- [x] 6.3 Update stale API statements in `android/*.md` to the 201 + `Location` contract.

## 7. Integration (orchestrator)

- [ ] 7.1 All package PRs merged, CI green on `main`.
- [ ] 7.2 Integration check on `main`: backend tests, admin-ui tests and build, screenshot check of admin pages.
- [ ] 7.3 Write final `HANDOFF.md` and archive the change.

## 8. P6 Customer web and landing (polish-customer-web)

- [x] 8.1 Landing `index.html` polish: German umlauts, focus ring, mobile spacing, reduced motion.
- [x] 8.2 Customer web polish: map labels no longer clipped, header aligned with page column, empty status hidden; no overflow at 375/768/1440.
- [x] 8.3 Legacy static admin `app.js` and `editor.js`: create calls tolerate 201/204 + `Location` (GET it), else parse body as before. (Delivered by #231, P1.)
- [x] 8.4 Tests and before/after screenshots under `docs/polish/customer-web/`.



## 9. P7 Admin responsive and header polish (polish-admin-responsive)

- [x] 9.1 Remove the "Indooro Admin" heading above pages; the page title is the only `h1`.
- [x] 9.2 Collapse the sidebar into a menu below 900 px.
- [x] 9.3 Make every admin page work at 768x1024 and 390x844: no document horizontal scroll, single-column forms, touch targets of at least 40 px.
- [x] 9.4 Compact Beacons row actions to one line with a keyboard-accessible "Weitere Aktionen" menu.
- [x] 9.5 Consistent German header copy and role labels.
- [x] 9.6 Typecheck, lint, tests, build green; screenshots at 390, 768 and 1280 px under `docs/polish/admin-responsive/`.
- [x] 9.7 Show every admin table as stacked cards on phones (no sideways scrolling, actions at the bottom of the card).
- [x] 9.8 Keep the space in the "Indooro Admin" brand on phones.
- [x] 9.9 Browser test for the card layout; screenshots at 390 and 768 px updated.

## 10. P8 Admin browser tests (polish-admin-tests)

- [x] 10.1 Run `npm run test:browser` on `main` and classify every failure as stale test, UI bug or flaky.
- [x] 10.2 Fix stale tests and mocks, including create POSTs answering `201 Created` + `Location`.
- [x] 10.3 Add browser assertions for the polish contract (no horizontal scroll, editor fits viewport, store create lands on detail).
- [x] 10.4 Full browser suite green; report whether CI runs it.
