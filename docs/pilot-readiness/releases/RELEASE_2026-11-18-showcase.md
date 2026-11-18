# Release 2026-11-18 (2): Pilot-Demo auf LeoCloud

Ausgeführt von Claude Code im Auftrag von Erik („Ja, merge und deploy“, 2026-11-18). Ablauf wie beim Release am Vormittag: Backup, genau ein `kubectl set image` mit festem Commit-Tag, Smoke-Check vorher und nachher.

## Inhalt

| PR | Änderung |
|---|---|
| #219 | Die Pilot-Demo (`pilot-showcase/`, #208) wird ins Backend-Image gebaut und unter `/showcase/` ohne Login ausgeliefert. Die Startseite `/` verlinkt sie als Karte „Pilot-Demo“. |

Das Image enthält außerdem alles, was seit `:27e1255` auf `main` kam: #199, #208, #212, #213 und #217. Diese PRs ändern nur Doku, iOS, `tools/beacon-lab` und `pilot-showcase`, nicht das Backend. Gegenüber `:27e1255` ändern sich im Backend nur `index.html` und der neue Test `ShowcaseStaticResourceTest`. Keine API-, Vertrags- oder Datenbankänderung, keine Flyway-Migration, keine Änderung an den Login-Regeln.

## Ergebnis

| Punkt | Stand |
|---|---|
| Image | `ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2:308cd08` (Merge von #219, CI auf `main` grün), Pod `1/1 Running` |
| Vorheriges Image | `:27e1255`, gesichert in `backups/2026-11-18-showcase-previous-image.txt` |
| Flyway | keine neue Migration, Start ohne Fehler |
| Backup | `pg_dump` vor dem Deploy, 125 008 Byte, SHA-256 `9863a6d04656862a15c4587d4581ecc13de962468d3f18eddad82b5d049ea911`, nur lokal |
| Smoke-Check | vorher und nachher je 18 OK, 0 WARN, 0 FAIL mit `SPAR-Leonding-002 milch`; Ausgaben identisch |
| `/showcase/` | 200, `text/html`, CSP `script-src 'self'` und `nosniff` gesetzt; das Haupt-Bundle lädt (200) |
| Startseite | enthält den Link `href="/showcase/"` |
| Browser | Startseite und Demo geladen, Inhalte sichtbar, keine Konsolenfehler |
| Rollback | nicht nötig |

Rollback: `kubectl -n student-it220209 set image deployment/indooro-backend indooro-backend=$(cat backups/2026-11-18-showcase-previous-image.txt)`.

## Geprüft vor dem Merge

- `npm test` in `pilot-showcase`: 166 Tests grün; `npm run package:backend` baut 1,9 MB.
- `mvn test -Dtest=ShowcaseStaticResourceTest,SecurityHeadersTest`: 3 grün.
- Die Demo lief lokal hinter derselben CSP wie in Produktion, ohne Konsolenfehler.

## Offen

- Kontaktdaten in `pilot-showcase/src/content/contact.ts` eintragen, bevor die Demo einem Markt gezeigt wird. Bis dahin zeigt die Seite einen neutralen Text und den Repository-Link.
