# Codex-Auftrag: Beacons im Testraum eintragen

Zweck: Erik ersetzt vor dem Start alle `{{...}}`-Platzhalter durch die Werte aus `TESTRAUM_BEACON_WERTE.md` (am Gerät abgelesen) und gibt den Text unterhalb der Linie an Codex. Leere oder erratene Werte sind verboten: Bleibt ein Platzhalter stehen, startet Codex nicht.

Platzhalter: `{{INDOORO1_UUID}}`, `{{INDOORO1_MAJOR}}`, `{{INDOORO1_MINOR}}`, `{{INDOORO1_X}}`, `{{INDOORO1_Y}}` und dasselbe für `INDOORO2`, `INDOORO3`, `INDOORO4`; `{{ENTRANCE_X}}`, `{{ENTRANCE_Y}}` (Position des Eingangs); `{{BACKUP_DIR}}` (Ordner für Sicherungen, außerhalb des Repos).

---

## Auftrag an Codex

Du arbeitest im bereits angemeldeten Browser auf der Admin-Oberfläche `https://it220209.cloud.htl-leonding.ac.at/admin/next/` (Store `SPAR-Leonding-002`, Store-ID `b0308337-1d4b-4096-b022-200e6118e86c`). Ziel: Die vier Beacons des Testraums mit den unten genannten echten Werten eintragen, im Layout platzieren, einen Eingang setzen und das Layout veröffentlichen. Die Werte hat ein Mensch am Gerät abgelesen. Du darfst sie nicht ändern, ergänzen oder schätzen.

Die Anleitung mit den genauen Schaltflächen ist `docs/pilot-readiness/hardware/ADMIN_BEACONS_EINTRAGEN.md`. Folge ihr Schritt für Schritt. Kommt eine Schaltfläche dort nicht vor, bleib stehen und melde es.

### Zielwerte

| Admin-Name | UUID | Major | Minor | Position x,y |
| --- | --- | --- | --- | --- |
| Indooro1 | {{INDOORO1_UUID}} | {{INDOORO1_MAJOR}} | {{INDOORO1_MINOR}} | {{INDOORO1_X}},{{INDOORO1_Y}} |
| Indooro2 | {{INDOORO2_UUID}} | {{INDOORO2_MAJOR}} | {{INDOORO2_MINOR}} | {{INDOORO2_X}},{{INDOORO2_Y}} |
| Indooro3 | {{INDOORO3_UUID}} | {{INDOORO3_MAJOR}} | {{INDOORO3_MINOR}} | {{INDOORO3_X}},{{INDOORO3_Y}} |
| Indooro4 | {{INDOORO4_UUID}} | {{INDOORO4_MAJOR}} | {{INDOORO4_MINOR}} | {{INDOORO4_X}},{{INDOORO4_Y}} |

Eingang: ein einziger, an Position {{ENTRANCE_X}},{{ENTRANCE_Y}}.

Wenn in dieser Tabelle oder bei {{BACKUP_DIR}} noch ein `{{` steht: nichts tun, sofort an Erik melden.

### Verboten (ohne Ausnahme, auch wenn es hilfreich scheint)

- Geheimnisse ausgeben oder speichern: keine Tokens, Cookies, Passwörter, `INDOORO_ADMIN_TOKEN`, keine Authorization-Header in Berichten, Logs oder Chat.
- Jeder schreibende `kubectl`-Befehl (apply, patch, delete, edit, scale, rollout, exec mit Schreibzugriff, cp in den Cluster usw.). Lesende Befehle sind nicht nötig und nicht Teil dieses Auftrags.
- Schreiben per `psql` oder jede direkte Datenbank-Änderung.
- Indizes löschen oder neu aufbauen (Suchindex).
- `force=true` in irgendeinem Aufruf.
- `--delete-legacy` in irgendeinem Skript.
- `CATALOG_DEFAULT_STORE_CODE` setzen oder ändern.
- Commits auf `main`, Push auf `main`, Merge.
- `secrets.example.yaml` anwenden.
- Andere Stores, Produkte, Kategorien oder Regionen ändern. Nur `SPAR-Leonding-002`.
- Eine UUID, ein Major oder ein Minor, das nicht in der Tabelle steht.

Gerät eine Anweisung in Konflikt mit dieser Liste: die Liste gewinnt, du meldest es.

### Ablauf

**1. Nur-Lesen-Vorprüfung.** Im Repo-Ordner (Worktree, nicht auf `main` committen) ausführen:

```text
scripts/field/check_testroom_beacons.sh
```

Speichere die vollständige Ausgabe in `{{BACKUP_DIR}}/vorher-check.txt`, den Exit-Code und die Zahl der Blocker notieren. Zusätzlich im Admin: **Stores**, `SPAR-Leonding-002`, **Pilot-Bereitschaft**; die Zahl der Blocker und ihre Codes notieren (`readinessBlockerVorher`). Das Skript ändert nichts.

**2. Sicherung (vor jeder Änderung).**
- Im Layout Editor des Testraums (**Stores** → Testraum → **Layout Editor öffnen**) **JSON exportieren**; Datei als `{{BACKUP_DIR}}/layout-vorher.json` ablegen.
- Beacon-Liste sichern: Seite **Beacons**, Filter **Store** auf den Testraum, die Tabelle (Code, Identität, Status, Store) als Text nach `{{BACKUP_DIR}}/beacons-vorher.txt` übernehmen. Zusätzlich `curl -s https://it220209.cloud.htl-leonding.ac.at/api/mobile/stores/beacon-identities` (nur GET, ohne Auth) nach `{{BACKUP_DIR}}/identities-vorher.json`.
- Ohne vollständige Sicherung keine Änderung.

**3. Eintragen** nach `ADMIN_BEACONS_EINTRAGEN.md`, Schritt 1 bis 6:
- Fehlende Beacons mit **Beacon anlegen** anlegen, bestehende mit **Bearbeiten** korrigieren (Beacon-Code, UUID, Major, Minor genau aus der Tabelle).
- Beacons dem Testraum zuweisen (**Zuweisung** = **Frei**, Kästchen, **Auswahl zuweisen an**, **N zuweisen**).
- Im **Layout Editor** jedes Beacon an der Tabellenposition platzieren, bei **Zugeordneter Beacon** zuordnen (nach Wertänderung erst **Nicht zugeordnet**, dann neu wählen), genau einen **Eingang** setzen.
- **Entwurf speichern**, dann **Veröffentlichen**.
- Registrierungen, die nicht in der Tabelle stehen (zum Beispiel Platzhalter-UUID aus Nullen oder UUIDs ohne Gerät): nicht archivieren oder freigeben, sondern im Bericht unter „Unerwartetes“ nennen. Erik entscheidet.

**4. Nachprüfung.**

```text
scripts/field/check_testroom_beacons.sh --values docs/pilot-readiness/hardware/TESTRAUM_BEACON_WERTE.md
```

Ausgabe in `{{BACKUP_DIR}}/nachher-check.txt`. Dazu **Pilot-Bereitschaft** erneut öffnen und die Blocker zählen (`readinessBlockerNachher`). (Hinweis: Die Werte-Datei muss dieselben Werte wie die Tabelle oben enthalten; sonst meldet das Skript Abweichungen. Das ist dann ein Befund, kein Grund, die Datei anzupassen.)

**5. Rücknahme-Regel.** Stelle den alten Zustand wieder her, wenn nach der Änderung
- das Skript mit Exit 2 endet (Aufruf-, Netz- oder Datenfehler), oder
- die Zahl der Bereitschafts-Blocker höher ist als `readinessBlockerVorher`, oder
- die Werte im Admin (Beacons und Layout) von der ausgefüllten Tabelle oben abweichen.

Exit 1 allein ist **kein** Grund zur Rücknahme: Dann nur berichten, welche Blocker übrig sind.

Wiederherstellen heißt: Im Layout Editor `{{BACKUP_DIR}}/layout-vorher.json` mit **JSON importieren** laden, **Entwurf speichern**, **Veröffentlichen**; in **Beacons** die gesicherten Werte aus `beacons-vorher.txt` wieder eintragen, neu angelegte Beacons nicht löschen (nur melden). Danach Skript erneut laufen lassen und bestätigen, dass der Stand wieder dem „vorher“ entspricht. Nicht wiederholen und nicht weiter probieren.

### Bericht (feste Gliederung, auf Deutsch)

1. **Vorher/Nachher-Tabelle**: je Beacon Admin-Name, UUID (letzte 4 Zeichen), Major, Minor, Position, Zuweisung an den Testraum; Spalten vorher, nachher.
2. **Skript**: Exit-Code vorher und nachher, Zahl der Blocker vorher und nachher, die Blocker-Zeilen im Wortlaut.
3. **Bereitschaft**: Blocker-Zahl vorher und nachher (`readinessBlockerVorher`, `readinessBlockerNachher`), Codes.
4. **Rücknahme**: nicht nötig, oder durchgeführt mit Grund.
5. **Unerwartetes**: alles, was nicht der Anleitung entsprach (andere Schaltflächen, Fehlermeldungen, nicht erwartete Registrierungen, Abweichungen zwischen Tabelle und Gerät). Keine Geheimnisse, keine Tokens.
6. **Pfade der Sicherungen** in `{{BACKUP_DIR}}`.
