# PR vorbereiten: Pilot-Build für iOS

Base: `pilot/first-store`
Head: `pilot/ios-pilot-build`
Status: **Entwurf; Integration und Human steps offen.** `gh` ist auf diesem Rechner nicht installiert; dieser Text ist der beauftragte Fallback, kein bereits geöffneter GitHub-PR.

## Änderung

Zentrale API-Konfiguration mit 15-s-Timeout und Pilot-Profil; Rezepte/AR ausgeblendet und Upsell gesperrt; keine stille Filialumschaltung. Filialbezogene, korrekt codierte Suche zeigt Transport-/HTTP-/Decodierfehler und Retry. Einführung, Berechtigungen nach bewusster Wahl von „Mit Ortung“, Hinweisbanner, App-Icon, aufgeräumtes App-Bundle und ATS-Härtung.

## Prüfungen

`swift test`: 77 + 9 Tests, 0 Fehler.
`xcodebuild … -configuration Debug -sdk iphonesimulator … CODE_SIGNING_ALLOWED=NO`: **BUILD SUCCEEDED**.
Separater Simulator-UI-Smoke: **TEST SUCCEEDED** (Einführung/Tabs/Fehlersuche).
`openspec validate --all --strict`: **64 passed, 0 failed**.
`git diff --check`: erfolgreich.

Screenshots und Details: `docs/pilot-readiness/evidence/prepare-pilot-ios-build/`. Rollenprüfungen/Live-Backend/HW separat; keine Beacon-Genauigkeitsbehauptung.

## Vor Merge erledigen

Offene Eigentums-Gates in `VERIFY.md`/`STATUS.md`: BeaconManager-Layoutdecoder, Filialübersicht und Release-Debug-UI durch Erik, Freigabe alter Views. Außerdem Testgeräte und Installation, vollständiger Tour-/Netznachweis sowie restliche manuelle Prüfungen. Kein automatischer Merge und kein Archivieren.
