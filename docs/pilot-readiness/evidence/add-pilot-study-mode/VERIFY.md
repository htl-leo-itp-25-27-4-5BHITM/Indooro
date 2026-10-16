# Verification: add-pilot-study-mode

Stand 2026-10-16. Skill openspec-verify-change; proposal/design/specs/tasks und Implementierung geprüft. Kein Archivieren.

## Vollständigkeit

- Setup/Modell/UI vorhanden: konfigurationsabhängiger Einstieg, strenge Test-ID, Aufgaben, Bedingungen, lokale Persistenz, monotone Zeitmessung, Ergebnis, Notizen, Auswahl früherer Sitzungen, Export/Löschen.
- **CRITICAL / Eigentums-Gate:** 4.1 verlangt Kopie nach `kit/study-export-sample` (Person C). Synthetischer Simulator-Export liegt unter eigener Evidence; C muss übernehmen. Task bleibt offen.
- **CRITICAL / Integration:** Navigationszähler und Ereignisse manualPosition/reroute/stopChange fehlen an Eriks öffentlicher NavigationSession. STATUS enthält Anfrage. Zeit/Ergebnis funktionieren gemäß dokumentiertem Fallback, fehlende Messwerte „-“. Szenario „manuelle Position einmal“ kann erst mit Eriks Integration abgenommen werden.

## Korrektheit

- Aktivierung: Info.plist false; Test-ID voller Regex-Match, keine Namen/Unicode-Ziffern/angehängten Zeilenumbrüche.
- App-Aufgabe: Produktziel über ContentView, bestehender Filial-Einstieg, Karten-Overlay für Abschlüsse. Ohne-App-Aufgabe bleibt im Studienformular, positioning_mode „-“.
- CSV: exakt 16 Spalten, UTC ISO mit Millisekunden, eine Dezimalstelle mit Punkt, korrektes CSV-Escaping. JSONL: ein Event pro Zeile. Documents/StudySessions mit UUID je Sitzung; kein Uploadcode im Store.
- Unit-Tests prüfen Dauer unabhängig von Wanduhr, fehlende/sinkende Zähler, doppelte Starts/Abschlüsse, zwei Sitzungen innerhalb einer Sekunde, erneute Auswahl/Export, deaktivierten Store, lokale Löschung ohne fremde Dateien zu entfernen.
- Restliche Human steps: physische Leihgeräte, echte Filiale/Produkte, manuelle Position/Kartenroute mit Erik, AirDrop/Dateien-App mit Empfänger. Das System-Share-Sheet wird im Simulator geöffnet, kein Versand ausgeführt.

## Kohärenz und Gegencheck

- Architektur folgt bestehendem ObservableObject/SwiftUI-Muster, keine Navigation-/Positionsdatei verändert. Zusätzlicher SwiftPM-Support-Target mit eigenen Tests.
- Lesender Gegencheck: ältere gespeicherte Sitzungen waren nicht auswählbar. Behoben und Regressionstest grün; Gegencheck bestätigt Korrektur ohne weiteren Befund. Neuer bestehender Karten-Einstieg ebenfalls lesend geprüft, ohne Befund.
- WARNING: App-Suche kann separat Produkte laden; der reine Export arbeitet lokal. DEBUG-Log misst den Export-Abschnitt, nicht den gesamten App-Start.

## Ergebnis

Implementierung mit dokumentiertem Zähler-Fallback reviewbar; volle Spezifikationsabnahme bis Integration und Kit-Übernahme gesperrt. Prüfdetails/Screenshots in CHECKS.md. Keine Change archiviert.
