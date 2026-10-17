# Pilot-Kit: Vorlagen für Markt, Testpersonen und Termin

Stand: 2026-10-17 · Grundlage: OpenSpec `prepare-pilot-store-operations`, Aufgaben 3.1 und 4.1 bis 4.7.

Alle Dateien sind Vorlagen. Platzhalter in spitzen Klammern (`<…>`) werden vor dem Gebrauch ausgefüllt. Ausgefüllte Exemplare mit Namen, Unterschriften oder Kontaktdaten gehören **nicht** in dieses Repository. Sie liegen außerhalb des Repositorys und sind in der Checkliste vermerkt (`../operations/STORE_ONBOARDING_CHECKLIST.md`).

## Dateien

- `produkte-vorlage.csv`: Vorlage für die Produktliste eines Pilotbereichs, Spalten `id;name;marke;menge;regal_label;kategorie;meter;fach;reihe;preis`. Fünf Beispielzeilen mit synthetischen Produkten. Umwandlung mit `scripts/pilot-data/csv_to_ndjson.py`.
- `one-pager.md`: Ein-Seiten-Vorschlag für den Markt, Vorlage aus `06_BUSINESS_OUTREACH.md`, Abschnitt C.
- `brief-an-markt.md`: Kurzvorstellung, Brief für die Übergabe im Markt, E-Mail nach Zustimmung und Vermittlungsbitte, mit Versandregeln für den Erstkontakt.
- `pilotvereinbarung.md`: Vereinbarung über den Testbetrieb, eine Seite, Vorlage aus `05_PILOT_IMPLEMENTATION.md`, Abschnitt 8.
- `einwilligung-testperson.md`: Einwilligung zur Teilnahme für volljährige Testpersonen. Zweck, Daten, Speicherung, Freiwilligkeit, Widerruf, Kontakt.
- `einwilligung-testperson-minderjaehrig.md`: Einwilligung für Minderjährige mit Unterschrift der erziehungsberechtigten Person. Altersgrenze ist vom Team noch zu klären.
- `fragebogen.md`: Fünf Fragen auf einer Skala von 1 bis 5 und ein Freitext, mit Zuordnung zu den Kriterien aus `03_PILOT_READINESS.md`, Abschnitt 6.3.
- `testprotokoll.md`: Papierprotokoll je Aufgabe mit Zeiten, Ergebnis und App-Zählern. Spalten entsprechen dem Export des Studienmodus.
- `hinweisschild.md`: Text für das A4-Hinweisschild am Eingang des Pilotbereichs, mit Schrift- und Formathinweisen.
- `kontaktliste-vorlage.csv`: Leere Kopfzeile für die Liste der angesprochenen Märkte. Keine persönlichen Kontaktdaten im Repository, die gefüllte Liste liegt außerhalb.

## PDF-Ausgabe

Status: **Mensch: PDFs mit Word/LibreOffice erzeugen.**

Am 2026-10-17 wurden auf dem Rechner weder `pandoc`, `soffice`, `libreoffice`, `wkhtmltopdf`, `pdflatex` noch `xelatex` gefunden. Auch die Python-Pakete `reportlab` und `weasyprint` sind nicht installiert. Es wurde deshalb kein Verzeichnis `pdf/` angelegt und keine PDF erzeugt. Die Markdown-Dateien sind die Quelle. Die PDFs entstehen mit Word oder LibreOffice aus diesen Dateien. Platzhalter in den PDFs sind erlaubt. Ein PDF mit Personendaten wird nicht ins Repository gelegt (Aufgabe 4.7).

## Vor dem Einsatz

- Alle Platzhalter ausfüllen.
- Aussagen an die Betreuung und an die Schule übergeben (Mensch).
- Einwilligungsformulare, Fragebögen und Protokolle nur mit Test-ID verwenden.
