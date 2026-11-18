# Indooro – Interaktive Pilot-Demonstration

Eigenständige Website, mit der das Indooro-Team einem Supermarktbetreiber in wenigen Minuten zeigt,
was Indooro ist, wie Kundinnen und Kunden Produkte finden und hinnavigiert werden, wie ein Markt
eingerichtet wird – und was ein gemeinsamer Pilotversuch bedeutet.

> Alle Märkte, Produkte und Positionen sind **fiktiv**. Die Kundenposition ist **simuliert**.
> Die Demo behauptet keine gemessene BLE-Genauigkeit.

## Inhalt

| Bereich | Was es zeigt |
|---|---|
| Hero / Problem | Nutzen für Betreiber in wenigen Sekunden |
| **Live-Demo** (`#demo`) | Produktsuche (marktgebunden, Synonyme, Tippfehler-tolerant), Einkaufsliste, A*-Route mit optimierter Reihenfolge, animierte Navigation, simulierte Position, Marktwechsel zwischen zwei fiktiven Märkten |
| So funktioniert's | Erfassung, Beacons + QR-Anker, App/Browser, Route |
| Für Betreiber (`#betreiber`) | Geführte Simulation des echten Admin-Ablaufs: Markt anlegen → Regale → Beacons → CSV-Import → Bereitschaftsprüfung → Fehler beheben → startklar |
| Projektstand | Ehrliche Trennung: umgesetzt · offen · in dieser Demo simuliert |
| Pilot (`#pilot`) | Was wir suchen, was wir brauchen, was der Markt erhält, Ablauf, Aufwand, offene Fragen, Kontakt |

## Wiederverwendete Indooro-Bausteine

- **Routing:** A* (4-Nachbarschaft, Manhattan-Heuristik, Min-Heap) und Nearest-Neighbour-Reihenfolge aus
  `backend/.../META-INF/resources/customer/route.js`, 2-opt-Verbesserung aus
  `swift/indooro-EinkaeuferFinal/indooroApp/Utilities/TourPlanner.swift`, Abbiege-Strafe nach `IndoorGraph.swift`.
- **Datenmodell:** Layout-JSON (Elemente auf Metergitter) wie `admin-ui/src/editor/model.ts`;
  Produkt ↔ Regal über `layoutCode` `<Kategorie>/<Meter>/<Boden>/<Fach>` wie `ShelfMatching.java`.
- **Bereitschaftsprüfung:** Ampel (Bereit / Bereit mit Hinweisen / Nicht bereit) und Befund-Codes aus
  `StoreReadinessEvaluator.java` bzw. `admin-ui/src/readiness.ts`.
- **Gestaltung:** Farbwelt des Indooro-Produktfilms (`indooro-motion/src/design/tokens.ts`) und Logo-Farben.

Es wird kein Code des bestehenden Projekts importiert; die Demo ist vollständig isoliert.

## Lokal starten

Voraussetzung: Node.js 22 (siehe `.nvmrc`).

```bash
cd pilot-showcase
npm ci
npm run dev        # http://localhost:4316
```

## Prüfen

```bash
npm run typecheck
npm test           # Unit-Tests (vitest): Routing, Suche, Demo-Daten, Betreiber-Ablauf
npm run build
npm run test:e2e   # Playwright, Desktop + Mobile (vorher npm run build; nutzt Port 4317)
```

Testumfang: Routing (A*, 2-opt, Hindernisse in beiden Demomärkten mit je 120 Zufallslisten),
Suche (Synonyme, Tippfehler, Marktbindung), Datenintegrität (jeder layoutCode trifft genau ein Regal),
Betreiber-Ablauf und Bereitschaftslogik; e2e: Suche, Liste, Route, Simulation, Marktwechsel,
Betreiber-Demo, Pilotbereich, Deep-Links, Fehlerfälle (ungültiger Markt, gesperrter localStorage,
reduzierte Bewegung) auf Desktop und Mobil.

## Hosting

`npm run build` erzeugt eine rein statische Seite in `dist/` (relative Pfade, `base: "./"`).
Sie kann ohne Server-Konfiguration auf jedem statischen Host liegen (z. B. GitHub Pages, Netlify,
nginx, ein Unterordner der Schul-Webseite) und funktioniert nach dem Laden auch offline.
Es gibt keine Backend-Verbindung, keine Datenbank, keine Anmeldung und keine externen Dienste.

## Bekannte Einschränkungen

- Position, Märkte, Produkte und Preise sind simuliert bzw. fiktiv; es gibt noch keine Messwerte zur BLE-Ortung.
- Der Betreiber-Ablauf ist eine geführte Simulation, keine Verbindung zur echten Admin-Plattform.
- Raster 1 m wie in Indooro; die Route wird für die Darstellung geglättet.
- Kein Zoom/Pan im Marktplan (bewusst einfach gehalten, „Route im Fokus“ zoomt auf die Route).
- Das Teilen-Bild (`og.svg`) ist ein SVG; manche soziale Netzwerke zeigen nur PNG/JPG an.

## Vor dem Einsatz beim Markt

- Kontaktdaten in `src/content/contact.ts` eintragen (`TODO(team)`).
- Inhalte mit der Betreuung abstimmen.
