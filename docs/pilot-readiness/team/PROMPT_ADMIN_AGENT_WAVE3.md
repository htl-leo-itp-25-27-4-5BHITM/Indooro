# Admin-Agent, Welle 3 (Stand 2026-10-18)

Für den Codex-Agenten, der den Admin-Neubau gebaut hat. Welle 2 ist erledigt: #110 Parität, #111 Underlay und #135 Abdeckungs-Overlay sind gemergt. `pilot/first-store` enthält inzwischen auch `main` (Härtung #123/#134, gemergt mit #136), die Security-Baseline (#141) und den API-Vertrag (#142).

```text
Neue Aufgaben, in dieser Reihenfolge. Lies zuerst `docs/pilot-readiness/team/AGENT_RULES.md` und `docs/admin-rebuild/ROUTE_CUTOVER.md` auf origin/pilot/first-store.

Basis ist jetzt origin/pilot/first-store (nicht main). Jede Aufgabe bekommt einen eigenen Branch von origin/pilot/first-store und einen eigenen PR nach pilot/first-store. Nicht selbst mergen.

A) openspec/changes/complete-admin-parity-evidence/: der neue Editor als Standard
   - Branch pilot/editor-default.
   - Task 2.3: Starte den paketierten Stack lokal (Docker, Dev-Realm mit Testnutzern, keine echten Passwörter). Prüfe die Gates aus ROUTE_CUTOVER.md:
     - Direktlink, Query/Fragment, Refresh
     - die Rollen admin, region-manager und store-manager
     - Rollback mit ?legacy=1 und mit editor:false
   - Sind alle Gates grün, setz in backend/indooro_server/src/main/resources/META-INF/resources/admin/route-cutover.js den Wert editor: true. Leg Screenshots und Protokoll unter docs/admin-rebuild/ ab. Scheitert ein Gate, bleibt der Flag false, und du begründest es im PR.
   - Task 2.2 braucht Hardware: als "(Mensch: Gerät/Beacon)" markieren.
   - Task 3.2: Change archivieren, sobald nur noch Mensch-Tasks offen sind und Erik zustimmt. Sonst offen lassen.

B) openspec/changes/rebuild-admin-platform/: Restnachweise 1.1, 1.2, 3.10, 5.4 und 5.7
   - Branch pilot/admin-rebuild-evidence.
   - Am laufenden lokalen Stack: Runtime-Review, Inventar, Paritätsnachweis pro Route und vollständige Workflows je Rolle, inklusive Ablehnung fremder Direktlinks und Mutationen.
   - Nur beobachtete Ergebnisse abhaken. Was ein Live-System oder echte Logins braucht, markierst du als "(Mensch: …)".
   - Danach openspec validate --all --strict.

Prüfungen vor jedem PR:
- cd backend/indooro_server && sh ./mvnw test
- im Repo-Root: npm ci && npm run admin:verify && npm run contract:check && npm run contract:test
- cd admin-ui && npm run typecheck && npm test
- npx -y @fission-ai/openspec@1.3.1 validate --all --strict

GRENZEN:
- Keine Änderungen unter swift/**, k8s/** und scripts/ops/**.
- Nicht anfassen, weil andere Agenten gerade daran arbeiten:
  - Produktsuche/Katalog (OpenSearchService, ProductResource, AdminProductResource, Katalog-Import)
  - Upsell (UpsellSuggestionService, MobileUpsellResource)
  - Datenzugriff (Branch pilot/backend-data-access-2)
  - LayoutElement-Vertrag und Layout-Validator (Branch pilot/contract-layout-element-types)
  Brauchst du dort eine Änderung, beschreib sie im PR statt sie umzusetzen.
- Keine Sicherheitsannotationen lockern (@RolesAllowed/@PermitAll, requireAdmin/requireStoreAccess).
- Keine Secrets oder Passwörter ins Repo. Nur Testnutzer aus dem Dev-Realm.
- Kein Deploy, kein kubectl. Das Umschalten live auf LeoCloud macht Erik nach dem Merge.
```
