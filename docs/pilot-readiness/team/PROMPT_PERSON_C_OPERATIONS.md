# Person C – Daten, Betrieb, Sicherheit & Pilot-Kit

## Deine Aufgabe in einem Satz

Du sorgst dafür, dass ein echter Markt schnell und prüfbar erfasst werden kann (Konventionen, CSV-Import mit Validierung), dass das Backend nicht offen beschreibbar ist und wiederhergestellt werden kann (Secrets, OpenSearch, Backup), und dass alle Papiere für den Pilot da sind (One-Pager, Einwilligung, Fragebogen, Vereinbarung, Checklisten).

- OpenSpec-Change: `openspec/changes/prepare-pilot-store-operations/`
- Zusätzlich: `harden-platform-security-baseline` 5.1, 5.2, 5.5, 8.2; Phase 2: `protect-legacy-write-endpoints` komplett, `fix-ios-contract-and-spec-drift` 2.x
- Branches: `pilot/store-operations` (Phase 1, jetzt) und `pilot/backend-hardening` (Phase 2, **erst wenn der Admin-Neubau in `main` gemergt ist**)
- Menschliche Aufgaben: Kontaktliste der Märkte (außerhalb des Repos), Kit drucken, mit Erik zu Gesprächen, Abstimmung mit Betreuung. LeoCloud-Befehle führt die Person mit Cluster-Zugang (Erik) aus.

## Vorbereitung (einmalig)

```bash
cd ~/Documents/htl
git clone git@github.com:htl-leo-itp-25-27-4-5BHITM/Indooro.git   # nur falls noch nicht vorhanden
cd Indooro
git fetch origin
git worktree add --track -b pilot/store-operations ../Indooro-ops origin/pilot/store-operations
cd ../Indooro-ops
```

Voraussetzungen: Python 3, Node.js, Docker (für lokale Restore-Probe), Java 17+ und Maven-Wrapper (Phase 2).

Codex starten:

```bash
codex -m <stärkstes-codex-modell> -c model_reasoning_effort="high"
```

## Prompt für deinen Codex – Phase 1 (komplett einfügen)

```text
Du arbeitest autonom im Repository Indooro (HTL-Diplomarbeit: iOS-App, Quarkus-Backend, Web-Admin für Indoor-Navigation im Supermarkt) im Worktree dieses Ordners auf Branch `pilot/store-operations`. Ziel ist der erste echte Supermarkt-Pilot.

LIES ZUERST, in dieser Reihenfolge:
1. docs/pilot-readiness/team/AGENT_RULES.md (verbindlich)
2. docs/pilot-readiness/05_PILOT_IMPLEMENTATION.md und 06_BUSINESS_OUTREACH.md (Inhalte für Kit, Checklisten, Recht)
3. openspec/config.yaml
4. openspec/changes/prepare-pilot-store-operations/ (proposal, design, specs/**, tasks.md) – dein Auftrag
5. openspec/changes/harden-platform-security-baseline/{design,tasks}.md und openspec/changes/protect-legacy-write-endpoints/{design,tasks}.md
6. DEPLOYMENT.md, k8s/*.yaml, docker-compose.yml

AUFTRAG (PHASE 1):
- Setze die Abschnitte 1–6 und 8 der tasks.md um (Skill `openspec-apply-change`). Abschnitt 7 ist Phase 2 und JETZT NICHT dran.
- VERBOTEN in Phase 1: Änderungen unter backend/**, admin-ui/**, keycloak/** (ein anderer Agent baut gerade die Admin-Plattform neu; Konflikte vermeiden).
- Secrets: Niemals echte Passwörter, Client-Secrets oder Tokens ausgeben, kopieren oder committen. Ersetze sie durch secretKeyRef bzw. ${VAR} und lege nur Beispiel-/Platzhalterdateien an. Werte aus dem Repo nicht in Dokumente übernehmen.
- Keine Befehle gegen LeoCloud ausführen (kein kubectl apply/exec, keine Rollouts). Schreibe die Befehle in die Doku (SECRET_ROTATION.md, BACKUP_RESTORE.md) und trage sie als „Human step“ für Erik in docs/pilot-readiness/team/STATUS.md ein.
- Restore-Probe lokal mit Docker ist erlaubt, aber ohne echte LeoCloud-Daten: verwende einen lokal erzeugten Testdump, solange kein echter Dump vorliegt.
- CSV-Werkzeug: nur Python-Standardbibliothek, ausführen mit `python3 -I`, Tests mit `python3 -I -m unittest discover scripts/pilot-data`.
- Pilot-Kit: Markdown-Quellen in docs/pilot-readiness/kit/, Texte aus 05 und 06 übernehmen und druckfertig machen; PDFs nur erzeugen, wenn ein lokales Werkzeug vorhanden ist (sonst als Human step eintragen). Keine echten Personennamen, Telefonnummern oder E-Mails außer Schuladresse und Platzhaltern.
- Menschliche Schritte (6.2, 6.3 Befüllen, 6.5, 4.2 LeoCloud-Dump, 5.5 Rotation) nicht simulieren: in STATUS.md eintragen und weitermachen.
- Hake erledigte Tasks ab; markiere die übernommenen Tasks in harden-platform-security-baseline (5.1, 5.2, 5.5) mit „(implemented in prepare-pilot-store-operations)“.

ARBEITSWEISE:
- Ein schreibender Agent (du). Optional bis zu 2 lesende Subagenten mit kleinerem Modell für Recherche.
- Vor Beginn `git fetch origin && git merge origin/pilot/first-store`.
- Nach jedem Abschnitt: Prüfungen (unittest, `bash -n` auf Skripte, OpenSpec-Validierung), commit mit Task-Nummer (z. B. `chore(ops): add postgres backup script (prepare-pilot-store-operations 4.1)`), git push.

FERTIG (Phase 1), WENN:
- Abschnitte 1–6 bis auf menschliche Schritte erledigt; Tests und `npx -y @fission-ai/openspec@1.3.1 validate --all --strict` grün.
- Pull Request `pilot/store-operations` → `pilot/first-store` (mit `gh pr create --base pilot/first-store`, sonst Text in docs/pilot-readiness/operations/PR.md).
- STATUS.md-Zeile „Person C“ aktualisiert; Anleitung für Erik (Backup, Rotation, Rollout) verlinkt.
- Zusammenfassung: fertig / rot / Mensch nötig.

Archiviere keine Change.
```

## Prompt für deinen Codex – Phase 2 (erst wenn Erik meldet: Admin-Neubau ist in `main`)

Vorbereitung:

```bash
cd ~/Documents/htl/Indooro
git fetch origin
git worktree add -b pilot/backend-hardening ../Indooro-backend origin/main
cd ../Indooro-backend
```

```text
Du arbeitest autonom im Repository Indooro auf Branch `pilot/backend-hardening`, abgezweigt von `origin/main` NACH dem Merge des Admin-Neubaus. Lies docs/pilot-readiness/team/AGENT_RULES.md (falls auf main noch nicht vorhanden: `git show origin/pilot/first-store:docs/pilot-readiness/team/AGENT_RULES.md`), openspec/config.yaml, openspec/changes/protect-legacy-write-endpoints/** und die Phase-2-Tasks (Abschnitt 7) in openspec/changes/prepare-pilot-store-operations/tasks.md (ebenfalls von origin/pilot/first-store lesen).

AUFTRAG:
- Prüfe zuerst: `git log origin/main --oneline | head` enthält den Merge von codex/admin-platform-rebuild. Wenn nicht: STOPP, Blocker eintragen.
- Setze protect-legacy-write-endpoints vollständig um (Skill `openspec-apply-change`), hake dort ab. Prüfe vorher, welche Teile der Admin-Neubau schon erledigt hat; nichts doppelt bauen.
- Setze fix-ios-contract-and-spec-drift 2.1–2.4 um und hake dort ab.
- CI: Backend-Tests laufen lassen statt -DskipTests (prepare-pilot-store-operations 7.4).
- Keine Deployments, keine kubectl-Befehle; Rollout und Rotation dokumentieren (Human step für Erik).
- Prüfungen: `cd backend/indooro_server && ./mvnw test`, `npm run admin:verify` falls vorhanden, `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- Pull Request `pilot/backend-hardening` → `main`. Archiviere nichts.
```

## Abnahme durch Erik

- `python3 -I -m unittest discover scripts/pilot-data` grün; Beispiel-CSV gegen Posttraße-Layout dokumentiert.
- `k8s/opensearch.yaml` ohne `NodePort`; keine Passwörter im Klartext in `k8s/`, `docker-compose.yml`, `DEPLOYMENT.md`.
- Backup-/Restore-Skripte und lokale Restore-Probe dokumentiert.
- Kit vollständig: One-Pager, Brief, Vereinbarung, Einwilligung, Fragebogen, Hinweisschild, Testprotokoll, Checkliste, Ablaufplan.
