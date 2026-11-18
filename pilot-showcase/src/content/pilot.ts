/** Texte für die Pilot-Anfrage an Marktpartner. Keine versprochenen wirtschaftlichen Vorteile. */

export const PILOT_HEADLINE = "Wir suchen einen Markt für einen ehrlichen Test.";
export const PILOT_SUBLINE =
  "Ein Supermarkt in Linz oder Oberösterreich, in dem wir Indooro unter realistischen Bedingungen testen dürfen. Den technischen Aufwand übernehmen wir. Ob die Ortung im echten Markt trägt, wissen wir erst nach diesem Test.";

export const WE_SEEK = [
  "Einen Supermarkt in Linz oder Oberösterreich",
  "Einen klar begrenzten Bereich, zum Beispiel einige Gänge",
  "Realistische Bedingungen: Regale, Metall, Kundschaft, Licht"
];

export const WE_NEED = [
  "Zugang nach Absprache, außerhalb der Stoßzeiten",
  "Ihr Einverständnis, Grundriss und Regale zu erfassen (Fotos ohne Personen)",
  "Ein begrenztes Test-Sortiment, zum Beispiel einige Gänge",
  "Die Erlaubnis, Beacons zu platzieren: kleine Batteriegeräte, rückstandsfrei entfernbar, ohne Kabel, ohne Eingriff in IT oder Kassensystem",
  "Einige gemeinsame Testtermine",
  "Eine Ansprechperson im Markt"
];

export const YOU_GET = [
  "Einblick in ein innovatives Diplomprojekt der HTL Leonding",
  "Eine Vorführung von digitaler Produktsuche und Wegführung in Ihrem eigenen Markt",
  "Erkenntnisse aus dem gemeinsamen Test als schriftliche Auswertung",
  "Die Möglichkeit, das Projekt mitzugestalten"
];

export const NOT_PROMISED =
  "Wir versprechen keinen wirtschaftlichen Nutzen. Ob und wie Indooro im Markt hilft, soll der Test zeigen.";

export interface PilotStep {
  title: string;
  what: string;
  effort: string;
}

export const PILOT_STEPS: PilotStep[] = [
  { title: "Erstgespräch", what: "Wir zeigen die Demo, klären Fragen und Rahmenbedingungen. Sie entscheiden, ob es weitergeht.", effort: "1 Termin · Ihr Aufwand ca. 20–30 Minuten" },
  { title: "Marktaufnahme", what: "Wir vermessen den vereinbarten Bereich, erfassen Regale und fotografieren Regale ohne Personen.", effort: "Teil von 2–3 Besuchen à 2–3 h außerhalb der Stoßzeiten · Ihr Aufwand: Zugang und Ansprechperson" },
  { title: "Technische Einrichtung", what: "Das Team richtet Grundriss, Sortiment und Beacons in der Verwaltung ein und prüft die Bereitschaft.", effort: "Erledigt das Team · 8–12 kleine Sender, ohne Bohren, rückstandsfrei entfernbar" },
  { title: "Beacon- und Navigationstests", what: "Wir testen Suche, Wegführung und Ortung mit eigenen Geräten. Testpersonen nehmen freiwillig und mit Einwilligung teil.", effort: "Praxistest über 1–2 Wochen mit einzelnen Terminen · Ihr Aufwand insgesamt ca. 1 Stunde" },
  { title: "Gemeinsame Auswertung", what: "Wir besprechen die Ergebnisse, übergeben die schriftliche Auswertung und bauen alle Beacons ab.", effort: "ca. 1 Stunde" }
];

export interface FaqItem {
  q: string;
  a: string;
}

export const FRAMEWORK_NOTE =
  "Nach jeder Phase entscheiden Sie, ob es weitergeht. Ein Abbruch ist jederzeit möglich; wir entfernen dann alle Beacons rückstandsfrei.";

export const FAQ: FaqItem[] = [
  { q: "Was kostet der Pilot?", a: "Für den Markt entstehen keine Kosten. Die Beacons, Montage und Demontage, Testgeräte und die Auswertung übernimmt das Projektteam." },
  { q: "Brauchen Sie personenbezogene Daten von Kundinnen und Kunden?", a: "Nein. Für den Test sind keine Kundendaten nötig, und es werden keine an den Markt oder Dritte weitergegeben. Testpersonen nehmen freiwillig und mit schriftlicher Einwilligung teil. Ein Hinweisschild am Eingang des Testbereichs informiert die Kundschaft." },
  { q: "Stört der Test den Betrieb?", a: "Das wollen wir vermeiden. Aufnahme und Einrichtung finden außerhalb der Stoßzeiten statt, die Tests sind kurz und auf einen Bereich begrenzt. Ins Kassensystem oder in die Markt-IT greifen wir nicht ein." },
  { q: "Was passiert mit den Beacons nach dem Test?", a: "Sie werden rückstandsfrei entfernt, spätestens zum vereinbarten Datum. Es wird nichts gebohrt und nichts verkabelt." },
  { q: "Gibt es eine schriftliche Vereinbarung?", a: "Ja, wir haben einen einseitigen Entwurf einer Pilotvereinbarung: Zeitraum und Bereich, Montage, Zugang, Kosten, Beendigung, Veröffentlichung nur mit Ihrer Zustimmung. Haftung und Versicherung klären wir vorab mit Schule und Betreuung; das ist noch offen." },
  { q: "Was, wenn die Genauigkeit nicht reicht?", a: "Dann ist das ein Ergebnis. Genau das soll der Test herausfinden. Es gibt bisher keine Messung im echten Markt, und wir versprechen keine Genauigkeit. Sie erhalten die Auswertung auch dann, wenn sie ernüchternd ausfällt." },
  { q: "Wer ist verantwortlich?", a: "Ein Team von fünf Schülern der HTL Leonding (Abteilung Informationstechnologie) mit betreuenden Lehrkräften. Der Pilot ist Teil eines Diplomprojekts, kein Produktangebot." }
];

export const AT_A_GLANCE: { label: string; value: string }[] = [
  { label: "Wer", value: "5 Schüler der HTL Leonding, betreut von Lehrkräften" },
  { label: "Was", value: "Test von Produktsuche und Wegführung im Markt" },
  { label: "Wo", value: "Ein begrenzter Bereich in einem Markt in Linz / Oberösterreich" },
  { label: "Ablauf", value: "5 Schritte, Termine außerhalb der Stoßzeiten" },
  { label: "Kosten", value: "Keine für den Markt" },
  { label: "Technik", value: "Kleine Beacons, rückstandsfrei, ohne Kabel, kein Eingriff in IT/Kasse" },
  { label: "Ergebnis", value: "Schriftliche Auswertung; Abbruch jederzeit möglich" }
];
