# Login in den Admin

**URL:** https://it220209.cloud.htl-leonding.ac.at/admin/

Der Admin leitet zum Keycloak-Login weiter: Realm `indooro`, Pfad `/keycloak/realms/indooro/…`.

## Benutzer

| Benutzer | Rolle | Sieht |
|---|---|---|
| `indooro-admin` | `admin` | alles |
| `indooro-region` | `region-manager` | Märkte der zugewiesenen Region |
| `indooro-store` | `store-manager` | nur den zugewiesenen Markt |

- **Passwörter:** Die Demo-Passwörter stehen nicht im Repository. Lokal kommen sie aus `.env` (Vorlage `.env.example`), auf LeoCloud aus dem Secret `indooro-keycloak-secret`; siehe `docs/pilot-readiness/operations/SECRET_ROTATION.md`. Sie werden mit `release-pilot-backend` (Person B, Task 6.1) geändert. Danach bekommt ihr die neuen Passwörter von Erik, niemals per Git oder Chat-Verlauf mit Klartext.
- **Rechte im Indooro-Admin:** Ein Keycloak-Benutzer braucht zusätzlich einen **Zugang** im Indooro-Admin: Rolle, dazu Region oder Markt, verknüpft über die Keycloak-ID (`sub`). Für `indooro-admin` legt Flyway das automatisch an. Alle anderen Zugänge vergibt ein Administrator im Admin unter **Zugänge** (`/admin/next/access/`), ohne SQL; siehe „Neuen Zugang vergeben“ unten.
- **Eigene Benutzer statt Demo:** Erik legt sie in der Keycloak-Adminkonsole an (https://it220209.cloud.htl-leonding.ac.at/keycloak/admin/) und vergibt dort die Realm-Rolle. Den Zugang im Indooro-Admin vergibt danach ein Administrator auf der Seite „Zugänge“. Das Bootstrap-Admin-Passwort der Konsole liegt im Kubernetes-Secret `indooro-keycloak-secret`, Schlüssel `bootstrap-admin-username` und `bootstrap-admin-password`. Nur Erik liest es lokal aus:

  ```bash
  kubectl -n student-it220209 get secret indooro-keycloak-secret -o jsonpath='{.data.bootstrap-admin-password}' | base64 -d; echo
  ```

## Neuen Zugang vergeben

1. **Keycloak-Konsole** (nur Erik): Benutzer anlegen, Passwort setzen und die Realm-Rolle zuweisen (`store-manager`, `region-manager` oder `admin`). Die Rolle in Keycloak und die Rolle des Zugangs müssen gleich sein.
2. **Keycloak-ID holen:** Die Person meldet sich unter `/admin/next/` an. Ohne Zugang sieht sie „Zugriff verweigert“ und darunter ihre **Keycloak-ID (sub)** mit einem Knopf „Kopieren“. Sie schickt dir diese ID. Alternativ steht die ID in der Keycloak-Konsole unter Users → Benutzer → ID.
3. **Zugang anlegen** (Rolle `admin`): Admin → **Zugänge** → „Zugang anlegen“. Keycloak-ID, Benutzername und optional E-Mail eintragen, Rolle wählen. Ein Marktleiter (`store-manager`) braucht einen **Markt**, ein Regionsmanager (`region-manager`) eine **Region**, ein Administrator keines von beiden.
4. Die Person lädt die Seite neu. Ein Marktleiter sieht danach nur seinen Markt.

Regeln:

- Pro Keycloak-ID gibt es höchstens einen aktiven Zugang. Für einen anderen Markt den alten Zugang zuerst **deaktivieren**, dann neu anlegen.
- **Deaktivieren** nimmt den Zugriff mit der nächsten Anfrage weg. Den eigenen Zugang kann man nicht deaktivieren.
- Jede Anlage und jede Deaktivierung steht im Audit-Log (Admin → Diagnose, Typ `USER_ACCESS`).

## Welcher Editor?

Der Layout-Editor unter `/admin/editor/` ist noch der Legacy-Editor (`editor: false` in `route-cutover.js`). Der neue Editor liegt unter `/admin/next/editor/` und wird mit `complete-admin-parity-evidence` zum Standard. Alle anderen Seiten (Dashboard, Regionen, Märkte, Beacons, Produkte, Kategorien, Rezepte, Diagnose) laufen bereits im neuen Admin.

## Wenn der Login nicht geht

- Leere Seite nach dem Login: Prüfen, ob das laufende Image das Admin-Frontend enthält. Es muss `:d91a1b0` oder neuer sein, siehe `docs/admin-rebuild/RELEASE_2026-10-16.md`.
- „Zugriff verweigert“ nach dem Login, mit Keycloak-ID darunter: Dem Benutzer fehlt ein aktiver Zugang. Ein Administrator legt ihn unter „Zugänge“ an (siehe oben).
- „Zugriff verweigert“ mit dem Text „Keycloak-Rolle und Indooro-Zugriffsrolle stimmen nicht ueberein“: Die Realm-Rolle in Keycloak passt nicht zur Rolle des Zugangs. Rolle in der Keycloak-Konsole korrigieren oder den Zugang deaktivieren und mit der richtigen Rolle neu anlegen.
