# Admin Pilot-Cut

Stand: 2026-10-16. Dieser Branch bereitet den Admin für den ersten Supermarkt-Pilot vor. Er ist ein lokaler Code- und Teststand; Merge nach `main`, Datenbank-Backup und Deployment liegen bei Erik.

## Pilot-Oberfläche

| Bereich | Pilot-Pfad | Stand |
| --- | --- | --- |
| Regionen | `/admin/regions/` → `/admin/next/regions/` | Neuer Admin; Liste, Detail, Anlegen/Bearbeiten/Archivieren und Rollen-Scope lokal geprüft. |
| Stores | `/admin/stores/` und `/admin/stores/detail/` → Candidate | Neuer Admin; Metadaten, Layout-Status, Beacon-Zuordnung und Store-Aktionen lokal geprüft. |
| Beacons | `/admin/beacons/` → Candidate | Neuer Admin; Identität, Zuordnung, Freigabe, Archivierung und Scope lokal geprüft. Physische Geräteprüfung fehlt. |
| Layout-Editor | `/admin/editor/` | **Legacy aktiv:** `editor: false` in `backend/indooro_server/src/main/resources/META-INF/resources/admin/route-cutover.js`. Die neue Oberfläche bleibt unter `/admin/next/editor/` als geschützter Test-Direktlink verfügbar. |
| Produkte | `/admin/products/` → Candidate | Neuer Admin; serverweite Sortierung/Filterung vor Pagination und globale Format-Readiness lokal geprüft. „Routbar“ beweist keinen erreichbaren Regalweg. |
| Kategorien | `/admin/categories/` → Candidate | Neuer Admin; einzelne Datensätze und Konfliktbehandlung lokal geprüft. |

Auch Dashboard, Rezepte und Diagnostik sind lokal auf die neue Oberfläche umgeschaltet. Produkt-/Kategorie-Bulk-Import zeigt Review, sein **Commit bleibt deaktiviert**, bis Partial-Result, Transport-Unknown und Überschreibsemantik geklärt sind. Die neun aktivierten Routen und der Editor-Status stehen in `ROUTE_PARITY_MATRIX.md` und `ROUTE_CUTOVER.md`.

Für den Pilot bleibt der Editor auf Legacy, sofern die vorhandenen fokussierten Live-Probes für Speichern, Aktivieren, Import/Export, Rollen-Drafts und Fehlerzustände nicht gemeinsam auf dem finalen lokalen Paket grün sind. Ein positives Ergebnis erlaubt einen getrennt dokumentierten Editor-Flag-Cutover; es ist **keine** Voraussetzung für diesen Pilot-Cut. Das bestehende Legacy-Editor-Verhalten bei Preview/Export und fehlendem Eingang unterscheidet sich teils vom Candidate; siehe `EDITOR_ACTION_MATRIX.md`.

## Prüfung nach Abgleich mit `origin/main`

`git fetch origin && git merge origin/main` ergab „Already up to date.“ Danach bestanden `sh ./mvnw test` (142/142; das vorhandene `mvnw` hat kein Execute-Bit), Admin-UI-Typecheck, ESLint, 69/69 Unit-Tests, 111/111 Browser-Tests mit frisch paketierter Candidate-Ausgabe, `npm run build` und strikte OpenSpec-Validierung 42/42. Diese automatischen Checks ersetzen keinen Produktions-Smoke oder physischen Beacon-Weg.

## Bekannte Lücken und Zuständigkeit

- OpenSpec `rebuild-admin-platform` Tasks 1.2, 3.10 und 5.4 sind teilweise belegt; der fehlende vollständige Aktions-/Zustands-/Rollen-Nachweis ist in `EDITOR_EVIDENCE_GAPS.md` erfasst und an `complete-admin-parity-evidence` übergeben. Task 1.1 verlangte einen Review vor Implementierungsbeginn und ist historisch nicht nachholbar. Der Change wird für den Pilot nicht archiviert.
- Kein physischer Beacon-/iPhone-Wegtest. Swift-Routing für gedrehte Regale gehört zu `add-pilot-guided-tour-fallbacks` Abschnitt 9. Der experimentelle Rotationsfix ist nicht Teil dieses Admin-Branchs.
- Der neue Editor bleibt trotz gezielter Draft-/Publish-/Import-/Export-/Rollen-/Fehlerproben auf Legacy, solange sein vollständiges Route-Gate offen ist. Rezeptänderungen bestehen aus mehreren HTTP-Schritten und können bei Teilfehlern eine Korrektur verlangen.
- Die lokalen Probes und das Image sind keine Produktionsabnahme. Backup, Deployment und Smoke nach Rollout erfolgen separat.

## Route-Rollback

Der Cutover-Schalter liegt in `backend/indooro_server/src/main/resources/META-INF/resources/admin/route-cutover.js`. Für eine betroffene Route ihren Schlüssel (`dashboard`, `regions`, `stores`, `storeDetail`, `beacons`, `products`, `categories`, `recipes`, `editor`, `diagnostics`) auf `false` setzen, neu paketieren und den alten URL mit Query/Fragment und Rollen-/Scope-Sitzung prüfen. `editor` steht im Pilot zunächst bereits auf `false`. Die alten statischen Seiten bleiben im Paket; dieser URL-Rollback benötigt keine Layout-Datenbank-Rücknahme. Für einen vollständigen Anwendungs-Rollback das zuvor freigegebene unveränderliche Image gemäß `RELEASE_EVIDENCE.md` verwenden; das wurde nicht in Produktion geübt.

## Deployment-Konfiguration: Namen ohne Werte

Die Backend-Umgebung benötigt Datenbank-Namen `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`; OpenSearch-Namen `OPENSEARCH_HOST`, `OPENSEARCH_PORT`; sowie OIDC-Namen `QUARKUS_OIDC_AUTH_SERVER_URL`, `QUARKUS_OIDC_CLIENT_ID`, `QUARKUS_OIDC_CREDENTIALS_SECRET`. Die `application.properties` kennt außerdem die entsprechenden lokalen Namen `OIDC_AUTH_SERVER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`. Welche Variante gesetzt wird, richtet sich nach der Quarkus-/Kubernetes-Konfiguration.

Die zugehörigen Kubernetes-Secret-Referenzen heißen `indooro-keycloak-secret` (`admin-web-client-secret`, `bootstrap-admin-username`, `bootstrap-admin-password`) und optional für den Upsell-Dienst `indooro-openai-secret` (`OPENAI_API_KEY`). PostgreSQL/Keycloak-Manifeste verwenden außerdem `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `KC_BOOTSTRAP_ADMIN_USERNAME` und `KC_BOOTSTRAP_ADMIN_PASSWORD`. `OPENAI_UPSELL_ENABLED`, `OPENAI_UPSELL_MODEL`, `OPENAI_UPSELL_REASONING_EFFORT`, `OPENAI_UPSELL_TIMEOUT_MS`, `UPSELL_ENABLED` und `UPSELL_MAX_CANDIDATES` sind funktionsbezogene Konfigurationsnamen; der Pilot benötigt keinen aktivierten Upsell. Hier stehen absichtlich keine Secret-Werte.
