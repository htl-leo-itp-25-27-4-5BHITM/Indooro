/** Strukturierte deutsche Texte für den Betreiber-Bereich. */

export const OPERATOR_HEADLINE = "Ihr Markt. In Ihrer Hand.";
export const OPERATOR_SUBLINE =
  "Indooro ist nicht nur eine App für Kundinnen und Kunden. Der Markt richtet sich selbst ein: Grundriss, Regale, Beacons und Sortiment pflegen Sie in einer Web-Verwaltung, ohne dass ein Entwickler dabei sein muss.";

export const USER_STORY =
  "Als Betreiber eines Supermarkts möchte ich meinen Markt mit Sortiment, Regalen und Beacons ins System bringen und sehen, ob er startklar ist, damit Kunden darin Produkte finden und hinnavigiert werden.";

export interface AcceptanceCriterion {
  id: 1 | 2 | 3;
  label: string;
  text: string;
  /** 1-basierte Schritte der Simulation, die dieses Kriterium zeigen. */
  steps: number[];
}

export const ACCEPTANCE_CRITERIA: AcceptanceCriterion[] = [
  { id: 1, label: "AK 1", text: "Ein neuer Markt ist ohne Entwickler anlegbar und befüllbar.", steps: [1, 2, 3, 4] },
  { id: 2, label: "AK 2", text: "Die Bereitschaftsprüfung zeigt „startklar“ oder nennt konkrete Fehler.", steps: [5, 6, 7] },
  { id: 3, label: "AK 3", text: "Die Produktsuche ist auf den gewählten Markt beschränkt.", steps: [7] }
];

export const SIMULATION_BANNER =
  "Geführte Simulation – im echten System erledigen Sie diese Schritte in der Indooro-Admin-Plattform.";

export interface OperatorStepCopy {
  title: string;
  short: string;
  intro: string;
  realFeature: string;
  realNote: string;
}

export const OPERATOR_STEPS: OperatorStepCopy[] = [
  {
    title: "Markt anlegen",
    short: "Markt",
    intro: "Name, Markt-Code und Adresse genügen. Alle Angaben hier sind erfunden.",
    realFeature: "Admin › Märkte › Neuer Markt",
    realNote: "Danach zeigt die Store-Seite eine Einrichtungs-Checkliste mit sieben Schritten."
  },
  {
    title: "Grundriss & Regale",
    short: "Regale",
    intro: "Der Grundriss wird in Metern erfasst (1 Zelle = 1 m). Jedes Regal bekommt Kategorie, Meterzahl und eine Bezeichnung.",
    realFeature: "Layout-Editor",
    realNote: "Im Editor genau ein Eingang, Regale beschriften, speichern und veröffentlichen. Ein Planbild lässt sich als Hintergrund maßstäblich einblenden."
  },
  {
    title: "Beacons konfigurieren",
    short: "Beacons",
    intro: "Beacons werden mit UUID, Major und Minor registriert und im Plan platziert. Die Abdeckung ist ein Planungswert, keine Messung.",
    realFeature: "Beacon-Verwaltung mit Platzierungsplaner",
    realNote: "Die Abdeckungsregel: mindestens 3 Beacons im Radius von 8 m. Im Editor liegt dieselbe Rechnung als Überlagerung über dem Plan."
  },
  {
    title: "Produkte importieren",
    short: "Produkte",
    intro: "Das Sortiment kommt als CSV. Die Vorschau zeigt Zeile für Zeile, was nicht zum Layout passt.",
    realFeature: "CSV-Import mit Vorschau",
    realNote: "Im echten Import bleibt das Speichern gesperrt, solange eine Zeile fehlerhaft ist. In dieser Simulation übernehmen wir die Datei bewusst mit Fehler, damit die nächste Prüfung ihn zeigt."
  },
  {
    title: "Bereitschaftsprüfung",
    short: "Prüfung",
    intro: "Die Prüfung läuft über Layout, Regale, Produkte und Beacons und gibt eine Ampel zurück: Bereit, Bereit mit Hinweisen oder Nicht bereit.",
    realFeature: "Seite „Pilot-Bereitschaft“",
    realNote: "Blockierende Befunde färben die Ampel rot, reine Warnungen gelb. Dieselben Codes und Sätze liefert der Server."
  },
  {
    title: "Fehler beheben",
    short: "Beheben",
    intro: "Jeder Befund sagt, was zu tun ist. Hier genügt ein Klick. Im echten System erledigen Sie es auf der verlinkten Seite.",
    realFeature: "Befund-Links zu Beacons, Editor und CSV-Import",
    realNote: "Nach jeder Korrektur prüfen Sie erneut. Die Ampel muss nicht grün sein, aber ohne blockierende Befunde."
  },
  {
    title: "Startklar",
    short: "Startklar",
    intro: "Ohne blockierende Befunde ist der Markt bereit. Die Suche zeigt nur Produkte dieses Marktes.",
    realFeature: "Bereitschaftsbericht als Markdown-Export",
    realNote: "Den Bericht mit Ampel, Zählern und Befunden können Sie als Markdown-Datei exportieren und zum Termin mitnehmen."
  }
];
