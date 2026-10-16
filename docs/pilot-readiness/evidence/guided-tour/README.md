# Evidence: add-pilot-guided-tour-fallbacks (Simulator iPhone 16 Pro, iOS 18.6, 2026-10-16)

Ohne Beacons im Simulator (keine Messungen, also keine vertraute Position). Store: EUROSPAR Leonding/Hart (Live-Layout).

| Datei | Zeigt |
|---|---|
| `01-tour-route-from-entrance.png` | Tour gestartet ohne vertraute Position: Route ab Eingang, Text „Route ab Eingang“, Button „Ich bin hier“, Banner „Position setzen“ (Tasks 2.x, 4.1, 4.3, 4.4) |
| `02-route-from-last-stop.png` | Nach „Erledigt“: Route startet am erledigten Stopp, Text „Route ab Snacks & Süßwaren“ (Task 2.2, 4.4) |
| `03-ich-bin-hier-route-from-position.png` | Nach „Ich bin hier“ und Tipp auf die Karte: Position gesetzt, Route von dort, Hinweis und Banner weg (Task 4.1, 4.2) |
| `04-target-card-shelf-location.png` | Zielkarte mit Regalbezeichnung und „1. Boden von unten · Position 1“; Kategorie-Code nur im DEBUG-Build (Task 5.3, 5.5) |
| `05-offline-copy-cold-start.png` | Kaltstart mit unerreichbarem Server (`INDOORO_API_BASE_URL=http://127.0.0.1:9/api`): Store-Layout aus der Offline-Kopie, Beschreibung „… • Offli…“ (Task 6.3, 6.5) |

Offline-Test: einmal online laden (schreibt `Application Support/LayoutCache/<storeId>.json`), App beenden, mit `SIMCTL_CHILD_INDOORO_API_BASE_URL=http://127.0.0.1:9/api xcrun simctl launch booted <bundle id>` neu starten.
