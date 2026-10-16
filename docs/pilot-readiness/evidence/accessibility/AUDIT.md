# Accessibility-Audit – wartet auf Start-Gate

Stand 2026-10-16, Branch pilot/ios-accessibility, Basis 46b9ad1.

Kein Accessibility-Inspector-Audit durchgeführt; kein Vorher-/Nachher-Befund behauptet. Task 1.1 setzt den Merge von prepare-pilot-ios-build nach pilot/first-store voraus. origin/pilot/ios-pilot-build=a20d385 ist kein Vorfahr von origin/pilot/first-store=46b9ad1 (merge-base Exit 1). Der von David erlaubte direkte A-Merge gilt ausdrücklich für B.

## Nächster erlaubter Schritt

1. A nach pilot/first-store integrieren, diesen Branch aktualisieren.
2. Xcode Accessibility Inspector gegen den Pilot-Build: Kontrast, Elementnamen, Fokusreihenfolge und 44-pt-Ziele protokollieren, Screenshots hier bzw. evidence/improve-ios-accessibility ablegen.
3. Größte Accessibility-Schriftgröße für Suche/Ergebnisse/Regaltext prüfen, VoiceOver prüfen.
4. Mit Erik pro Datei Accessibility-Modifier an MapView und StoreMapPage absprechen. Ohne Absprache diese Dateien nur lesen.
5. A-eigene Views ändern, danach Audit und Tests; UI-Tests von Erik nur verwenden, wenn gemergt/vorhanden.

Kein Screenshot als Audit-Nachweis vorhanden, weil das Audit vor dem Start-Gate noch nicht begonnen wurde.
