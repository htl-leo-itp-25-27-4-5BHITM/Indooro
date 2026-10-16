# 02 – Branch-Analyse

Stand: 2026-10-15 · Repository `htl-leo-itp-25-27-4-5BHITM/Indooro` · ausschließlich read-only untersucht (log, diff, merge-base, cherry, ls-tree; Konfliktprüfung mit `git merge-tree --write-tree` ohne Ref-Änderung). Kein Branch wurde geändert, gelöscht, gemergt oder gepusht. Remote-Daten wurden **nicht** neu geholt; Remote-Stand = letzter lokaler Fetch.

---

## 1. Übersicht

Basis aller aktiven Branches: `main` = `origin/main` = `99b802b` („Merge website into main“, 2026-10-05).

| Branch | Tip | Datum | vor / hinter `main` | Remote | Zweck | Status |
|---|---|---|---|---|---|---|
| `main` | `99b802b` | 2026-10-05 | 0 / 0 | ja | Kanonischer Stand, auf LeoCloud deployt (laut DEPLOYMENT.md, nicht neu geprüft) | aktiv, aber **veraltet gegenüber Arbeitsbranches** |
| `codex/stabilize-ios-navigation` | `2956fe6` | 2026-10-15 | 14 / 0 | **nein** (nur lokal, Worktree `../Indooro-nav`) | Umsetzung von [docs/NAVIGATION_REVIEW.md](../NAVIGATION_REVIEW.md): neue Positions-/Navigationspipeline, Tests, Recorder | **aktiv, wichtig, ungemergt** |
| `claude/ar-alignment-experiment` | `8401a7a` | 2026-10-15 | 15 / 0 | nein | Stabilisierung + 1 Commit: AR-Kompass-Yaw-Lock-Experiment (DEBUG-only) | experimentell |
| `codex/admin-platform-rebuild` | `1b1dc63` | 2026-10-15 | 161 / 0 | ja (Remote-Stand evtl. älter) | Neubau Admin-UI (React/Vite), Backend-Erweiterungen, iOS-Fixes für exakte Regalzuordnung | **aktiv, wichtig, ungemergt, nicht deployt** |
| `codex/indooro-v2-roughcut` (aktueller Checkout) | `a059149` | 2026-10-15 | 2 / 24 | ja (2 Commits nicht gepusht) | Werbefilm V2 (Rough Cut) + 2 Doku-Commits, die auf dem Stabilisierungs-Branch bereits enthalten sind | Marketing, veraltet |
| `codex/indooro-v2-prototypes` | `d668f10` | 2026-09-30 | 0 / 29 | nein | Werbefilm-Prototypen | gemergt, stale |
| `feature/indooro-ad-v2-concept` | `4557699` | 2026-09-30 | 0 / 32 | nein | Werbefilm-Konzept | gemergt, stale |
| `codex/android-parity-plan` | `745c61f` | 2026-10-04 | 0 / 68 | nein | Planungsdokumente für eine Android-App (kein Android-Code) | gemergt, stale |
| `claude/elated-brahmagupta-2b15f5` | `99b802b` | – | 0 / 0 | nein | identisch mit `main` (Worktree-Ordner zeigt auf den AR-Branch) | leer |
| `origin/website` | `9f549e4` | 2026-10-12 | 3 / 216 | ja | Statische Marketing-Website (GitHub Pages), Autor M. Stelzmüller | aktiv, separat |

Weitere Worktrees: `.codex/worktrees/fix-planning-audit` (detached `6d65bf4`), `.codex/worktrees/indooro-v1-handover` (`main`).

### Commit-Verteilung (alle Refs, 480 Commits)

| Autor | Commits |
|---|---|
| bico37 (überwiegend KI-gestützte Codex-/Claude-Sessions) | 370 |
| Michael Stelzmüller | 49 |
| David Berghahn (zwei Schreibweisen) | 25 |
| Niilo Rieser (zwei Schreibweisen) | 18 |
| Fabian Joos (zwei Schreibweisen) | 14 |
| Erik Bergi | 4 |

Spitze: Oktober 2026 mit 187 Commits (184 von bico37), September 52. **Beobachtung:** Der Großteil der jüngsten Entwicklung entsteht in einer Person und in KI-Sessions. Für Pilot und Projekt ist das ein Wissens- und Verteilungsrisiko im Team (siehe [07_ACTION_PLAN.md](07_ACTION_PLAN.md), Teamaufteilung).

---

## 2. Die zwei entscheidenden Branches im Detail

### 2.1 `codex/stabilize-ios-navigation` (14 Commits, 53 Dateien, davon 42 in `swift/indooro-EinkaeuferFinal`)

Inhalt auf Code-Ebene (Commits in Reihenfolge):

| Commit | Änderung | Behebt (NAVIGATION_REVIEW) |
|---|---|---|
| `72ba0f4` | SwiftPM-Paket `IndooroNavigationCore` mit Baseline-Tests (`swift test`) | Teststrategie 4.1 |
| `59c8d22` | Exakte Regalzuordnung über Kategorie, veraltete Ziele löschen | C.12 |
| `dbd0054` | Messfilter je Beacon **und** Quelle, Lösen nur noch im Timer-Takt | C.7 |
| `231e989` | PoseFusion + MapMatcher ersetzt durch Schätzer + `WalkableProjector` | C.2, C.3, C.4 |
| `94ffb77` | Deterministischer A* mit Abbiegestrafe, Binary Heap, geteilter Graph | C.5 |
| `9e9a448` | `NavigationSession` als einziger Besitzer von Route, aktivem Stopp, Fortschritt | C.1, C.8, C.9 |
| `910bf50` | Tourplanung nur bei Ereignissen: Distanzmatrix, Nearest Neighbor, **2-opt** | C.1, C.11 |
| `8df1324` | Restroute zeichnen, „Neu planen“-Knopf, weniger `@Published`-Updates | C.10 |
| `19f7d7c` | DEBUG-Recorder (JSON Lines) und deterministischer Replay mit Metriken | Teststrategie 4.2 |
| `c0d6666`, `c2b93af`, `2956fe6` | Doku, Verifikation, Simulator-Prüfung | – |

Belegte Messwerte (synthetisch, aus `swift/indooro-EinkaeuferFinal/NavigationFixtures/BASELINE.md` auf diesem Branch):

| Kennzahl | vorher | nachher |
|---|---|---|
| Nachlauf nach 20 s Gehen mit 1,3 m/s (Konfidenz 1,0) | 5,9 m | 0,5 m |
| Positionsverschiebung nach bestätigtem 20-m-Sprung | 0 m (hängt fest) | 20 m |
| Gangwechsel durch Regal | bleibt im alten Gang | landet im neuen Gang |
| Routenformen bei 40 Starts im selben Knoten | 4–8 | 1 |
| Neue Routen bei 60 s Stillstand zwischen zwei gleich weit entfernten Stopps | Wechsel bei jedem Update | 0 |
| Reroute nach 3,5 s im falschen Gang | praktisch nie (20 s Cooldown, 8 m) | genau 1 |
| Tour 25 Stopps: NN vs. NN + 2-opt | – | 271,8 m → 251,3 m (−7,6 %) |

OpenSpec-Change `stabilize-ios-navigation-pipeline`: **83 von 93 Tasks erledigt.** Offen sind ausschließlich die **Feldaufgaben** (12.1–12.5 Aufnahmen im Markt, Kalibrierung; 13.6 Gerätetest im Markt), eine Messung der SwiftUI-Invalidierung (10.4) und die Archivierung (14.x).

**Bewertung:** Fachlich der wichtigste Fortschritt des Projekts. Alle Messungen sind synthetisch (simuliertes Rauschen, Demo-Layout mit künstlichem Beacon-Raster). Der Branch ist **nicht gepusht** – ein Laptop-Defekt würde ihn vernichten.

### 2.2 `codex/admin-platform-rebuild` (161 Commits, 232 Dateien)

- **Backend (66 Dateien):** Store-, Region-, Beacon-, Layout-Versionierung, Rollen und Scopes (admin, region-manager, store-manager), Audit-Log, Validierungen bei der Veröffentlichung (keine unzugeordneten Beacons, nur routbare Regaladressen, passende Produktziele).
- **Admin-UI (ca. 75 Dateien):** React 19 / TypeScript / Vite unter `admin-ui/`, ausgeliefert unter `/admin/next/`. 9 von 10 Routen bereits „umgeschaltet“, der Layout-Editor wird zusätzlich im Legacy-Code weiterentwickelt (Größenvorlagen, Rückgängig, Tastaturbedienung, Barrierefreiheit).
- **iOS (14 Dateien, `5936ed4`, `d8aa91b`, `f118e20`, `eb4d3e8`, `a0f9b1f`):** exakte Regalzuordnung, Löschen veralteter Routen bei Produkten ohne Regal und bei Filialwechsel.
- **OpenSpec `rebuild-admin-platform`:** 34 von 39 Tasks erledigt.
- **Verifikation:** 142 Backend-Tests, letzter lokaler Lauf 0 Fehler (Surefire-Reports vom 2026-10-15; in dieser Analyse nicht neu ausgeführt). Live-Prüfungen liefen gegen einen **lokalen** Stack, nicht gegen LeoCloud. **Nicht deployt.**

**Bewertung:** Für die Einrichtung eines echten Marktes deutlich besser als `main` (Validierung beim Veröffentlichen, Beacon-Verwaltung, Layout-Historie). Für einen einzelnen Pilotmarkt aber überdimensioniert: Rollenmodell, Regionen und Recipe-Editor werden im Pilot nicht gebraucht.

---

## 3. Überschneidungen und Konflikte

Geprüft mit `git merge-tree --write-tree codex/stabilize-ios-navigation codex/admin-platform-rebuild` (rein im Objektspeicher, keine Ref- oder Arbeitsbaumänderung):

| Datei | Konflikt |
|---|---|
| `swift/indooro-EinkaeuferFinal/indooroApp/Managers/BeaconManager.swift` | **ja** |
| `swift/indooro-EinkaeuferFinal/indooroApp/Models/LayoutData.swift` | **ja** |
| `swift/indooro-EinkaeuferFinal/indooroApp/Views/Main/StoreMapPage.swift` | **ja** |
| `swift/indooro-EinkaeuferFinal/indooroApp/Managers/ShoppingListManager.swift` | überschneidend, automatisch lösbar |

Ursache: Beide Branches haben die exakte Regalzuordnung (C.12) **unabhängig voneinander** implementiert (`59c8d22` vs. `5936ed4` ff.). Die Konflikte sind inhaltlich klein, aber in den zentralen Navigationsdateien. Aufwand für eine saubere Zusammenführung: **ca. 0,5–1 Tag**, danach `swift test` und ein Simulatorlauf.

Backend und Admin berührt nur der Admin-Branch. Keine Konflikte außerhalb von `swift/`.

---

## 4. Ältere Stände: Fehlt etwas Wertvolles?

Die iOS-App existiert dreimal im Repository (alle auf `main`):

| Ordner | Erster Commit | Swift-Zeilen | Navigationsstand |
|---|---|---|---|
| `swift/indooroApp` | 2026-01-07 | 2.654 (24 Dateien) | Einfach: Kalman pro Beacon, Top-3-Centroid, Grid-A* mit 8 Richtungen und Abbiegestrafe, ein Ziel |
| `swift/indooro-` | 2026-04-15 (`37208b0` „zweite App“) | 9.935 (45 Dateien) | Erste Version der komplexen Pipeline, Einkaufslisten |
| `swift/indooro-EinkaeuferFinal` | 2026-05-26 (`19ad495`) | 16.687 (52 Dateien) | **Kanonisch**, Basis aller aktuellen Arbeit |

Ergebnis des Vergleichs:

- Der in [docs/NAVIGATION_REVIEW.md](../NAVIGATION_REVIEW.md) beschriebene Vorteil der März-Version (Abbiegestrafe, ein Filter, direkte Position) ist auf dem Stabilisierungs-Branch **neu umgesetzt** (`94ffb77`, `231e989`). Es lohnt nicht, auf die alte App zurückzugehen.
- `Pathfinder.swift` (185 Zeilen) ist in `EinkaeuferFinal` toter Code.
- Die Ordner `swift/indooroApp` und `swift/indooro-` sind für den Pilot **nicht nötig**. Nicht löschen, aber im Pilot ignorieren und in der README als Archiv kennzeichnen.
- Der AR-Commit verweist auf ein Repository „mc-indooro“ (`9ef8866`), das hier nicht vorliegt. Für den Pilot irrelevant.

Problematische Commit-Messages (erschweren Fehlersuche):

- `1e6b243` „JaCoCo coverage“ enthält in Wahrheit große Navigationsänderungen.
- `718fcf3` „3 swift projects restore:“ (15.414 geänderte Zeilen) und `37208b0` „zweite App“ (11.068 Zeilen) sind nicht nachvollziehbar.

---

## 5. Offene OpenSpec-Changes (Tasks erledigt / gesamt)

| Change | `main` | Stabilisierung | Admin-Rebuild | Pilotrelevanz |
|---|---|---|---|---|
| `stabilize-ios-navigation-pipeline` | 0/93 | **83/93** | – | **hoch** |
| `rebuild-admin-platform` | – | – | 34/39 | mittel |
| `harden-platform-security-baseline` | 0/40 | – | 8/40 | mittel (nur relevante P0-Punkte) |
| `protect-legacy-write-endpoints` | 0/23 | – | 0/23 | mittel (ungeschützte PDF-Endpunkte) |
| `fix-admin-dashboard-contract-drift` | 0/25 | – | 10/25 | niedrig |
| `optimize-backend-data-access` | 0/32 | – | 1/32 | niedrig |
| `establish-shared-api-contract` | 0/20 | – | – | niedrig |
| `fix-ios-contract-and-spec-drift` | 1/42 | – | – | niedrig |
| `modernize-ios-client-architecture` | 2/62 | – | – | **nicht vor dem Pilot** |
| `stabilize-upsell-quality-and-request-lifecycle` | 0/135 | – | – | **nicht vor dem Pilot** |
| `indooro-motion-graphics-film` / `indooro-premium-ad-v2` | 29/33 bzw. 19/27 | – | – | nicht pilotrelevant |

Über 400 offene Tasks in OpenSpec. Für den Pilot zählen davon etwa 15 (Feldaufgaben der Navigation, wenige Sicherheitspunkte).

---

## 6. Welche Version als Pilot-Basis?

**Empfehlung:** Ein neuer Integrationsbranch `pilot/first-store`, erzeugt aus `codex/stabilize-ios-navigation` mit **selektiver** Übernahme aus dem Admin-Rebuild.

Begründung:

1. Der Stabilisierungs-Branch enthält die einzige Navigationsversion mit Tests, Recorder und behobenen Kernfehlern. Ohne Recorder ist kein messbarer Feldtest möglich.
2. Der AR-Branch bringt nur ein DEBUG-Experiment. Nicht in den Pilot übernehmen.
3. Vom Admin-Rebuild für den Pilot nötig: die iOS-Fixes (bereits funktional gleichwertig auf dem Stabilisierungs-Branch, Konflikte nur noch bereinigen) und die Backend-Validierungen beim Veröffentlichen. Den kompletten Admin-Rebuild zu mergen und zu deployen ist ein eigenes Vorhaben mit Risiko; siehe Entscheidung in [03_PILOT_READINESS.md](03_PILOT_READINESS.md), Abschnitt 4.3.

Reihenfolge (Ausführung erst nach Teamentscheidung, nicht Teil dieser Analyse):

1. `codex/stabilize-ios-navigation` sofort pushen (Datensicherung).
2. `codex/admin-platform-rebuild` aktuellen Stand pushen.
3. Admin-Rebuild in `main` mergen, sobald seine offenen 5 Tasks erledigt sind; vorher `main` deployt lassen.
4. Stabilisierung auf den neuen `main` mergen, die 3 Konflikte zugunsten der `NavigationSession`-Logik lösen, `swift test` + Simulator.
5. Ab dann: **Feature-Freeze** auf diesem Stand für den Pilot. Nur Bugfixes und Pilotaufgaben.

Branches, die keine Rolle mehr spielen: `codex/indooro-v2-prototypes`, `feature/indooro-ad-v2-concept`, `codex/android-parity-plan`, `claude/elated-brahmagupta-2b15f5` (alle gemergt oder leer). `codex/indooro-v2-roughcut` nur für den Werbefilm.

---

## 7. Einschränkungen dieser Analyse

- Kein `git fetch`: Remote-Branches anderer Teammitglieder, die lokal nicht vorhanden sind, wurden nicht gesehen.
- Konflikte nur zwischen den beiden Hauptbranches geprüft.
- Backend-Tests nicht neu ausgeführt (Ergebnis aus vorhandenen Surefire-Reports).
- `swift test` des Stabilisierungs-Branches: siehe [01_PROJECT_AUDIT.md](01_PROJECT_AUDIT.md), Abschnitt Tests.
