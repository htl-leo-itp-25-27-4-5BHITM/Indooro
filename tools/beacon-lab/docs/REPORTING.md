# Messbericht und Exporte

Der Bericht wird vollständig aus den gespeicherten Daten erzeugt (`src/report/reportModel.ts` →
`src/report/renderHtml.ts`). Er enthält keine fest eingetragenen Zahlen und keine automatischen Schlussfolgerungen.

## Abschnitte

| Nr. | Abschnitt | Quelle |
| --- | --- | --- |
| 1 | Titel und Metadaten (Kampagne, Datum, Markt, Gerät, Bedingungen) | Team (Kampagnenformular) |
| 2 | Datengrundlage: Läufe, Herkunft ECHTDATEN/SYNTHETISCH, Zeilenzahlen, Dateien mit SHA-256, Transformationen, Datenprobleme | automatisch |
| 3 | Testumgebung und Beacons: ID, Position (LE, Meter nur bei bestätigtem Maßstab), TX-Power, Pfadverlustmodell | automatisch |
| 4 | Maßstab und Koordinaten | automatisch |
| 5 | Verfahren und Parameter: alle Konfigurationswerte und `configHash` je Ergebnis | automatisch |
| 6 | Kalibrierung: Modell, Quelle (gefittet/manuell/Default), R², Residuen-σ, Kalibrierungsläufe oder „nicht kalibriert“ | automatisch |
| 7 | Ergebnisse: Kennzahlen je Lauf × Verfahren, Vergleich auf gemeinsamer Epochenmenge, Dynamik-Kennzahlen | automatisch |
| 8 | Abbildungen (SVG, vor dem Einbetten bereinigt, fortlaufend nummeriert „Abbildung N“) | automatisch |
| 9 | Grenzen der Aussagekraft | automatisch, **nur aus Fakten** abgeleitet |
| 10 | Interpretation / Hypothesen | **Team**, wörtlich und escaped, mit dem Hinweis „Interpretation des Teams – keine automatische Schlussfolgerung“. Ohne Eingabe: „Keine Interpretation erfasst.“ |
| 11 | Reproduzierbarkeit: Tool-Version, Commit, Konfigurations-Hashes, Seeds synthetischer Läufe, Rohdatei-Hashes, Erzeugungszeitpunkt | automatisch |

Der Bericht verwendet keine wertenden Formulierungen und erstellt keine Rangfolge. Die Tabellen sind nach Lauf und
Algorithmus sortiert. Der Sortierschlüssel steht jeweils unter der Tabelle.

## Abbildungen

Alle Abbildungen werden ausschließlich aus den gewählten gespeicherten Ergebnissen berechnet (`src/report/figures/`). Auf der Berichtsseite wählt die Checkbox-Gruppe „Abbildungen“ die Typen aus (Standard: alle). Die Nummerierung („Abbildung 1, 2, …“) folgt der Reihenfolge im Bericht.

| Typ | Umfang | Inhalt |
| --- | --- | --- |
| Kumulative Fehlerverteilung (CDF) | je Ergebnis | Anteil der Epochen mit Fehler ≤ x; Fehlschläge zählen als „nicht innerhalb“ |
| Grundriss mit Schätzungen | je Ergebnis | Plan-Elemente, Beacons, Referenzpunkte, Schätzpunkte nach Fehler eingefärbt, Fehlervektoren, Legende, Maßstabsbalken |
| Fehler-Heatmap | je Ergebnis | Mittelwert des Fehlers je Zelle (Standard 2 LE) |
| Boxplot | ab 2 Ergebnissen | Fehlerverteilung je Konfiguration (Lauf + Verfahren/Filter) |
| Ausfallrate | ab 2 Ergebnissen | Fehlschläge / Epochen mit Referenz je Konfiguration |

Jede Bildunterschrift nennt: Lauf, Verfahren und Filter, `configHash`, n gültig, n Fehlschläge, Einheit, Herkunft (ECHTDATEN/SYNTHETISCH) und das Koordinatensystem (Ursprung links oben).

### Ehrlichkeitsregeln für Abbildungen

- Der Grundriss wird unverzerrt dargestellt (viewBox = Plangröße in Layout-Einheiten, Seitenverhältnis erhalten).
- Einheit „m“ nur bei bestätigtem Maßstab, sonst „LE“. Synthetische Ergebnisse tragen die Kennzeichnung „SYNTHETISCH“ in der Abbildung selbst.
- Fehlgeschlagene Schätzungen werden nie an erfundenen Positionen gezeichnet; die Bildunterschrift nennt ihre Anzahl.
- Heatmap: Mittelwert je Zelle, **keine Interpolation**. Nur Zellen mit Referenzpositionen sind gefärbt; Zellen ohne Daten sind schraffiert. Fehlschläge gehen nicht in den Mittelwert ein.
- Mehr als 3000 gültige Schätzungen je Abbildung werden deterministisch ausgedünnt (jede k-te Schätzung); die Bildunterschrift nennt k und die Anzahl gezeichneter Punkte. Kennzahlen und Boxplot nutzen stets alle Daten.
- Schätzungen ohne Referenz erscheinen grau ohne Fehlervektor; Schätzungen außerhalb des Plans werden gezählt und genannt.
- Die Abbildungen sind reine SVG-Strings (kein JavaScript); `sanitizeSvg` lässt Muster (`<pattern>`), Verläufe und verschachtelte `<svg>` zu und entfernt aktive Inhalte.

## Auslöser für „Grenzen der Aussagekraft“

- Synthetische Daten enthalten (zusätzlich Banner „ENTHÄLT SYNTHETISCHE DATEN – KEINE MESSERGEBNISSE“)
- Maßstab nicht bestätigt (alle Distanzen in LE)
- Pfadverlustmodell Default oder manuell (nicht gefittet)
- Weniger als 100 ausgewertete Epochen („explorativ“)
- Keine Ground Truth vorhanden
- Nur ein Messgerät; weniger als 3 Evaluationsläufe je Laufart
- Fehlgeschlagene Schätzungen, unbekannte Beacons, nicht auswertbare Läufe, Datenfehler
- Jede Warnung, die die Auswertung selbst gemeldet hat

## PDF

Für das PDF gibt es keine eigene Bibliothek. Der HTML-Bericht ist für A4-Druck optimiert (`@page`, Seitenumbrüche).
Unter „Drucken / als PDF speichern“ im Druckdialog „Als PDF speichern“ wählen und **Hintergrundgrafiken aktivieren**,
damit Kennzeichnungen und Farben erhalten bleiben.

## Exporte

| Export | Inhalt |
| --- | --- |
| HTML | eigenständiger Bericht ohne JavaScript, inline CSS |
| JSON | Ergebnisse inklusive vollständiger Konfigurationen, Kennzahlen und Warnungen, optional mit allen Epochen-Schätzungen |
| CSV | Kennzahlen je Lauf × Verfahren, sowie Epochen-Schätzungen je Ergebnis (`estimatesToCsv`) |
| Kampagnen-Bundle | Kampagne + Läufe (Rohdaten) als JSON zum Archivieren und Wiederimportieren |

## Ergebnisse ehrlich zitieren

Beim Zitieren eines Ergebnisses immer angeben:

- Herkunft (ECHTDATEN oder SYNTHETISCH)
- Einheit (m nur bei bestätigtem Maßstab, sonst LE)
- Stichprobengröße, Gerät und Datum
- Fehlschläge: Mittel, Median, RMSE, P90, P95 und Maximum beziehen sich nur auf gültige Schätzungen. Die Quoten ≤ 2/3/5 zählen Fehlschläge als „nicht innerhalb“. Die Ausfallrate immer mit angeben.
- Kalibrierungsstatus
- `configHash` und SHA-256 der Rohdatei

Keine Rangfolge aus kleinen Stichproben oder einem einzelnen Gerät ableiten. Interpretationen als Hypothesen des
Teams kennzeichnen.
