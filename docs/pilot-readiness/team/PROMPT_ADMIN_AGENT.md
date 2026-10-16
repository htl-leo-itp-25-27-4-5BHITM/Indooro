# Prompt für den laufenden Admin-Agenten („Pilot-Cut“)

Für: den Codex-Agenten, der im Worktree `~/.codex/worktrees/admin-rebuild/Indooro` an `codex/admin-platform-rebuild` arbeitet. Erik schickt ihm diesen Prompt, sobald der aktuelle Schritt fertig ist.

Warum: Der Admin-Neubau ist funktional für den Pilot ausreichend: 9 von 10 Routen umgeschaltet, neuer Editor vorhanden, Backend-Tests grün. Der Agent arbeitet seit Tagen vor allem an vollständigen Paritätsnachweisen (Tasks 1.2, 3.10, 5.4). Diese Nachweise blockieren jetzt den Merge nach `main`, und damit Backend-Härtung, Pilot-Bereitschaftsseite und Deployment.

## Prompt

```text
Neue Priorität vom Product Owner: „Pilot-Cut“ des Admin-Neubaus. Ziel ist, codex/admin-platform-rebuild in den nächsten 1–2 Arbeitstagen nach main zu mergen, damit der erste Supermarkt-Pilot vorbereitet werden kann (Kontext: auf origin/pilot/first-store unter docs/pilot-readiness/team/ROADMAP.md – lies es mit `git show origin/pilot/first-store:docs/pilot-readiness/team/ROADMAP.md`).

1. Schließe den aktuellen Arbeitsschritt ab und committe alle offenen Änderungen mit ehrlicher Nachricht. Prüfe dabei die nicht committeten Änderungen an swift/indooro-/indooroApp/Utilities/IndoorGraph.swift und Pathfinder.swift: Das ist der Legacy-App-Baum, der laut openspec/config.yaml keine Änderungen mehr bekommt. Nimm sie zurück (git restore), statt sie zu committen. Ändere ab jetzt KEINE Dateien unter swift/** mehr. Die Drehung von Regalen im iOS-Routing ist jetzt Teil der Pilot-Change add-pilot-guided-tour-fallbacks (Abschnitt 9) und wird dort von Erik umgesetzt.
2. Stoppe die Sammlung weiterer Paritätsnachweise. Für rebuild-admin-platform gilt für den Pilot:
   - Task 3.10 Editor-Route: Umschalten nur, wenn die vorhandenen Live-Probes (Speichern, Aktivieren, Import/Export, Rollen-Drafts, Fehlerzustände) grün sind. Sonst bleibt der Editor auf Legacy (Flag aus). Beide Varianten sind für den Pilot akzeptabel.
   - Tasks 1.2, 3.10 (Rest), 5.4: Halte den erreichten Stand ehrlich in tasks.md fest („teilweise belegt, siehe docs/admin-rebuild/EDITOR_EVIDENCE_GAPS.md“). Lege die offenen Nachweise als neue Change `complete-admin-parity-evidence` an (proposal + tasks, kurz). Setze sie NICHT um.
3. Prüfungen auf dem aktuellen Stand: `./mvnw test` in backend/indooro_server, die Admin-UI-Prüfungen aus admin-ui/package.json (Typecheck, Lint, Unit, Browser), Build der Admin-Ausgabe, `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`. Rot → fixen, nur innerhalb von backend/**, admin-ui/**, keycloak/**, docs/admin-rebuild/**, openspec/changes/rebuild-admin-platform/**.
4. Schreibe docs/admin-rebuild/PILOT_CUT.md: was im Pilot verwendet wird (Stores, Regionen, Beacons, Layout-Editor, Produkte, Kategorien), welcher Editor (Legacy oder neu) aktiv ist, bekannte Lücken, Rollback (Route-Flags zurücksetzen), welche Secrets/Umgebungsvariablen der Deploy braucht (nur Namen, keine Werte).
5. `git fetch origin && git merge origin/main` (sollte trivial sein), Prüfungen erneut, dann `git push origin codex/admin-platform-rebuild`.
6. Bereite den Pull Request codex/admin-platform-rebuild → main vor (`gh pr create --base main` falls verfügbar, sonst Text in docs/admin-rebuild/PR_MAIN.md). Merge NICHT selbst und deploye NICHT – das macht Erik nach einem Backup.
7. Fasse zusammen: Stand der Prüfungen, Editor-Flag, offene Lücken, PR-Link.
```

## Danach (Erik, Mensch)

1. Backup der LeoCloud-Datenbank (Skript aus `release-pilot-backend`, falls schon da; sonst `pg_dump` per `kubectl exec` manuell).
2. PR nach `main` mergen. Achtung: Ein Push auf `main` baut per CI ein neues `:latest`-Image; LeoCloud zieht es beim nächsten Neustart. Rollout bewusst und mit Smoke-Check machen.
3. Team informieren: „Admin ist in `main`“ → Person B startet Phase B; Erik mergt `main` in `pilot/first-store`.
