# Verify-Change-Zwischenstand: complete-admin-parity-evidence

Stand: 2026-10-16. Der neue Editor bleibt auf `editor: false`. Zwei fokussierte lokale Beleg-Durchläufe sind abgeschlossen; die vom Product Owner gesetzte Zeitbox von maximal drei Arbeitssitzungen wird nicht überschritten. Weil die P0-Gates weiterhin offen sind, wird die Editor-Route nicht umgeschaltet und die Arbeit an `add-editor-floorplan-underlay` fortgesetzt.

| Dimension | Befund |
| --- | --- |
| Vollständigkeit | OpenSpec 1/7 Aufgaben nach Abschluss von 3.1; 1.1, 1.2, 2.1–2.3 und 3.2 bleiben offen. Der Change ist nicht archivbereit. |
| Korrektheit | Das Szenario „Editor evidence remains incomplete“ ist erfüllt: `admin/route-cutover.js` hält `editor: false`. Das Szenario „Deferred Editor cutover is proposed“ wurde nicht ausgeführt, weil die Voraussetzungen fehlen. |
| Kohärenz | `design.md` trennt explizite `layoutId`-Fixture, privaten Draft, Mobile Current, Routenrollback und Datenrollback. Die lokale Probe stellte Scope-Zuordnungen wieder her und archivierte ihre Fixtures. |

## P0 vor einem Cutover

1. `EDITOR_ACTION_MATRIX.md` auf vollständige Legacy/Candidate-Aktions- und Zustandszeilen mit Fixture, erwarteter und beobachteter Wirkung, Test/Live-Beleg und visueller Aufnahme erweitern. Es fehlen insbesondere Canvas-Rand-/Snap-/Lock-Pfade, Beacon-Sonderfälle, Inspector-Kategorie-/Rotationsvarianten, weitere Validierungs- und globale Fehlerzustände.
2. Gleiche UI-Werkzeugfolgen für Admin, Region Manager und Store Manager mit eigenem und fremdem Scope sowie Direktlink/Refresh, Tastatur, Draft/Publikation/Restore und API-Denial zu Ende führen. Der neue Paarlauf deckt Rasterhöhe, Duplikat und Inspector-Löschen/Undo unter beiden Managerrollen ab, aber nicht alle Werkzeuge.
3. Beobachtete Unterschiede einzeln entscheiden. Der Product Owner akzeptierte Candidate-Export/Preview ohne impliziten Draft, Metadaten-Erhalt beim Import und Publikationsblock ohne Eingang. Inspector-Löschen (sofort gegen Bestätigung), Legacy-Modi, Beacon-Duplikat, Rotation und Global-Controls bleiben zu bewerten.

## Weitere offene Gates

- Vollständige leere, fehlerhafte und wiederhergestellte UI-Zustände sowie Assistive-Technology-Prüfung beider Editor-Modi.
- Physischer Beacon-/Geräteweg ist nicht geprüft. Lokale API- und Simulatorbelege werden nicht als Gerätetest gewertet.
- Echter Editor-Flag-Switch mit Store/global, Query/Fragment, Refresh und Rückschaltung bleibt aus, solange P0 offen ist.

## Geprüfte Nachweise

- `admin-ui/scripts/live-editor-manager-publication.mjs`: gleicher aktiver Ausgangsstand je Managerrolle in Legacy und Candidate; Rasterhöhe 20→22, Duplikat, Inspector-Löschen/Undo, private Drafts/API/Mobile-Readback; gültige Candidate-Publikation und Versions-Restore; Scope-Denials und Cleanup. Vier Screenshots in `evidence/editor/*-paired.png`.
- Lokale Paar-Probes `live-editor-import-parity.mjs`, `live-editor-export-semantics.mjs`, `live-editor-preview-semantics.mjs`, `live-editor-validation-pair.mjs` bestanden erneut. Die akzeptierten Semantiken und öffentlichen Nichtmutationen wurden beobachtet.
- Backend `sh ./mvnw test`: 142/142; Admin-UI Typecheck, Lint, Unit 69/69, Browser 111/111 samt Package/Build; strikte OpenSpec-Validierung: 63/63. Die abschließende Lint-/OpenSpec-Wiederholung nach der letzten Probeerweiterung wird separat erfasst.

**Bewertung:** Erforderliche P0-Nachweise sind offen. Der Change bleibt aktiv, Editor bleibt Legacy, keine Freigabe für Route-Cutover oder Archivierung.
