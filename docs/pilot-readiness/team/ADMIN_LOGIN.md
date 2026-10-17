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
- **Rechte im Indooro-Admin:** Ein Keycloak-Benutzer braucht zusätzlich einen Eintrag in `user_access_assignments` (Rolle, Region oder Markt, Keycloak-`sub`). Für `indooro-admin` legt Flyway das automatisch an. Region- und Store-Manager werden nach `DEPLOYMENT.md` Abschnitt „Demo-Benutzer“ zugewiesen.
- **Eigene Benutzer statt Demo:** Erik legt sie in der Keycloak-Adminkonsole an (https://it220209.cloud.htl-leonding.ac.at/keycloak/admin/) und vergibt Realm-Rolle und Zuordnung. Das Bootstrap-Admin-Passwort der Konsole liegt im Kubernetes-Secret `indooro-keycloak-secret`, Schlüssel `bootstrap-admin-username` und `bootstrap-admin-password`. Nur Erik liest es lokal aus:

  ```bash
  kubectl -n student-it220209 get secret indooro-keycloak-secret -o jsonpath='{.data.bootstrap-admin-password}' | base64 -d; echo
  ```

## Welcher Editor?

Der Layout-Editor unter `/admin/editor/` ist noch der Legacy-Editor (`editor: false` in `route-cutover.js`). Der neue Editor liegt unter `/admin/next/editor/` und wird mit `complete-admin-parity-evidence` zum Standard. Alle anderen Seiten (Dashboard, Regionen, Märkte, Beacons, Produkte, Kategorien, Rezepte, Diagnose) laufen bereits im neuen Admin.

## Wenn der Login nicht geht

- Leere Seite nach dem Login: Prüfen, ob das laufende Image das Admin-Frontend enthält. Es muss `:d91a1b0` oder neuer sein, siehe `docs/admin-rebuild/RELEASE_2026-10-16.md`.
- „Forbidden“ nach dem Login: Dem Benutzer fehlt der Eintrag in `user_access_assignments`.
