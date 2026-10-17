# Editor-Parität: Abschluss der P0-Lücken

Stand: 2026-10-17. Bezug: OpenSpec `complete-admin-parity-evidence` (Aufgaben 1.1, 1.2, 2.1, 2.3), Lückenliste in [`EDITOR_EVIDENCE_GAPS.md`](EDITOR_EVIDENCE_GAPS.md), Aktionsmatrix in [`EDITOR_ACTION_MATRIX.md`](EDITOR_ACTION_MATRIX.md).

Jede P0-Lücke wird hier mit einem **automatisierten** Nachweis geschlossen, der ohne Handarbeit wiederholbar ist (`npm test`, `npm run test:browser`, `sh ./mvnw test`, `node --test backend/indooro_server/src/test/js/*.test.mjs`). Die älteren Live-Probes (`admin-ui/scripts/live-editor-*.mjs`) bleiben als zusätzlicher Beleg gegen den gepackten Stack bestehen; sie wurden für diesen Abschluss nicht ersetzt.

## Lücke 1 (P0): vollständiges Aktions- und Zustandsinventar

| Teil | Nachweis |
| --- | --- |
| Jede Legacy-Aktion hat eine Candidate-Entsprechung, Entscheidung und Test | `admin-ui/src/editor/legacy-parity-map.json` (69 Einträge: jede `id` aus `editor/index.html`, dynamische Inspector-Controls, Tastatur- und Canvas-Aktionen). `legacy-parity-map.test.ts` schlägt fehl, wenn eine Legacy-`id` fehlt, ein Candidate-Text nicht im Quelltext steht, ein Testtitel nicht existiert oder eine Lücke ohne Entscheidung offen ist. |
| Zustände laden / leer / Validierungsfehler / Konflikt (409) / Serverfehler (503, Retry) / Erfolg / ungespeichert / ungültige Daten / ungültiger Import, Filial- und globaler Editor | `admin-ui/tests/browser/editor-states.spec.ts` (20 Tests). Screenshots je Zustand nach `docs/admin-rebuild/evidence/editor-states/` (neu erzeugen mit `EDITOR_EVIDENCE_CAPTURE=1 npx playwright test tests/browser/editor-states.spec.ts`). |
| Canvas-, Beacon-, Inspector- und Validierungs-Randfälle | `admin-ui/src/editor/editor-edge-cases.test.ts` (Modell, Raster, Sperre, Beacon, Duplikat, Undo-Grenze, Import, Validierungskombinationen) und `admin-ui/tests/browser/editor-canvas-edge-cases.spec.ts` (Rückwärts-Ziehen, Einzelklick, Rand, Sperre, Einrasten, Pan, Zoom, Raster verkleinern, Beacon-Auswahl, Löschdialoge). |
| Zuvor offene Einzelfälle | `admin-ui/tests/browser/editor-gap-closure.spec.ts`: Ebenenzähler, globale Beacon-ID (`Indooro<n>`), POI-Kategorie, Löschbestätigung für Theke/Kühlregal/Tiefkühlregal, Canvas-Fokus nach Klick. |

## Lücke 2 (P0): Rollen- und Scope-Abnahme

| Teil | Nachweis |
| --- | --- |
| UI je Rolle (`admin`, `region-manager`, `store-manager`): eigener Store speichern und veröffentlichen, fremder Store, globaler Modus, verweigerte Mutation (403) mit erhaltenen Änderungen, historische Version wieder aktivieren, Tastaturweg | `admin-ui/tests/browser/editor-roles.spec.ts` (18 Tests = 3 Rollen × 6 Fälle). |
| Backend: Rollen auf allen Store-Layout-Endpunkten und `POST /api/layout/current` (anonym 401, ohne Rolle 403, Manager 200 bzw. 403 für global, fremder Store 403, keine Schreibaufrufe bei Verbot) | `StoreLayoutAdminResourceRoleTest` (11 Tests). |
| Backend: Scope-Logik selbst (Admin, Region eigene/fremde Region, Store eigener/fremder Store, unbekannter Store) und dass jede Store-Layout-Methode zuerst `requireStoreAccess` aufruft und bei Verbot nichts schreibt | `AdminAccessServiceStoreScopeTest`, `StoreLayoutAdminServiceScopeTest`. |

Bekannte Eigenschaft: Der Region-Manager-Direktlink auf einen fremden Store wird clientseitig nicht vorab abgewiesen, sondern erst durch die API (HTTP 403, Anzeige „Zugriff verweigert“, kein Retry-Button). Das ist im Browsertest und im Backend-Test belegt; die API bleibt die maßgebliche Grenze.

## Lücke 3 (P0): Legacy-Aktionsvergleich und Entscheidung je Unterschied

Fehlende Funktionen wurden im neuen Editor ergänzt (mit Test):

- **„90° drehen“** im Inspector (Legacy `rotateBtn`): tauscht Breite/Höhe, begrenzt am Raster; gesperrte Elemente und Beacons bleiben unverändert.
- **Globaler Modus, Beacon platzieren:** automatische Beacon-ID `Indooro<n>` (kleinste freie Nummer) wie Legacy.
- **Löschbestätigung** auch für Theke, Kühlregal, Tiefkühlregal (Legacy fragt dafür nach).

Beim Schreiben der Randfall-Tests wurden drei echte Fehler im neuen Editor gefunden und behoben:

1. Tastaturkürzel (Strg+Z, Entf, Pfeile) wirkten nicht, wenn der Fokus auf `body` lag, weil `document` im Editor durch das Layout-Dokument verdeckt war.
2. Gedrehte Elemente konnten am Rand über das Raster hinausragen (`bounds`-Fehler); Begrenzung nutzt jetzt die gedrehte Bounding-Box.
3. Duplizieren eines QR-Ankers kopierte die gedruckte Anker-ID und blockierte damit die Veröffentlichung; die Kopie erhält jetzt eine neue ID.

Zusätzlich setzt ein Klick auf den Canvas jetzt den Fokus auf den Canvas, damit Entf/Pfeile/Strg+Z nach einem Klick wirken.

**Entscheidungen.** Das Feld `decision` in `legacy-parity-map.json` hält je Eintrag fest:

- `product-owner-2026-10-16`: Export/Preview ohne impliziten Draft, Import erhält Metadaten, Veröffentlichung ohne Eingang blockiert (vom Product Owner am 2026-10-16 abgenommen).
- `accepted-improvement` / `accepted-removed`: Unterschiede, in denen der neue Editor eine Legacy-Eigenheit ersetzt (sofortiges Inspector-Löschen ohne Rückfrage, globaler „Save Draft“, der in Legacy sofort veröffentlichte, Legacy-Modi Edit/Delete, Duplikat direkt hinter dem Original, „Verschieben“ als Ansichts-Pan). **Diese Einstufung hat der übernehmende Agent nach Eriks Auftrag („Lücken schließen“) vorgenommen; sie ist keine neue Product-Owner-Abnahme.** Erik kann jeden Eintrag in der JSON-Datei auf `none` zurücksetzen; der Test schlägt dann an, bis die Lücke wieder geschlossen oder erneut entschieden ist.
- Offen bewusst nicht entschieden: Legacy-Beacon-Duplikat kopiert dieselbe Hardware-ID (`duplicateBtn:beacon`, `decision: none`); der neue Editor erzeugt ein unzugeordnetes Duplikat, das die Validierung meldet. Das ist strenger und blockiert keine Funktion.

## Was dieser Abschluss nicht belegt (P1 / außerhalb)

- Physischer Beacon- und Geräteweg: nicht geprüft (kein Gerät). Simulator- und API-Belege zählen nicht als Geräteergebnis.
- Vollständiger Assistive-Technology-Audit (Screenreader): nicht durchgeführt; Tastatur- und Fokusfälle sind automatisiert, mehr nicht.
- `page.close({ runBeforeUnload })` ist nicht abgedeckt, nur `beforeunload` über Reload.
- Die Live-Paar-Probes gegen den gepackten Stack wurden für die in diesem Abschluss ergänzten Funktionen nicht neu ausgeführt, soweit nicht unten unter „Live-Lauf“ vermerkt.

## Prüfergebnisse zum Abschluss

| Prüfung | Ergebnis |
| --- | --- |
| `npm test` (admin-ui) | 135/135 |
| `npm run typecheck`, `npm run lint` | fehlerfrei |
| `npm run test:browser` (inkl. `package:candidate`, `verify:candidate`) | 176/176 |
| `sh ./mvnw test` | 211/211 |
| `node --test backend/indooro_server/src/test/js/*.test.mjs` | 20/20 |
