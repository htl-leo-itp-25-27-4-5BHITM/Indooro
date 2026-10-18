# **Projektauftrag: Indooro**
Erik Bergmair
Michael Stelzmüller
Fabian Joos
Niilo Rieser
David Berghahn

### **Projektbezeichnung**
Indooro

### **Projektauftraggeber**
Dietmar Steiner, Christian Aberger, Dejan Sivak

### **Projekthintergrund**
Das Einkaufen soll für Kundinnen und Kunden einfacher und weniger anstrengend werden. Mit Indooro müssen sie nicht mehr VerkäuferInnen nach bestimmten Produkten fragen, sondern können diese selbständig über eine App finden.

Die Idee entstand aus unserer Samstagsarbeit bei SPAR, wo wir regelmäßig erlebt haben, dass Kundinnen nach Produkten suchen und sich ohne Hilfe schwer orientieren. Indooro soll dieses Problem lösen, indem die App gezielt zum gewünschten Produkt führt und so den Einkauf effizienter gestaltet.

### **Projektendergebnis**
Das Projektziel ist eine funktionierende App, die Kundinnen zuverlässig beim Auffinden von Produkten unterstützt. Der Erfolg wird daran gemessen, dass die App die Signale im Geschäft erkennt, eine Route zum gesuchten Produkt berechnet und diese im Grundriss klar darstellt.

### **Projektziel(e)**
* Entwicklung einer iOS-App zur Produktsuche im Geschäft.
* Nutzung von Drahtlostechnologie zur Startpositionserkennung.
* Routenberechnung vom Startpunkt zum Produkt-Regal.
* Einfaches Backend für Produktdaten.
* Admin-Editor zum Eintragen von Produkten.

### **Nicht-Ziele**
* Live-Tracking der Nutzerbewegungen im Geschäft (nur Startpunkt + Zielroute wird umgesetzt).
* Komplexe Kundenprofile oder Benutzerkonten.
* Marketing- oder Verkaufsdatenanalyse.
* Nutzung der App zum bloßen Bummeln ohne Such- oder Navigationsziel.

---

## **Projektbeschreibung**
Indooro ist eine iOS-App, die Kundinnen und Kunden beim Einkaufen unterstützt. Ziel ist es, gesuchte Produkte im Supermarkt schneller zu finden, ohne MitarbeiterInnen fragen zu müssen.

Die Startposition des Nutzers wird über fest installierte Signalgeber im Geschäft ermittelt. Nach Eingabe des gewünschten Produkts berechnet die App den kürzesten Weg zu dem entsprechenden Regalabschnitt und zeigt die Route im Grundriss an.

Die Daten zu Produkten und Regalen werden in einem Backend gespeichert und können über einen einfachen Admin-Editor gepflegt werden. Damit können Ladenbesitzer Produkte selbst eintragen und aktuell halten. Das Projekt liefert damit eine funktionierende Navigationslösung im Geschäft, bestehend aus App, Backend und Editor.

---

## **Projektphasen / Meilensteine**
Die Umsetzung erfolgt iterativ nach Scrum, die Phasen dienen als grobe Orientierung.

| Phase / Bereich                 | Ergebnis / Orientierung                                            | Soll-Termin            |
| :------------------------------ | :----------------------------------------------------------------- | :--------------------- |
| **Integration der Ortungstechnologie** | iPhone erkennt die Signale, Startposition bestimmbar               | Herbst 2025            |
| **Design & Backend-Aufbau** | App-Design (UI-Screens) und erstes Backend mit Datenmodell         | Winter 2025            |
| **App-Entwicklung** | Produktsuche und Routenberechnung im Grundriss funktionsfähig      | Frühjahr 2026          |
| **Admin-Plattform** | Webtool zum Eintragen von Produkten und Regalen                    | Frühjahr 2026          |
| **Integration & Test** | Gesamtsystem läuft: Signal-Erkennung + Produktsuche + Route + Editor | Frühsommer 2026        |
| **Feinschliff & Präsentation** | Verbesserungen, Projektdoku und Werbevideo                         | Herbst 2026 (5. Klasse) |

---

## **Projektdetails**

**Projektstart:** Das Projekt startet mit der Zustimmung der Lehrer zum Projektauftrag.
**Projektende:** Mitte des Schuljahres 2026/2027.

### **Projektressourcen**
Wir möchten anfänglich ca. 4 drahtlose Signalgeber (basierend auf Bluetooth-Technologie) anschaffen - Stückpreis rund 20 €.

### **Toolstack**

**Mobile App (iOS):**
* **Swift + SwiftUI:** Moderne iOS-Oberfläche.
* **CoreLocation:** Erkennung von Ortungssignalen für die Startposition.
* **A* Algorithmus:** Routenberechnung in der App.
* **Darstellung des Grundrisses:** 2D, z. B. Canvas oder Map-View.

**Backend (noch zu klären):**
* **Sprache & Framework:** Java mit Quarkus.
* **API:** Implementierung von REST-Endpunkten.
* **Datenbank:**
    * SQL (PostgreSQL oder MySQL) → für strukturierte Daten wie Produkte, Regale, etc.
    * Optional: NoSQL (MongoDB) → für flexible Datenhaltung (z. B. Grundrisse).

**Admin-Editor (Web):**
* Einfaches Webtool, um Produkte und Regale in den Grundriss einzutragen (Umsetzung mit Angular oder HTML, CSS, JS).
* Speicherung der Daten im Backend.

---

## **Projektstruktur (iOS-App)**

* `swift/indooro-EinkaeuferFinal/` ist die aktuelle iOS-App (Xcode-Projekt `MCindooroApp.xcodeproj`, Scheme `MCindooroApp`, Quellen in `indooroApp/`).
* `swift/indooro-EinkaeuferFinal/Packages/IndooroKit/` ist das lokale Swift Package mit `IndooroModels` (Datenmodelle) und `IndooroNetworking` (API-Client, Endpunkte, aus `api/openapi/indooro-mobile.yaml` generierte Typen).
* `swift/indooro-EinkaeuferFinal/Package.swift` definiert das Paket `IndooroNavigationCore` (Routing und Ortung) mit eigenen Tests; `swift test` läuft in diesem Ordner und in `Packages/IndooroKit`.
* UI-Tests: `sh scripts/ios/run-ui-tests.sh` (startet den Mobile-API-Mock und führt die Tests im Simulator aus). Mehr dazu in `swift/indooro-EinkaeuferFinal/TESTING.md`.
* `swift/indooro-` und `swift/indooroApp` sind ältere Stände und werden nicht weiterentwickelt.

---

## **Projektrisiken**

### **Technische Risiken**
* **Ungenauigkeiten bei der Signalortung:** Das Signal schwankt stark (Störungen durch Menschen, Regale, Metallflächen). → Risiko: Navigation zeigt falschen Startpunkt oder falsche Route.
* **Ungenügende Abdeckung durch Signalgeber:** 4 Stück könnten für große Märkte nicht reichen → Risiko: geringe Genauigkeit.
* **Backend-Probleme:** Wenn API oder Datenbank nicht zuverlässig funktioniert, sind Produktdaten veraltet oder fehlen.
* **Komplexität Routing:** Falls der Graph für die Navigation schlecht modelliert ist, berechnet die App fehlerhafte oder unlogische Wege.

### **Akzeptanz-/Nutzungsrisiken**
* **Kundenakzeptanz:** Manche Kund:innen könnten die App nicht nutzen wollen (fehlendes WLAN/Mobile Daten, zu kompliziert).
* **Wartungsaufwand:** Ladenbesitzer müssen Daten selbst pflegen → Risiko: Datenbestand ist schnell veraltet.

### **Organisatorische Risiken**
* **Fehlende Testumgebung:** Wenn kein realer SPAR oder eine geeignete Fläche zur Verfügung steht, können nur eingeschränkte Tests durchgeführt werden. → Risiko: Das System wird nicht praxisnah validiert.

*Diese Risiken werden durch klare Aufgabenteilung, frühe Tests in einer realen Umgebung und Beschränkung auf einen Pilotumfang reduziert.*

---

## **Projektorganisation**

* **Anbindung der Ortungshardware:**
    * Michael Stelzmüller
    * David Berghahn
* **App Entwicklung:**
    * Erik Bergmair
    * David Berghahn
* **Server:**
    * Fabian Joos
    * Niilo Rieser

---

**Abschluss des Projektauftrages:**

*30. September 2025, Leonding*

*Unterschriften von David Berghahn, Erik Bergmair, Fabian Joos, Niilo Rieser, Michael Stelzmüller*