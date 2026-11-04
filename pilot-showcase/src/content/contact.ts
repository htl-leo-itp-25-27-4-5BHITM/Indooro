/**
 * Kontaktkonfiguration für die Pilot-Anfrage.
 *
 * TODO(team): Kontaktadresse eintragen.
 * Solange `email`, `phone` und `person` leer sind, zeigt die Kontaktkarte einen neutralen Text
 * ("Sprechen Sie uns direkt an …") plus den Link zum Repository. Es werden bewusst keine
 * erfundenen Kontaktdaten angezeigt. Vorab mit Schule/Betreuung abstimmen, welcher Absender genannt wird.
 */
export interface ContactConfig {
  /** Teamkontakt per E-Mail. */
  email: string;
  /** Telefonnummer nur für die Rückmeldung durch den Markt. */
  phone: string;
  /** Ansprechperson im Team (nur mit deren Zustimmung eintragen). */
  person: string;
}

export const contact: ContactConfig = {
  email: "",
  phone: "",
  person: ""
};

export const REPO_URL = "https://github.com/htl-leo-itp-25-27-4-5BHITM/Indooro";
export const PUBLIC_APP_URL = "https://it220209.cloud.htl-leonding.ac.at/";

export function hasContact(c: ContactConfig = contact): boolean {
  return Boolean(c.email.trim() || c.phone.trim() || c.person.trim());
}
