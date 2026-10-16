# Evidence: add-qr-anchor-positioning (Simulator iPhone 16 Pro, 2026-10-16)

| Datei | Zeigt |
|---|---|
| `01-qr-button-and-banner.png` | „QR-Code scannen“ neben „Ich bin hier“ und im Banner „Position ungenau“ |
| `02-scanner-fallback-unknown-code.png` | Scanner ohne Kamera (Simulator, Berechtigung abgelehnt): Hinweistext, DEBUG-Feld „Payload einfügen“, Meldung „Unbekannter Code – bitte anderen Code scannen“ |

Die Simulator-Tastatur verfälschte Sonderzeichen beim Tippen (`:`, `?`, `=`), der Payload war deshalb ungültig. Die Pfade „Position gesetzt“, „anderer Store“ und „unbekannter Anker“ sind mit `AnchorPayloadTests` (28 Tests) abgedeckt; der Kameratest mit einem gedruckten Code ist ein Human step (Gerät).
