/** Texte für „Wo wir stehen“. Keine Prozentangaben, keine Messwerte. */

export interface StatusItem {
  text: string;
  note?: string;
}

export const DONE: StatusItem[] = [
  { text: "Server mit Datenbank und Produktsuche", note: "Quarkus, PostgreSQL, OpenSearch" },
  { text: "Web-Verwaltung für Märkte", note: "Grundriss- und Regal-Editor, Beacon-Verwaltung" },
  { text: "Platzierungsplaner und Abdeckungsüberlagerung für Beacons" },
  { text: "Produktverwaltung und CSV-Import", note: "mit Vorschau und Zeilenfehlern" },
  { text: "Marktbezogener Katalog und Suche je Markt" },
  { text: "Seite „Pilot-Bereitschaft“", note: "mit Ampel und Markdown-Export" },
  { text: "Einrichtungs-Checkliste auf der Store-Seite" },
  { text: "iOS-App (Swift/SwiftUI)", note: "Wegfindung mit A*, Einkaufslisten-Tour mit Nearest-Neighbour und 2-opt" },
  { text: "Produktsuche im Browser", note: "für Geräte ohne App" },
  { text: "QR-Anker als Rückfall für die Positionierung" },
  { text: "Studienmodus mit Export für die Auswertung" }
];

export const OPEN: StatusItem[] = [
  { text: "Erste Messung in einem Testraum", note: "Es gibt noch keine gemessenen Ortungsergebnisse." },
  { text: "Genauigkeit der Bluetooth-Ortung unter realen Bedingungen", note: "Das soll der Pilot klären." },
  { text: "Pilotmarkt", note: "Noch keiner zugesagt." },
  { text: "Gate „bereit für den Markt“", note: "Hängt an der ersten Messung." },
  { text: "Android-App", note: "Nicht geplant. Es gibt die Suche im Browser." }
];

export const SIMULATED: StatusItem[] = [
  { text: "Position", note: "Die Position in der Demo ist simuliert, keine Messung." },
  { text: "Märkte", note: "Alle Märkte und Grundrisse sind fiktiv." },
  { text: "Produkte", note: "Alle Produkte und Regalzuordnungen sind erfunden." },
  { text: "Betreiber-Ablauf", note: "Die Einrichtung ist eine geführte Simulation, kein Zugriff auf das echte Admin." }
];

export interface TimelineEntry {
  when: string;
  title: string;
  text: string;
  state: "done" | "now" | "planned";
}

export const TIMELINE: TimelineEntry[] = [
  { when: "seit 2025", title: "Projektstart", text: "Erste Prototypen für Produktsuche, Karte und Beacons an der HTL Leonding.", state: "done" },
  { when: "Schuljahr 2026/27", title: "Diplomprojekt", text: "Fünf Schüler der Abteilung Informationstechnologie arbeiten an Verwaltung, App und Ortung.", state: "now" },
  { when: "geplant", title: "Pilotphase", text: "Test in einem echten Markt, sobald ein Partner zusagt. Termine legen wir gemeinsam fest.", state: "planned" }
];
