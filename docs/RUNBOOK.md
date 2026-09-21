# Indooro – Runbook: Stand und nächste Schritte

| Feld | Wert |
| --- | --- |
| Stand | 2026-09-21 |
| Branch | `openspec/full-sync-2026-09-21` (gepusht, **noch nicht in `main` gemergt**) |
| Pull Request anlegen | https://github.com/htl-leo-itp-25-27-4-5BHITM/Indooro/pull/new/openspec/full-sync-2026-09-21 |
| OpenSpec | `npx -y @fission-ai/openspec@1.3.1 validate --all --strict` → **38 passed, 0 failed** (30 Specs, 8 offene Changes) |
| Code-Stand | unverändert seit `63a42d4` – bisher wurden **nur Specs und Dokumente** geändert, kein App- oder Backend-Code |

> **Für eine neue Claude-/Codex-Sitzung:** Lies zuerst diese Datei, dann `openspec/config.yaml` (Abschnitt „Current OpenSpec state and how to continue“). Arbeite den nächsten offenen Schritt aus Kapitel 2 ab. Ändere Verhalten nie am OpenSpec vorbei.

---

## 1. Was zuletzt gemacht wurde

| Datum | Schritt | Ergebnis |
| --- | --- | --- |
| 2026-09-17 | Swift-/Repository-Audit (Chat A) | `docs/specs/AUDIT.md` mit 38 Befunden `AUD-xx`; kanonische App ist `swift/indooro-EinkaeuferFinal` |
| 2026-09-17 | iOS-App vollständig in OpenSpec erfasst (Chat A) | Change `integrate-ios-client-specs` archiviert → Specs `ios-client-architecture`, `ios-backend-integration`, `ios-product-planning`, `ios-store-map-experience`, `ios-recipe-experience`; `mobile-*` erweitert, iOS-Baseline 18.5 |
| 2026-09-17 | Changes B, C, D angelegt (Chat A) | `fix-ios-contract-and-spec-drift`, `modernize-ios-client-architecture`, `protect-legacy-write-endpoints` |
| 2026-09-17 | FSD, TSD, Architecture Blueprint, iOS-Roadmap (Chat A) | `docs/specs/*` |
| 2026-09-17 | Full-Stack-Audit (Chat B) | `docs/audit/SYSTEM_MAP.md`, `CODE_AUDIT.md`, `MODERNIZATION_BLUEPRINT.md` |
| 2026-09-17 | Querschnitts-Specs (Chat B) | Change `add-cross-platform-baseline-specs` archiviert → `admin-dashboard`, `swift-client`, `backend-core`, `shared-api` inkl. `openapi.yaml` (86 Operationen) |
| 2026-09-17 | Changes SH, AD, DA, SC angelegt (Chat B) | `harden-platform-security-baseline`, `fix-admin-dashboard-contract-drift`, `optimize-backend-data-access`, `establish-shared-api-contract` |
| 2026-09-21 | Altlasten bereinigt | 8 fertige Changes archiviert (Rezepte, Upsell, Admin-Redesign, JaCoCo …); manuelle Tests vom Team bestätigt; `align-openspec-audit-findings` repariert (RENAMED); überholter `improve-upsell-candidate-ranking` mit `--skip-specs` archiviert; alle „TBD“-Purposes ersetzt |
| 2026-09-21 | Changes abgestimmt | keine doppelten Requirements; Zuständigkeiten geklärt (Rate Limiting/PDF-Grenzen → SH, OpenAPI-Export → SC, Swift-Codegen/429 → C); Java-Ziel einheitlich **JDK 21**; jeder Befund einem offenen Change zugeordnet |
| 2026-09-21 | Commit + Push | Commits `89f0675`, `d1320de` auf `openspec/full-sync-2026-09-21` |

---

## 2. Nächste Schritte (in dieser Reihenfolge)

### Schritt 0 – Heute: Branch übernehmen und Repo aufräumen

- [ ] 0.1 Pull Request aus `openspec/full-sync-2026-09-21` erstellen und in `main` mergen (Link oben). Die vielen „gelöschten“ Dateien im Diff sind **Verschiebungen** nach `openspec/changes/archive/` – nichts geht verloren.
- [ ] 0.2 Nach dem Merge lokal: `git switch main && git pull`.
- [ ] 0.3 Lokale Reste entscheiden:
  - `swift/indooro-EinkaeuferFinal.zip` → löschen (altes Archiv).
  - `…/UserInterfaceState.xcuserstate` → nicht committen (persönliche Xcode-Datei); `xcuserdata/` wird mit Change C in `.gitignore` aufgenommen.
  - `documentation/LEOCLOUD_HOSTING_GUIDE_GENERAL.md` → committen, falls benötigt.

### Schritt 1 – Sofortmaßnahmen (manuell, Tag 0–2, kein Code)

Diese schließen akute Angriffsflächen auf LeoCloud und stehen **vor** jeder Code-Arbeit (Quelle: `docs/audit/MODERNIZATION_BLUEPRINT.md` §5.1).

- [ ] 1.1 **Passwörter rotieren** (P0-SEC-1, Change SH Task 1.1): Demo-Benutzer, Keycloak-Master-Admin und OIDC-Client-Secret in LeoCloud neu setzen; neues Client-Secret im Kubernetes-Secret hinter `QUARKUS_OIDC_CREDENTIALS_SECRET` eintragen und Backend neu starten.
  Abnahme: Login mit den Passwörtern aus dem Repo schlägt fehl.
- [ ] 1.2 **OpenSearch/Dashboards nicht mehr öffentlich** (P0-SEC-2, SH Task 5.1): Services in `k8s/opensearch.yaml` auf `ClusterIP` stellen, anwenden.
  Abnahme: kein Zugriff von außerhalb des Namespace.
- [ ] 1.3 GitHub-Dependabot-Warnungen ansehen (beim Push gemeldet: 12, davon 6 high) und in SH/P1-SEC-6 einordnen.

### Schritt 2 – Phase 1 „Absichern“ (Sprint 1–2)

Reihenfolge; Changes in verschiedenen Teilsystemen dürfen parallel laufen.

| # | Change | Warum jetzt | Kern-Abnahme |
| --- | --- | --- | --- |
| 2.1 | **D** `protect-legacy-write-endpoints` (0/23) | anonymes Überschreiben des Default-Layouts, offene PDF-/Index-Routen | httpYac-Rollenmatrix: anonym 401, store-manager 403, admin 2xx; Index doppelt anlegen → 409 |
| 2.2 | **SH** `harden-platform-security-baseline` (0/40) | XSS im Editor, Keycloak-Prod, Rate Limits, PDF-Grenzen, Workload-Härtung | Playwright-XSS-Test grün; 21. Upsell-Plan-Request → 429 |
| 2.3 | **B** `fix-ios-contract-and-spec-drift` (1/43) | kaputtes „Nicht mehr für dieses Produkt“, erfundene Koordinaten, unsichere Position unsichtbar | Dismiss → 2xx; Filialen ohne Koordinaten nur unter „Ohne Kartenposition“ |
| 2.4 | **AD** `fix-admin-dashboard-contract-drift` (0/25) | Rezept-Bearbeitung verliert Daten (P0-DATA-1) | bearbeitetes Rezept behält Bild, Beschreibung, Tags |
| 2.5 | **DA** `optimize-backend-data-access` (0/32) | OpenAI-Aufruf in DB-Transaktion blockiert (P0-PERF-1) | 40 parallele Plan-Requests: `/api/stores` p95 < 500 ms |

### Schritt 3 – Phase 2 „Fundament“ (Sprint 3–5)

| # | Aufgabe | Change |
| --- | --- | --- |
| 3.1 | CI: Tests nicht mehr überspringen, **JDK 21 überall**, OpenSpec-Validierung, iOS-Build-Job | SC Task 6 + C 13.4–13.5 |
| 3.2 | API-Vertrag erzwingen: Annotationen, `oasdiff`, `/api/v1`, einheitliche Fehler, `api/openapi/indooro-mobile.yaml` | **SC** `establish-shared-api-contract` (0/20) |
| 3.3 | Quarkus 3.6 → 3.33 LTS, PDFBox 3.0.8, Keycloak 26.x, Scans | neuer Change `upgrade-quarkus-lts` (noch anzulegen) |

### Schritt 4 – Phase 3 „Architektur“ (Sprint 6–9)

| # | Aufgabe | Change |
| --- | --- | --- |
| 4.1 | iOS: Swift 6 (120 Diagnosen → 0), Module `IndooroKit`, `APIClient`, Persistenz v2, `BeaconManager` zerlegen, Tests, iOS-CI | **C** `modernize-ios-client-architecture` (0/64); Reihenfolge S1–S8 aus `docs/audit/MODERNIZATION_BLUEPRINT.md` §1.2 |
| 4.2 | Upsell-Qualität: Varianten-Filter, idempotente Opportunities, begrenzter Retry | **U4** `stabilize-upsell-quality-and-request-lifecycle` (0/135) – nach C 10.4 im neuen `UpsellModel` |

### Schritt 5 – Phase 4 „Ausbau“

P2-Listen aus `docs/specs/ROADMAP.md` (iOS) und `docs/audit/MODERNIZATION_BLUEPRINT.md` §5.3 (Admin/Backend). Dafür werden **neue** Changes angelegt, u. a. `clean-repository-legacy`, `modularize-admin-frontend`, `expand-backend-test-suite`, `define-shelf-access-side`, `add-ios-dark-mode`, `upgrade-opensearch-3`.

---

## 3. So wird ein Change abgearbeitet

```bash
# Stand ansehen
npx -y @fission-ai/openspec@1.3.1 list
npx -y @fission-ai/openspec@1.3.1 show <change>

# Arbeitsbranch
git switch main && git pull
git switch -c change/<change>
```

1. `openspec/changes/<change>/proposal.md`, `design.md`, `specs/**` lesen.
2. `tasks.md` von oben nach unten umsetzen; jeden Task nach Umsetzung und Prüfung auf `- [x]` setzen. Manuelle Tests mit Datum und Gerät im Task-Text vermerken.
3. Wenn sich unterwegs herausstellt, dass eine Anforderung anders sein muss: **zuerst** die Delta-Spec im Change anpassen, dann den Code.
4. Prüfen:

```bash
npx -y @fission-ai/openspec@1.3.1 validate <change> --strict
cd backend/indooro_server && ./mvnw verify && cd ../..
npm run admin:verify                      # bei Admin-Änderungen
npm run api:test                          # bei API-/Auth-Änderungen (lokaler Stack nötig)
xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj \
  -scheme MCindooroApp -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' build   # bei iOS-Änderungen
```

5. Archivieren, sobald alle Tasks erledigt sind:

```bash
npx -y @fission-ai/openspec@1.3.1 archive <change> --yes
grep -rn "TBD - created by archiving" openspec/specs   # Platzhalter sofort ersetzen
npx -y @fission-ai/openspec@1.3.1 validate --all --strict
```

6. Commit, PR, Merge. Danach dieses Runbook (Kapitel 1 und 2) aktualisieren.

---

## 4. Offene Entscheidungen

| ID | Frage | Wer | Blockiert |
| --- | --- | --- | --- |
| E-1 | Bedeutung von `accessAngle` (Richtung, Nullpunkt) und Bedienelement im Editor | Team Editor | `define-shelf-access-side` |
| E-2 | Sind Filial-Layouts nordausgerichtet? Sonst Nordwinkel im Layout nötig | Team iOS | Heading-Pfeil in gedrehten Filialen |
| E-3 | Darf „SPAR“ in der App stehen? (Change B ersetzt durch „Filialen“) | Auftraggeber | B Task 6.4 |
| E-4 | Layout-Versionswahl für Kund:innen oder nur Diagnose-Menü? | Team iOS | C Task 10.5 |
| E-5 | Admin-Frontend statisch weiterführen oder SPA (ADR-012 / BP-ADR-01) | Team Admin | `modularize-admin-frontend` |
| E-6 | Rechte der Filialleitung (Archivieren, Beacon-Identität) | Auftraggeber | Delta auf `admin-role-access-control` |

---

## 5. Wo was liegt

| Pfad | Inhalt |
| --- | --- |
| `openspec/specs/` | **Single Source of Truth** (30 Capabilities) |
| `openspec/changes/` | 8 offene Changes; `archive/` = gesamte Historie |
| `openspec/config.yaml` | Projektkontext, Regeln, aktueller Stand, Change-Reihenfolge |
| `docs/specs/` | iOS-fokussiert: AUDIT, FSD, TSD, Architecture Blueprint, ROADMAP |
| `docs/audit/` | Full-Stack: SYSTEM_MAP, CODE_AUDIT, MODERNIZATION_BLUEPRINT |
| `docs/RUNBOOK.md` | diese Datei – Einstiegspunkt |
| `swift/indooro-EinkaeuferFinal/` | einzige aktive iOS-App (die anderen Swift-Ordner sind Legacy) |
| `backend/indooro_server/` | Quarkus-Backend inkl. Admin-Plattform unter `src/main/resources/META-INF/resources/admin` |
| `api-tests/httpyac/` | API- und Rollen-Tests |
| `k8s/` | LeoCloud-Manifeste (Namespace `student-it220209`) |
