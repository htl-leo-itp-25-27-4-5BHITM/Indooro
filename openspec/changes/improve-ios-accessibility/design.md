## Decisions

1. Replace fixed font sizes with text styles; use `ViewThatFits` or vertical stacks at accessibility sizes.
2. Map: one accessibility element summarizing target, distance and route origin; shelf elements not individually exposed.
3. Audit result stored in `docs/pilot-readiness/evidence/accessibility/AUDIT.md` with before/after.

## Baseline

2026-10-16: git fetch origin, pilot/ios-accessibility auf origin/pilot/ios-accessibility ausgecheckt, git merge origin/pilot/first-store: Already up to date, 46b9ad1. swift test: 77 Tests, 0 Fehler, Exit 0. Vorgeschriebener Debug-Simulator-Build: BUILD SUCCEEDED, Exit 0. OpenSpec --all --strict: 64/0. Ergebnis in evidence/improve-ios-accessibility/baseline.txt.

## Implementation notes

- Start-Gate Task 1.1 blockiert alle Folgeaufgaben: origin/pilot/ios-pilot-build a20d385 ist nicht in pilot/first-store 46b9ad1 enthalten. Kein direkter A-Merge auf C ohne entsprechenden Auftrag; B-Fallback war ausdrücklich begrenzt.
- Kein Accessibility Inspector-Audit, keine UI-/Kontrast-/VoiceOver-Abnahme vorgetäuscht. AUDIT.md enthält nächste Schritte. Für MapView/StoreMapPage fehlt außerdem die Absprache mit Erik.
