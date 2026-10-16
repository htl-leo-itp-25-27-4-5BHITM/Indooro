# Admin-Agent – Welle 2 (nach dem Merge von PR #105)

Für den Codex-Agenten, der den Admin-Neubau gebaut hat. PR #105 ist gemergt und ausgerollt (2026-10-16) – kann jetzt geschickt werden.

```text
Der Admin-Neubau ist in main gemergt und auf LeoCloud ausgerollt. Neue Aufgaben, in dieser Reihenfolge. Lies zuerst `git show origin/pilot/first-store:docs/pilot-readiness/team/AGENT_RULES.md` und `git show origin/pilot/first-store:docs/pilot-readiness/team/ROADMAP.md`.

A) openspec/changes/complete-admin-parity-evidence/ (liegt auf main)
   - Branch `git switch --track origin/pilot/admin-parity` (existiert, Basis main + Planung), dann `git merge origin/main`.
   - Ziel: Der neue Layout-Editor wird Standard (Route-Flag `editor: true`). Arbeite die offenen Nachweise priorisiert ab (P0 zuerst laut docs/admin-rebuild/EDITOR_EVIDENCE_GAPS.md). Zeitbox: maximal 3 Arbeitssitzungen. Wenn danach noch P0-Lücken offen sind: Editor bleibt Legacy, Lücken ehrlich dokumentieren, weiter mit B.
   - Prüfungen grün (sh ./mvnw test, Admin-UI-Checks, OpenSpec strict), PR nach main, nicht selbst mergen.

B) openspec/changes/add-editor-floorplan-underlay/ (liegt auf origin/pilot/first-store)
   - Branch `git switch --track origin/pilot/editor-underlay` (existiert, Basis main + Planung), dann `git merge origin/main`.
   - Tasks der Reihe nach mit openspec-apply-change; Flyway-Migration mit der nächsten freien Nummer; keine Secrets; PR nach main.

GRENZEN: keine Änderungen unter swift/**, k8s/**, scripts/**; Produktsuche und Katalog (OpenSearchService, ProductResource, AdminProductResource, Katalog-Import) gehören Person B; customer/** gehört Person C. Kein Merge, kein Deployment. STATUS.md auf origin/pilot/first-store wird von Erik gepflegt – melde Ergebnisse in deiner Abschlusszusammenfassung.
```
