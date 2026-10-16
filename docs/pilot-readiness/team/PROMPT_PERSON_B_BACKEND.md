# Person B (Windows) – Backend, Admin-Erweiterung, Betrieb

## Kurz

Du machst das Backend sicher, sicherbar und auslieferbar. Eine Change in zwei Phasen:

1. `release-pilot-backend` (Branch `pilot/release-backend`, Basis `main`)
   - **Phase A – sofort:** OpenSearch nicht mehr von außen erreichbar, Passwörter raus aus dem Repo, Backup/Restore- und Smoke-Skripte (Python), CI mit Tests und festen Image-Tags, Release-Runbook.
   - **Phase B – erst nach dem Admin-Merge in `main`:** `protect-legacy-write-endpoints` komplett, PDF-Grenzen, Upsell-Dismissal-Grenze, erster Pilot-Release (Befehle führt Erik aus).

Bis zum Admin-Merge (geplant diese Woche, Erik meldet sich): **keine** Änderungen unter `backend/`, `admin-ui/`, `keycloak/`.

Menschliche Aufgaben: Docker Desktop und Java installieren; bei der lokalen Restore-Probe zuschauen; mit Erik den ersten Release durchführen (Erik hat den LeoCloud-Zugang).

## Einmalige Vorbereitung (Windows)

Empfohlen: Codex in **WSL2 (Ubuntu)**. Dort:

```bash
sudo apt update && sudo apt install -y git python3 nodejs npm openjdk-17-jdk
git config --global core.autocrlf input
cd ~
git clone git@github.com:htl-leo-itp-25-27-4-5BHITM/Indooro.git indooro-backend
cd indooro-backend
git switch --track origin/pilot/release-backend
```

Docker Desktop unter Windows mit WSL2-Integration aktivieren (für lokale Postgres/OpenSearch). Optional `kubectl`.

Codex starten:

```bash
codex -m <stärkstes-codex-modell> -c model_reasoning_effort="high"
```

## Prompt (komplett in Codex einfügen)

```text
Du arbeitest autonom im Repository Indooro (HTL-Schulprojekt: Quarkus-3-Backend mit PostgreSQL, OpenSearch, Keycloak, React-Admin; iOS-App für Indoor-Navigation im Supermarkt). Ziel ist der erste echte Supermarkt-Pilot. Du bist der Agent von Person B (Backend & Betrieb, Windows/WSL2, kein Mac).

LIES ZUERST:
1. docs/pilot-readiness/team/AGENT_RULES.md – verbindlich
2. docs/pilot-readiness/team/ROADMAP.md, docs/pilot-readiness/01_PROJECT_AUDIT.md Abschnitt 3.3
3. openspec/config.yaml
4. DEPLOYMENT.md, docs/RUNBOOK.md, k8s/*.yaml, .github/workflows/ci.yaml
5. openspec/changes/release-pilot-backend/ (proposal, design, specs/**, tasks.md)
6. openspec/changes/harden-platform-security-baseline/{design,tasks}.md und openspec/changes/protect-legacy-write-endpoints/{design,tasks}.md

DEINE CHANGES:
A) openspec/changes/release-pilot-backend/   Branch pilot/release-backend (Basis main)
   - Phase A = tasks.md Abschnitte 1–4: SOFORT.
   - Phase B = Abschnitte 5–6: NUR wenn `git log origin/main --oneline` den Merge von codex/admin-platform-rebuild enthält. Prüfe das zu Beginn jeder Sitzung.
WELLE 2 (nach Phase A bzw. B, NUR nach dem Admin-Merge in main; Branches jeweils `git switch -c <branch> origin/main`, Change-Ordner mit `git checkout origin/pilot/first-store -- openspec/changes/<change> docs/pilot-readiness/team` übernehmen und committen):
B) openspec/changes/add-store-scoped-catalog/              Branch pilot/store-catalog
C) openspec/changes/improve-product-search-quality/        Branch pilot/search-quality
D) openspec/changes/add-admin-catalog-spreadsheet-import/  Branch pilot/catalog-import (nach B)
Falls Welle 2 noch blockiert ist und Zeit übrig bleibt: openspec/changes/prepare-pilot-evaluation/ (Branch pilot/pilot-evaluation, reines Python) – vorher in STATUS.md prüfen, dass Person C es nicht schon begonnen hat, und dich dort als Bearbeiter eintragen.

ABLAUF:
1. `git fetch origin`; auf dem Branch `git merge origin/main`.
2. Tasks der Reihe nach mit dem Skill `openspec-apply-change`; jede erledigte Task abhaken; übernommene Tasks in harden-platform-security-baseline / protect-legacy-write-endpoints / fix-ios-contract-and-spec-drift dort mit „(implemented in <change>)“ abhaken.
3. Nach jedem Abschnitt: Prüfungen (Python-Tests mit `python3 -I -m unittest discover scripts/ops`; ab Phase B `cd backend/indooro_server && sh ./mvnw test`; `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`), commit mit Task-Nummer, `git push`.
4. Am Ende jeder Phase: Skill `openspec-verify-change`, Pull Request nach main (`gh pr create --base main` falls verfügbar, sonst PR-Text in docs/pilot-readiness/operations/PR-<change>.md), STATUS.md-Zeile „Person B“ aktualisieren.

HARTE GRENZEN:
- Vor dem Admin-Merge: KEINE Änderung unter backend/**, admin-ui/**, keycloak/**.
- Niemals Passwörter, Client-Secrets oder Tokens ausgeben, kopieren oder committen. Werte aus dem Repo nie in neue Dateien übernehmen; nur secretKeyRef, ${VAR}, Platzhalter.
- Keine Befehle gegen LeoCloud: kein kubectl apply/exec/delete/rollout, keine Deployments. Befehle nur dokumentieren und als Human step für Erik in STATUS.md eintragen.
- Skripte in Python (Standardbibliothek + subprocess für kubectl/docker), lauffähig in WSL, macOS und Windows-PowerShell; keine reinen Bash-Skripte.
- Die Readiness-Dateien (`StoreReadiness*`, Admin-Seite „Pilot-Bereitschaft“) gehören Erik – nicht anfassen.
- Lokale Tests mit Docker sind erlaubt, aber nie mit echten LeoCloud-Daten im Repository.
- Wenn ./mvnw test lokale Dienste braucht, die fehlen: Ursache in design.md dokumentieren, Blocker eintragen, mit unabhängigen Tasks weitermachen.
- Ein schreibender Agent (du); optional bis zu 2 lesende Subagenten mit kleinerem Modell.

FERTIG, WENN Phase A gepusht (und, sobald der Admin-Merge da ist, Phase B und Welle 2 abgearbeitet) und als PR vorbereitet ist und – falls der Admin-Merge schon da ist – auch Phase B; sonst alle Phase-B-Tasks als „wartet auf Admin-Merge“ in STATUS.md stehen. Zusammenfassung: fertig / rot / was Erik auf LeoCloud ausführen muss. Archiviere nichts.
```

## Abnahme (Erik prüft)

- `k8s/opensearch.yaml` ohne `NodePort`; keine Klartext-Passwörter in `k8s/`, `docker-compose.yml`, `DEPLOYMENT.md`.
- `scripts/ops/*.py` mit Tests; lokale Restore-Probe dokumentiert.
- CI führt Tests aus und taggt Images mit Commit-SHA.
- Nach Admin-Merge: anonyme PDF-Endpunkte geschlossen.
