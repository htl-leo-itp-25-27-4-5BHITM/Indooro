# Evidence: add-qr-anchor-positioning (Simulator iPhone 16 Pro, 2026-10-16)

| Datei | Zeigt |
|---|---|
| `01-qr-button-and-banner.png` | „QR-Code scannen“ neben „Ich bin hier“ und im Banner „Position ungenau“ |
| `02-scanner-fallback-unknown-code.png` | Scanner ohne Kamera (Simulator, Berechtigung abgelehnt): Hinweistext, DEBUG-Feld „Payload einfügen“, Meldung „Unbekannter Code – bitte anderen Code scannen“ |
| `03-anchor-scanned-position-set.png` | Pfad „Anker gescannt → Position gesetzt“: Payload `https://it220209.cloud.htl-leonding.ac.at/customer/?store=SPAR-Leonding-001&a=A12` im DEBUG-Feld eingefügt und übernommen; Positionsmarker steht auf Anker A12 (x 10,5 / y 3), das Banner „Position ungenau“ ist weg (Position vertrauenswürdig). |

## So wiederholbar

Der Simulator hat keine Kamera und die Tastatur verfälscht Sonderzeichen beim Tippen. Der Payload kommt deshalb über die Zwischenablage:

```bash
python3 scripts/dev/mock_mobile_api.py &          # Store mit Ankern A1 und A12 auf 127.0.0.1:18090
printf '%s' 'https://it220209.cloud.htl-leonding.ac.at/customer/?store=SPAR-Leonding-001&a=A12' | xcrun simctl pbcopy booted
SIMCTL_CHILD_INDOORO_API_BASE_URL=http://127.0.0.1:18090/api xcrun simctl launch booted at.ac.htl.leonding.indooroswift2
```

Dann in der App: Karte → Store wählen → „QR-Code scannen“ → im Feld „Payload einfügen“ lange drücken → „Paste“ → „Übernehmen“.

Die Pfade „anderer Store“ und „unbekannter Anker“ sind mit `AnchorPayloadTests` abgedeckt. Der Kameratest mit einem gedruckten Code bleibt ein Human step (Gerät).
