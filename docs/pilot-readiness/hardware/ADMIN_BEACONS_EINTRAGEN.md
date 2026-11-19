# Beacons im Admin eintragen (Testraum SPAR-Leonding-002)

Für Personen ohne Programmierkenntnisse. Ziel: Jedes Beacon im Raum ist im Admin mit seinen echten Werten eingetragen, im Layout an der richtigen Stelle platziert, das Layout hat einen Eingang und ist veröffentlicht. Erst dann ist eine Messung sinnvoll.

Die Bezeichnungen unten stehen genau so auf den Schaltflächen der Admin-Oberfläche (Stand 2026-11-19, aus dem Quellcode `admin-ui/src` übernommen). Sieht ein Bildschirm anders aus, bitte nichts raten: Foto machen und im Team fragen.

Grundregel: **Eintragen darf nur, was jemand am Gerät abgelesen hat.** Keine UUID, kein Major, kein Minor erfinden oder aus dem Layout abschreiben.

## Vorher

1. Alle Beacons mit der Herstellerapp ablesen und in `TESTRAUM_BEACON_WERTE.md` eintragen (UUID, Major, Minor, Position mit Maßband). Regeln für Major und Minor: `BEACON_STANDARD.md`, Abschnitt 2 (Minor je Standort eindeutig).
2. Den Ist-Zustand prüfen. Im Repo-Ordner im Terminal:

   ```text
   scripts/field/check_testroom_beacons.sh
   ```

   Das Skript liest nur und ändert nichts. Es nennt in einfachem Deutsch, was fehlt. Merken Sie sich die Zahl hinter „Blocker“.
3. Als Sicherung im Layout Editor einmal **JSON exportieren** und die Datei aufheben (Schritt 6 zeigt, wo).

## Schritt 1: Beacons anlegen oder korrigieren

1. Admin öffnen: `https://it220209.cloud.htl-leonding.ac.at/admin/next/`. Anmelden. In der Navigation **Beacons** wählen.
2. Neues Beacon: **Beacon anlegen**. Mehrere gleichzeitig mit gemeinsamer UUID: **Bulk anlegen** (Zeilen im Format `Beacon-Code,Minor`, dann **Review** und **Review bestätigen und … anlegen**).
3. Im Formular **Beacon anlegen** (oder **Beacon bearbeiten**) ausfüllen:
   - **Beacon-Code**: der Admin-Name aus der Werte-Datei, zum Beispiel `Indooro1`.
   - **UUID**: genau die UUID vom Gerät. Keine Platzhalter aus Nullen.
   - **Major (optional)** und **Minor (optional)**: die Zahlen vom Gerät. Für den Testraum sind sie nicht optional, ohne sie erkennt die App das Beacon nicht sicher.
   - **Direkt zuweisen an (optional)**: Store `SPAR-Leonding-002` wählen, dann ist Schritt 2 für dieses Beacon schon erledigt.
4. **Speichern**.
5. Ein bestehendes Beacon mit falschen Werten: in der Liste (Abschnitt **Inventar**) in der Zeile **Bearbeiten**, Werte korrigieren, **Speichern**.
6. Platzhalter-UUID aus Nullen oder ein Beacon, das es nicht gibt: Zeile suchen (Feld **Suche**, Code oder UUID), **Archivieren** und bestätigen. Nur archivieren, wenn klar ist, dass es kein echtes Gerät ist. Im Zweifel fragen.

## Schritt 2: Beacons dem Testraum zuweisen (Mehrfachauswahl)

1. Auf der Seite **Beacons** im Filter **Zuweisung** den Wert **Frei** wählen, damit nur noch nicht zugewiesene Beacons erscheinen.
2. In der Tabelle links die Kästchen der Beacons des Testraums anklicken (Ganz oben: **Alle zuweisbaren Beacons auswählen**). Darüber steht „N ausgewählt“.
3. Bei **Auswahl zuweisen an** den Store `SPAR-Leonding-002 · …` wählen.
4. Auf die Schaltfläche **N zuweisen** klicken (N ist die Zahl der gewählten Beacons).
5. Kontrolle: **Stores**, den Testraum öffnen. Im Abschnitt **Beacons (N)** stehen alle zugewiesenen Beacons. Ein falsch zugewiesenes Beacon dort mit **Freigeben** lösen.

## Schritt 3: Layout öffnen

1. **Stores**, `SPAR-Leonding-002` öffnen.
2. Im Abschnitt **Layout-Versionen** auf **Layout Editor öffnen** klicken.
3. Oben steht, welche Version offen ist (Entwurf, Aktiv, Archiviert). Änderungen werden erst nach Schritt 6 wirksam.

## Schritt 4: Beacons im Layout platzieren und zuordnen

1. Links unter **Elemente** auf **Beacon** klicken, dann im Raster an die richtige Stelle klicken. Beacons rasten an Rasterpunkten ein. Die Position muss zum Maßband-Wert in der Werte-Datei passen.
2. Mit **Auswählen** das Beacon im Raster anklicken. Rechts bei **Zugeordneter Beacon** den Admin-Namen wählen. Ein Beacon, das schon an anderer Stelle platziert ist, ist mit „· bereits platziert“ markiert und nicht wählbar.
3. Wichtig: Das Layout speichert eine Kopie von UUID, Major und Minor. Haben Sie in Schritt 1 Werte geändert, bei jedem betroffenen Beacon im Layout zuerst **Nicht zugeordnet** wählen und danach den Beacon wieder auswählen. Erst dann übernimmt das Layout die neuen Werte.
4. Jedes echte Beacon genau einmal platzieren. Beacons, die es im Raum nicht gibt, im Layout löschen oder in der Ebenenliste prüfen.

## Schritt 5: Eingang setzen

1. Links unter **Elemente** auf **Eingang** klicken und an die Stelle des Raumeingangs klicken.
2. Es muss **genau ein** Eingang im Layout sein. Gibt es schon einen, keinen zweiten anlegen.

## Schritt 6: Speichern und veröffentlichen

1. Oben rechts **Entwurf speichern**. Daneben steht „✓ Gespeichert“, wenn es geklappt hat.
2. Dann **Veröffentlichen** (die Schaltfläche ist erst aktiv, wenn gespeichert ist) und die Rückfrage bestätigen. Danach verwendet die App diese Version.
3. Zur Sicherung (Vorher, Punkt 3) ist **JSON exportieren** ebenfalls oben rechts.

## Schritt 7: Prüfen

1. Im Terminal erneut `scripts/field/check_testroom_beacons.sh`. Ziel: Exit 0. Ohne gespeicherte Bereitschaft steht dort nur „Keine Beacon-Blocker (Bereitschaftsprüfung nicht geprüft)“; „Ergebnis: BEREIT“ erscheint erst, wenn auch die Bereitschaft (Punkt 3, `--readiness-json`) geprüft wurde und keine Blocker meldet.
2. Mit den abgelesenen Werten vergleichen:

   ```text
   scripts/field/check_testroom_beacons.sh --values docs/pilot-readiness/hardware/TESTRAUM_BEACON_WERTE.md
   ```

3. Die Admin-Sicht: **Stores**, Testraum öffnen, **Pilot-Bereitschaft**. Dort soll „Nicht bereit“ keine Beacon- oder Eingang-Meldung mehr zeigen. Möchten Sie diese Sicht ins Skript einbeziehen, speichern Sie die Antwort von `/api/stores/<Store-ID>/readiness` aus dem Browser als Datei und übergeben sie mit `--readiness-json datei.json`.

## Wenn etwas schiefgeht

- Das Skript meldet **mehr** Blocker als vorher: die letzte Änderung rückgängig machen (im Editor die exportierte JSON-Datei mit **JSON importieren** laden, in **Beacons** den alten Wert wieder eintragen) und im Team melden.
- Meldung „UUID … nicht registriert“: Das Beacon fehlt in Schritt 1 oder ist nicht dem Testraum zugewiesen (Schritt 2).
- Meldung „Major und Minor fehlen“: in **Beacons** bei **Bearbeiten** nachtragen, dann Schritt 4, Punkt 3.
- Meldung „Mehrdeutig“: Zwei Beacons haben dieselbe Major/Minor-Kombination. Am Gerät prüfen, welche Zahlen wirklich eingestellt sind (`CONFIGURE_BEACON.md`). Nur wenn ein Gerät falsch konfiguriert ist, neu konfigurieren, nie nur im Admin ändern.
- Meldung „Eingang“: Schritt 5.

Der Codex-Auftrag für denselben Ablauf im Browser steht in `codex/CODEX_BEACON_EINTRAGUNG.md`.
