# Tasks: AirDrop-in-Swift-Präsentation überarbeiten

## Ziel

Die Präsentation soll größer, voller und besser als Sprechgrundlage funktionieren. Sie soll weniger nach externer Codeanalyse klingen und mehr so, als würden wir unser eigenes Swift/iOS-Projekt erklären.

## Konkrete Änderungen

1. **Erledigt: Alles größer und raumfüllender machen**
   - Reveal-Deck kleiner konfigurieren, damit es im Browser stärker skaliert.
   - Schriftgrößen für Titel, Fließtext, Karten, Tabellen und Code erhöhen.
   - Folien weniger leer wirken lassen.
   - Zu große Karten mit wenig Text vermeiden.

2. **Erledigt: Formulierungen persönlicher machen**
   - Titel wie "Was wir im Code gefunden haben" ersetzen.
   - Stattdessen Formulierungen wie "Unser Share-Feature im Überblick" oder "So ist das Feature in unserem Projekt aufgebaut" verwenden.
   - Keine Formulierungen, die so klingen, als wäre der Code fremd.

3. **Erledigt: Mehr allgemein erklären**
   - AirDrop, Share Sheet und Datei-Import stärker erklären.
   - Klar erklären: AirDrop ist kein Framework, das man direkt implementiert, sondern ein Ziel im iOS Share Sheet.
   - Share Sheet als zentrale iOS-Schnittstelle erklären.
   - Dateityp, UTType und App-Zuordnung verständlicher machen.

4. **Erledigt: Weniger Code zeigen**
   - Code-Slides auf das Wesentliche reduzieren.
   - Lange Snippets kürzen.
   - Mehr Erklärung auf Folien, weniger Quellcodeblöcke.
   - Code nur dort zeigen, wo er wirklich den Swift/iOS-Mechanismus erklärt.

5. **Erledigt: Speaker Notes einbauen**
   - In Reveal.js pro Folie `<aside class="notes">...</aside>` ergänzen.
   - Sprechtext so schreiben, dass wir beim Präsentieren erklären können, was gemeint ist.
   - Notes sollen verständlich und natürlich sein, nicht zu steif.
   - Hinweise aufnehmen, welche Punkte besonders wichtig sind.

6. **Erledigt: Präsentationsmodus erklären**
   - README ergänzen: Präsentation starten, dann in Reveal.js mit `S` den Speaker View öffnen.
   - Hinweis: Browser muss Pop-ups für localhost erlauben, falls der Speaker View nicht aufgeht.

7. **Erledigt: Nacharbeiten und testen**
   - Lokale Präsentation im Browser neu laden.
   - Kritische Folien prüfen: API-Übersicht, Ablaufdiagramm, Codefolien.
   - Browser-Konsole auf Fehler prüfen.
   - Sicherstellen, dass keine Folie sichtbar abgeschnitten ist.
