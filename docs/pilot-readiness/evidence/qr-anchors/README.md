# Evidence: add-qr-anchor-positioning (Simulator iPhone 16 Pro, 2026-10-16)

| Datei | Zeigt |
|---|---|
| `01-qr-button-and-banner.png` | „QR-Code scannen“ neben „Ich bin hier“ und im Banner „Position ungenau“ |
| `02-scanner-fallback-unknown-code.png` | Scanner ohne Kamera (Simulator, Berechtigung abgelehnt): Hinweistext, DEBUG-Feld „Payload einfügen“, Meldung „Unbekannter Code – bitte anderen Code scannen“ |
| `03-anchor-scanned-position-set.png` | Pfad „Anker gescannt → Position gesetzt“: Payload `https://it220209.cloud.htl-leonding.ac.at/customer/?store=SPAR-Leonding-001&a=A12` im DEBUG-Feld eingefügt und übernommen; Positionsmarker steht auf Anker A12 (x 10,5 / y 3), das Banner „Position ungenau“ ist weg (Position vertrauenswürdig). |
| `04-one-scan-store-switch-position-set.png` | Ein Scan genügt: Code `MOCK-QR-002`/`B7` aus „QR-Testmarkt (Mock)“ gescannt, „Wechseln“ getippt, der Store wird geladen und der Marker steht auf Anker B7 (kein zweiter Scan) |
| `05-store-switch-unknown-anchor.png` | Code `MOCK-QR-001`/`A99` (Anker existiert nicht) aus dem anderen Store: nach „Wechseln“ „Unbekannter Code – bitte anderen Code scannen“, kein hängender Zustand |

Test-QR-Codes für das iPhone: `test-qr-A12-mock-store.gif` (Store 1), `test-qr-B7-store2.gif` (Store 2, Anker vorhanden), `test-qr-A99-store2-unknown-anchor.gif` (Store 2, Anker fehlt).

## So wiederholbar

Der Simulator hat keine Kamera und die Tastatur verfälscht Sonderzeichen beim Tippen. Der Payload kommt deshalb über die Zwischenablage:

```bash
python3 scripts/dev/mock_mobile_api.py &          # Store mit Ankern A1 und A12 auf 127.0.0.1:18090
printf '%s' 'https://it220209.cloud.htl-leonding.ac.at/customer/?store=MOCK-QR-001&a=A12' | xcrun simctl pbcopy booted
SIMCTL_CHILD_INDOORO_API_BASE_URL=http://127.0.0.1:18090/api xcrun simctl launch booted at.ac.htl.leonding.indooroswift2
```

Dann in der App: Karte → Store wählen → „QR-Code scannen“ → im Feld „Payload einfügen“ lange drücken → „Paste“ → „Übernehmen“.

Die Pfade „anderer Store“ und „unbekannter Anker“ sind mit `AnchorPayloadTests` abgedeckt. Der Kameratest mit einem gedruckten Code bleibt ein Human step (Gerät).

## Gerätetest

iPhone 13, 2026-10-16, Debug-Build von `pilot/qr-anchors` gegen `scripts/dev/mock_mobile_api.py` (zwei Stores): bestanden. Scan eines Codes mit Anker A12 setzt die Position; Scan eines Codes aus einem anderen Store setzt nach „Wechseln“ die Position mit einem Scan. Der Test mit einem gedruckten Admin-Code gegen einen echten Store mit Ankern steht noch aus (braucht Backend-Rollout und Layout-Update).
