# Betrieb der Pilotmärkte: Ablauf, Daten, Termine

Stand: 2026-10-17 · Grundlage: OpenSpec `prepare-pilot-store-operations`, Aufgaben 2.1 bis 2.3 und 5.1.

Die Vorlagen für Markt, Testpersonen und Termin liegen im Ordner `../kit/`.

## Dateien

- `LAYOUT_CONVENTIONS.md`: Regeln für jedes Pilot-Layout. Maßstab 1 Zelle = 1 m, genau ein Eingang, Regalbeschriftung im Format „Gang <n> · <links|rechts> · <Warengruppe>“, Zählung von Fach und Reihe, Beispiel-JSON und Skizzen.
- `STORE_DATA_ENTRY.md`: Schritt für Schritt von der Vermessung bis zur Prüfung in der App. Enthält den Konverter-Ablauf mit Befehlen, den Abschnitt zu echten Marktdaten (wartet auf Aufgabe 5.2) und die Zuordnung für `regalplan_export.csv` (wartet auf Aufgabe 5.2).
- `STORE_ONBOARDING_CHECKLIST.md`: Neun Punkte, die vor jedem Termin im Markt erledigt sein müssen. Zusätzlich die Einwilligungsregeln und die Sperrregel für fehlendes Backup.
- `SESSION_RUN_SHEET.md`: Ablauf eines Termins mit 2 bis 3 Stunden, Rollen der zwei Teammitglieder, Ablauf bei einem Fehler der App mit Rückfall auf Modus B oder die Papierliste, Schritte nach dem Termin.

## Wer liest was

- Vor der ersten Vermessung: `LAYOUT_CONVENTIONS.md`, dann `STORE_DATA_ENTRY.md`.
- Vor jedem Termin: `STORE_ONBOARDING_CHECKLIST.md` und die Vorlagen aus `../kit/`.
- Am Termin: `SESSION_RUN_SHEET.md`.

## Offene Punkte

Die offenen Punkte stehen jeweils am Ende der Dokumente, mit dem Hinweis `(Mensch: …)`. Die wichtigsten:

- Festlegung „links“ und „rechts“ in den Regalbezeichnungen.
- Beacon-Standard (`hardware/BEACON_STANDARD.md`) ist noch nicht erstellt.
- Herkunft von `SparSupermarkt_Posttrasse` und `Belegplan_ocr.pdf` (Aufgabe 5.2).
