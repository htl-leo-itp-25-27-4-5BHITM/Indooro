# Indooro App - Projektstruktur

## 📁 Ordnerstruktur

```
indooroApp/
├── App/
│   └── indooroAppApp.swift           # App Entry Point
│
├── Models/
│   ├── IndooroBeacon.swift           # Beacon Datenmodell
│   ├── Product.swift                 # Produkt Datenmodell
│   └── LayoutData.swift              # Layout & Grid Datenmodelle
│
├── Managers/
│   └── BeaconManager.swift           # Bluetooth & Positioning Manager
│
├── Views/
│   ├── Main/
│   │   ├── ContentView.swift         # Hauptansicht
│   │   ├── HeaderView.swift          # Kopfzeile mit Position & Zielprodukt
│   │   ├── MapView.swift             # Karten-Ansicht
│   │   └── SearchOverlayView.swift   # Such-Overlay
│   │
│   └── Components/
│       ├── ShelfView.swift           # Regal-Komponente
│       ├── BeaconMapItem.swift       # Beacon-Komponente
│       ├── UserLocationMarker.swift  # Benutzer-Positionsmarker
│       ├── TargetMapMarker.swift     # Ziel-Produktmarker
│       ├── ProductSearchRow.swift    # Suchergebnis-Zeile
│       ├── GridLines.swift           # Gitterlinien
│       └── MapAxes.swift             # Achsenbeschriftungen
│
├── Extensions/
│   └── Color+Hex.swift               # Hex-Farben Unterstützung
│
├── Utilities/
│   └── KalmanFilter.swift            # Kalman Filter für Distanzglättung
│
└── Resources/
    ├── layout.json                   # Laden-Layout Konfiguration
    └── Info.plist                    # App Info
```

## 🔄 Was wurde geändert?

### Vorher
- Alles in einer großen `ContentView.swift` Datei (467 Zeilen)
- Unübersichtlich und schwer wartbar

### Nachher
- **Modularisiert** in logische Komponenten
- **Wiederverwendbare** View-Komponenten
- **Klare Trennung** von Business-Logic und UI
- **Bessere Wartbarkeit** durch kleinere Dateien

## 📦 Module Übersicht

### App
- **indooroAppApp.swift**: SwiftUI App Entry Point

### Models
- **IndooroBeacon**: Beacon-Datenstruktur mit Position und Signalstärke
- **Product**: Produkt-Datenmodell für die Suche
- **LayoutData**: Shop-Layout und Regal-Informationen

### Managers
- **BeaconManager**: 
  - Bluetooth Scanning
  - RSSI-Messung und Distanzberechnung
  - Trilateration für Positionsbestimmung
  - API-Anbindung für Produktsuche
  - Layout-Verwaltung

### Views/Main
- **ContentView**: Hauptcontainer, koordiniert alle Views
- **HeaderView**: Zeigt Position und ausgewähltes Zielprodukt
- **MapView**: Rendert die komplette Karte mit allen Elementen
- **SearchOverlayView**: Suchleiste und Ergebnisliste

### Views/Components
- **ShelfView**: Visualisierung einzelner Regale
- **BeaconMapItem**: Beacon-Icon mit Radar-Kreis
- **UserLocationMarker**: Animierter Benutzer-Standort
- **TargetMapMarker**: Bounce-Animation für Zielprodukt
- **ProductSearchRow**: Einzelne Zeile in Suchergebnissen
- **GridLines**: Gitterlinien für die Karte
- **MapAxes**: X/Y-Achsenbeschriftungen

### Extensions
- **Color+Hex**: Hex-String zu SwiftUI Color Konvertierung

### Utilities
- **KalmanFilter**: Statistische Filterung für stabilere Distanzmessungen

## ✅ Funktionalität

Die gesamte Funktionalität wurde **1:1 übernommen**:
- ✅ Bluetooth Beacon Scanning
- ✅ Echtzeit-Positionsbestimmung
- ✅ Produktsuche
- ✅ Interaktive Karte mit Zoom/Scroll
- ✅ Zielprodukt-Navigation
- ✅ Kalman-Filtering für Stabilität

## 🎯 Vorteile der neuen Struktur

1. **Übersichtlichkeit**: Jede Komponente hat ihre eigene Datei
2. **Wiederverwendbarkeit**: Views können leicht woanders verwendet werden
3. **Testbarkeit**: Einzelne Komponenten können isoliert getestet werden
4. **Skalierbarkeit**: Neue Features können einfach hinzugefügt werden
5. **Team-freundlich**: Mehrere Entwickler können parallel arbeiten
6. **Code-Navigation**: Schnelles Auffinden von Code durch klare Struktur

## 🚀 Nächste Schritte

Die Struktur ist jetzt bereit für:
- Unit Tests für einzelne Komponenten
- SwiftUI Previews für jede View
- Erweiterung um neue Features
- Design-System Integration
- Performance-Optimierungen
