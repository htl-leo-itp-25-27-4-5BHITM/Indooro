# Lerntext: CI/CD im Projekt Indooro

Stand: 2026-11-27. Alle Fakten in diesem Text stammen aus dem Repository `htl-leo-itp-25-27-4-5BHITM/Indooro` (Branch `main`, Commit `9d6a0b1`) und aus GitHub (`gh pr list`, `gh run list`, `gh api`). Wo etwas nicht belegbar ist, steht es unter „Offene Punkte“.

Die Folien zu diesem Text liegen im selben Ordner:

- [`praesentation.html`](praesentation.html): alle Folien als eine HTML-Datei, im Browser öffnen (Sprechnotizen stehen im Quelltext in `<aside>`).
- [`deck/project/`](deck/project/): Quelle des Slide-Decks (`deck.json`, `deck.css`, eine Datei pro Folie unter `slides/`, Sprechnotizen jeweils im `<aside>`).
- Das Deck ist zusätzlich als claude.ai-Artifact veröffentlicht (Link im Pull Request).

---

## 1. Begriffe: CI, Continuous Delivery, Continuous Deployment

| Begriff | Bedeutung | Frage, die er beantwortet |
|---|---|---|
| **Continuous Integration (CI)** | Jede Änderung wird oft und früh in den Hauptzweig integriert. Ein Server baut und testet jede Änderung automatisch. | „Ist mein Code mit dem der anderen kompatibel und sind die Tests grün?“ |
| **Continuous Delivery** | Nach der CI entsteht automatisch ein **auslieferbares Artefakt** (bei uns: ein Docker-Image). Die Auslieferung in Produktion ist jederzeit möglich, wird aber **von einem Menschen ausgelöst**. | „Könnten wir jetzt jederzeit ausliefern?“ |
| **Continuous Deployment** | Wie Continuous Delivery, aber jede grüne Änderung geht **ohne menschlichen Schritt** automatisch in Produktion. | „Geht jede grüne Änderung sofort live?“ |

Merksatz: **CI = bauen + testen. Delivery = Paket liegt bereit. Deployment = Paket geht automatisch live.**

### Wo steht Indooro?

- **CI: ja.** Jeder Pull Request nach `main` startet Tests (Workflow `.github/workflows/ci.yaml`, Trigger `pull_request`).
- **Continuous Delivery: ja, für das Backend.** Jeder Push auf `main` baut ein Docker-Image und legt es in der GitHub Container Registry (GHCR) ab, mit dem Commit-SHA als Tag.
- **Continuous Deployment: nein.** Es gibt keinen Workflow, der in die LeoCloud deployt. Das Ausrollen passiert manuell mit `kubectl set image` nach einem Runbook. Das ist eine bewusste Entscheidung (Backup vor jedem Release, kein Rollout während einer Pilot-Sitzung im Markt).

---

## 2. Das Gesamtbild

```
Entwickler / Claude-Code-Session
        │  git push (Branch, z. B. claude/... oder fix/...)
        ▼
GitHub: Pull Request gegen main
        │  löst Workflows aus (pull_request)
        ▼
GitHub Actions: contract, backend-test, admin-ui-browser,
                pilot-showcase-browser, build-and-push (nur Build, kein Push)
        │  alles grün → Merge nach main
        ▼
GitHub Actions auf main (push): dieselben Jobs + Image-Push
        │
        ▼
GHCR: ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2:<SHA> (+ :latest)
        │  MANUELL: Backup, kubectl set image, Smoke-Check
        ▼
LeoCloud (Kubernetes, Namespace student-it220209)
        https://it220209.cloud.htl-leonding.ac.at/
```

---

## 3. Schritt für Schritt: vom Commit bis zum Deployment

### Schritt 1: Arbeit auf einem eigenen Branch

Niemand committet direkt auf `main`. Jede Änderung entsteht auf einem eigenen Branch, z. B. `fix/ci-maven-resolution`, `feat/admin-mobile-cards` oder `claude/ios-polish-b9fb39`. Größere Änderungen werden zuerst als **OpenSpec-Change** beschrieben (siehe Abschnitt 5).

### Schritt 2: Pull Request gegen `main`

Der Branch wird gepusht und ein Pull Request (PR) gegen `main` geöffnet. Das startet die Workflows mit dem Trigger `pull_request`.

Aus `.github/workflows/ci.yaml`:

```yaml
on:
  push:
    branches: [ "main", "master" ]
    paths:
      - 'backend/indooro_server/**'
      - 'admin-ui/**'
      - 'pilot-showcase/**'
      ...
  pull_request: # Contract-Job läuft auf jedem PR, auch bei reinen Doku-PRs: deshalb kein paths-Filter
    branches: [ "main", "master" ]
```

Wichtig: Beim **Push auf `main`** läuft `ci.yaml` nur, wenn sich bestimmte Pfade ändern (Backend, Admin-UI, Showcase, API, OpenSpec …). Beim **PR** läuft er immer.

### Schritt 3: Die Jobs in `ci.yaml` (Workflow-Name „Build and Push Backend“)

| Job | Runner | Was er prüft |
|---|---|---|
| `contract` | `ubuntu-latest` | API-Vertrag `openspec/specs/shared-api/openapi.yaml`: Lint, Contract-Tests, generierte TypeScript-Typen aktuell, Mobile-Export aktuell, Parität mit dem Quarkus-OpenAPI-Export, Breaking-Change-Check mit `oasdiff` (nur PR), `openspec validate --all --strict` |
| `backend-test` | `ubuntu-latest` + Service-Container OpenSearch 2.9.0 | Admin-UI: `npm test` und Bundle bauen; Pilot-Showcase: `npm test` und Bundle bauen; Backend: `mvn -B verify` (ohne `-DskipTests`); Ops-Skripte: `python3 -I -m unittest discover scripts/ops` |
| `admin-ui-browser` | `ubuntu-24.04` | Lint, Typecheck, Playwright-Browsertests in echtem Chromium |
| `pilot-showcase-browser` | `ubuntu-24.04` | Typecheck + Build, Playwright-Tests Desktop und Mobil |
| `build-and-push` | `ubuntu-latest` | `needs: [contract, backend-test]`. Baut Admin-UI und Showcase ins Backend, baut das Runner-Jar, baut das Docker-Image. **Push nur bei `push`-Event.** |

Zitat Breaking-Change-Check:

```yaml
      - name: Breaking-change check against the target branch
        if: github.event_name == 'pull_request'
        run: |
          ...
          docker run --rm -v "$PWD":/w -w /w \
            tufin/oasdiff@sha256:6263a96d... \
            breaking .oasdiff/base-openapi.yaml openspec/specs/shared-api/openapi.yaml \
            --fail-on ERR \
            --err-ignore api/openapi/oasdiff-accepted-breaking.txt
```

Zitat Backend-Tests mit echtem OpenSearch:

```yaml
    services:
      opensearch:
        image: opensearchproject/opensearch:2.9.0
    ...
      - name: Test with Maven (tests must pass; no -DskipTests)
        working-directory: backend/indooro_server
        run: mvn -B verify
```

Warum `-DskipTests` im Job `build-and-push` erlaubt ist, steht als Kommentar direkt im Workflow:

```yaml
      # -DskipTests ist hier bewusst: backend-test hat mvn verify auf demselben Commit bereits ausgeführt
      # (needs: backend-test). Dieser Schritt erzeugt nur das *-runner.jar, das die Dockerfile kopiert.
```

Hinweis: `admin-ui-browser` und `pilot-showcase-browser` stehen **nicht** in `needs` von `build-and-push`. Ein Image kann also gebaut werden, auch wenn ein Browsertest rot ist. Der Workflow-Lauf ist dann trotzdem insgesamt rot.

### Schritt 4: Weitere Workflows (nur Tests, kein Deployment)

| Datei | Name | Trigger | Inhalt |
|---|---|---|---|
| `.github/workflows/ios.yaml` | iOS Tests | PR nach `main` oder `pilot/first-store`, nur bei Änderungen in `swift/indooro-EinkaeuferFinal/**`, API-Vertrag u. a. | `mobile-contract` (Ubuntu); `swift-tests` auf `macos-latest`: `swift test`, Simulator-Build, Release-Build **unsigniert** (`CODE_SIGNING_ALLOWED=NO`), UI-Tests gegen einen Python-Mock (`scripts/dev/mock_mobile_api.py`) |
| `.github/workflows/beacon-lab.yaml` | Positioning Lab | PR und Push, nur `tools/beacon-lab/**` | Typecheck, Vitest, Build, Playwright. Kommentar: „baut und deployt nichts“ |
| `.github/workflows/field-tools.yaml` | Field tools | Push und PR, nur `scripts/field/**` | Python-Unittests |

Die iOS-Pipeline ist also **nur CI**. Sie erzeugt kein `.ipa`, signiert nichts und lädt nichts zu TestFlight hoch.

### Wie viele Tests laufen insgesamt?

Gezählt aus den Logs grüner GitHub-Actions-Läufe (nicht geschätzt):

| Bereich | Tests | Wo im Log | Lauf |
|---|---:|---|---|
| Backend (Java, `mvn -B verify`) | 793 (4 übersprungen) | `Tests run: 793, Failures: 0, Errors: 0, Skipped: 4` | ci.yaml, Run `45697942265`, 25.11. |
| Admin-Web Unit (`node --test`) | 260 | `# tests 260` | ci.yaml, Run `45697942265` |
| Admin-Web Browser (Playwright) | 238 | `238 passed` | ci.yaml, Run `45697942265` |
| Showcase Unit (Vitest) | 166 | `Tests 166 passed` | ci.yaml, Run `45697942265` |
| Showcase Browser (Playwright, Desktop + Mobil) | 104 | `104 passed` | ci.yaml, Run `45697942265` |
| Ops-Skripte (Python `unittest`) | 203 | `Ran 203 tests` | ci.yaml, Run `45697942265` |
| API-Vertrag (`node --test`) | 16 | `# tests 16` | ci.yaml, Run `45697942265` |
| iOS (3 × `swift test`/`xcodebuild test`) | 646 (2 übersprungen) | 144 + 402 + 83 + 17 `Executed … tests` | ios.yaml, Run `45698916510`, 25.11. |
| Positioning-Lab (Vitest + Playwright) | 553 | `Tests 530 passed`, `23 passed` | beacon-lab.yaml, Run `44503535620`, 19.11. |
| Feldwerkzeuge (Python `unittest`) | 261 | `Ran 261 tests` | field-tools.yaml, Run `44528319772`, 19.11. |
| **Summe** | **3.240** | | |

- Bei **jedem PR nach `main`** läuft `ci.yaml` komplett: **1.780 Tests**.
- iOS, Positioning-Lab und Feldwerkzeuge laufen nur, wenn sich ihr Bereich ändert.
- Selbst nachzählen: `gh run view <id> --log | grep -E "Tests run:|# tests|passed|Ran [0-9]+ tests|Executed [0-9]+ tests"`.

### Wo laufen die Tests?

- **Auf GitHub**, nicht lokal und nicht in der LeoCloud. Alle Workflows nutzen GitHub-gehostete Runner (`runs-on: ubuntu-latest`, `ubuntu-24.04`, `macos-latest`), keinen eigenen Server. Jeder Lauf bekommt eine frische virtuelle Maschine.
- **Lokal** kann jede Person dieselben Befehle ausführen (z. B. `mvn -B verify`, `npm test`). Das ist freiwillig; verbindlich ist nur der Lauf auf GitHub.
- **Ausnahme:** Die Swift-Schritte der Feldwerkzeuge laufen laut `field-tools.yaml` nur lokal auf einem Mac mit Xcode; in der CI ersetzt sie ein Platzhalter.
- **Kosten:** Das Repo ist öffentlich. Die GitHub-API meldet für unsere Läufe `billable … total_ms: 0` (z. B. `gh api repos/htl-leo-itp-25-27-4-5BHITM/Indooro/actions/runs/45698916510/timing`), auch für macOS. Die Nutzungsseite der Organisation zeigt trotzdem Minuten und einen Bruttobetrag an.

### Schritt 5: Review und Merge

- Der PR wird gemergt, wenn die Checks grün sind.
- **Fakt aus GitHub:** `main` hat **keinen Branch-Schutz** (`gh api .../branches/main/protection` → „Branch not protected“) und **keine Rulesets** (`.../rulesets` → 0). Grüne Checks sind also **Teamregel, nicht technisch erzwungen**.
- **Fakt aus GitHub:** Von allen 133 gemergten PRs hat **keiner** ein formales GitHub-Review (`reviews` leer). Review passiert in der Praxis in der Claude-Code-Session (Orchestrator prüft den Diff der Sub-Session) und durch den Menschen, der den Merge auslöst, aber nicht als GitHub-Review.

### Schritt 6: Push auf `main` → Image in die Registry

Nach dem Merge läuft `ci.yaml` erneut mit dem Event `push`. Jetzt werden die Push-Schritte aktiv:

```yaml
env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}-backend-v2
...
      - name: Log in to the Container registry
        if: github.event_name == 'push'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata (tags, labels) for Docker
        ...
          tags: |
            type=sha,prefix=,format=short
            type=raw,value=latest

      - name: Build and push Docker image
        if: github.event_name == 'push'
        uses: docker/build-push-action@v5
        with:
          context: backend/indooro_server
          file: backend/indooro_server/src/main/docker/Dockerfile
          push: true
```

- Einziges Secret in allen Workflows: `secrets.GITHUB_TOKEN` (automatisch von GitHub, kein manuell angelegtes Secret).
- Ergebnis: `ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2:<7-stelliger SHA>` und `:latest`.

Das Image selbst (`backend/indooro_server/src/main/docker/Dockerfile`) ist einfach: JRE 21, Nicht-root-Benutzer mit UID 10001, das Quarkus-Uber-Jar wird kopiert und gestartet.

```dockerfile
FROM eclipse-temurin:21-jre
...
COPY --chown=10001:10001 target/*-runner.jar ./app.jar
USER 10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

Wichtig: **Ein Image enthält alles Web**: Backend-API, neues Admin-UI (`/admin/next/`) und Pilot-Showcase (`/showcase/`). Admin-UI und Showcase werden im Job ins Verzeichnis `META-INF/resources/` des Backends gebaut. Es gibt keinen eigenen Web-Container.

### Schritt 7: Deployment in die LeoCloud (manuell)

LeoCloud ist der Kubernetes-Cluster der HTL Leonding. Fakten aus `DEPLOYMENT.md` und `docs/pilot-readiness/operations/RELEASE_RUNBOOK.md`:

- Kubernetes-Context `leocloud`, Namespace `student-it220209`
- Host `it220209.cloud.htl-leonding.ac.at`, Ingress mit `ingressClassName: nginx` (`k8s/backend-ingress.yaml`)
- Manifeste in `k8s/`: `backend.yaml`, `postgres.yaml`, `opensearch.yaml`, `keycloak.yaml`, `backend-ingress.yaml`, `network-policy.yaml`, `secrets.example.yaml` (nur Beispiel, keine echten Werte)
- Der Cluster **zieht** das Image aus GHCR (`k8s/backend.yaml`: `image: ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2:308cd08`). GitHub schiebt nichts aktiv in die LeoCloud.

Ablauf laut Runbook (gekürzt):

1. PR ist in `main` gemergt, CI auf `main` grün, Image-Tag existiert (`docker manifest inspect`).
2. Backup: `python3 scripts/ops/backup_postgres.py --namespace $NS`
3. Rollback-Punkt notieren (aktuelles Image und Digest).
4. Neues Image setzen:
   ```bash
   kubectl -n $NS set image deployment/indooro-backend indooro-backend=$IMG:<tag>
   ```
5. `kubectl -n $NS rollout status deployment/indooro-backend --timeout=300s`
6. Smoke-Check: `python3 scripts/ops/pilot_smoke.py $BASE <storeId> milch`
7. Bei Fehler: Logs sichern, Rollback mit `kubectl set image` auf den alten Tag.
8. Protokoll in `docs/pilot-readiness/operations/RELEASES.md` bzw. `docs/pilot-readiness/releases/`.

Grundregel aus dem Runbook: „Deployt wird nur ein **fester Image-Tag** (7-stelliger Commit-SHA, z. B. `a47c5e6`), nie `:latest`.“

Belegte Releases (Ordner `docs/pilot-readiness/releases/`): 2026-10-17, 2026-10-18, 2026-11-04, 2026-11-18 und 2026-11-18 (Showcase). Beispiel 2026-11-18 (2): Image `:308cd08` (Merge von PR #219), vorher `:27e1255`, Backup vorher, Pod `1/1 Running`.

### Schritt 8: Was sonst noch ausgeliefert wird

- **Website `www.indooro.at`**: GitHub Pages, Quelle Branch `website`, Ordner `/docs` (`gh api .../pages`, Build-Typ „legacy“). Kein eigener Workflow im Repo.
- **iOS-App**: nur gebaut und getestet in CI, nicht verteilt (siehe Offene Punkte).
- **Android**: Der Ordner `android/` enthält nur Planungsdokumente (`README.md`, `ARCHITECTURE.md`, …), keinen Code und keinen Workflow.
- **Keycloak, Postgres, OpenSearch**: fertige Images aus öffentlichen Registries (`quay.io/keycloak/keycloak:26.0.8`, `postgres:16-alpine`, `opensearchproject/opensearch:2.9.0`), werden nicht von uns gebaut.

---

## 4. Live-Beispiel: PR #241 (Maven 429)

Gut zum Zeigen, weil man rot → grün sieht.

1. Am 2026-11-25 um 11:30 schlägt der `push`-Lauf auf `main` fehl (Run `45605070970`): `build-and-push` = failure, `pilot-showcase-browser` = failure, die übrigen Jobs grün.
2. Ursache laut PR-Text: Maven Central antwortet dem GitHub-Runner mit HTTP 429 (Too Many Requests).
3. Fix auf Branch `fix/ci-maven-resolution`, 4 Commits, z. B. `ci: retry Maven Central 429 in build-and-push`.
4. PR [#241](https://github.com/htl-leo-itp-25-27-4-5BHITM/Indooro/pull/241): alle 5 Checks grün (`contract`, `backend-test`, `admin-ui-browser`, `pilot-showcase-browser`, `build-and-push`). PR-Text endet mit „Generated with Claude Code“.
5. Ergebnis im Workflow: Der Paket-Schritt wiederholt jetzt bis zu dreimal:
   ```bash
   for attempt in 1 2 3; do
     if mvn $MVN_OPTS -U package -DskipTests; then exit 0; fi
     echo "::warning::mvn package attempt $attempt failed, retrying"
     sleep $((attempt * 30))
   done
   ```
6. Ein späterer grüner `push`-Lauf auf `main` (Run `45697942265`, Commit `8238b4c`): `contract` 20:45–20:46, `admin-ui-browser` 20:45–20:47, `backend-test` und `pilot-showcase-browser` 20:45–20:49, dann `build-and-push` 20:49–20:50. Gesamt ca. 5 Minuten bis zum Image.

Zum Live-Zeigen:

```bash
gh run list --limit 10
gh pr view 241 --web
```

---

## 5. Rolle von Claude Code

Claude Code ist bei uns kein Teil der GitHub-Actions-Pipeline. Es ist ein Werkzeug **vor** der Pipeline, das Code schreibt, und manchmal **nach** der Pipeline, das auf Eriks Auftrag deployt.

### Wie eine Änderung mit Claude Code entsteht

1. **OpenSpec-Change** in `openspec/changes/<name>/` mit `proposal.md` (Warum, Was), `design.md`, `tasks.md` (abhakbare Aufgaben) und `specs/` (Spec-Deltas). Beispiel: `openspec/changes/archive/2026-11-25-polish-platform-consistency/`.
2. Eine **Orchestrator-Session** teilt die Arbeit in Pakete und startet **Sub-Sessions**. Jede Sub-Session arbeitet in einem eigenen **git worktree** (z. B. `.claude/worktrees/<name>`) auf einem eigenen Branch.
3. Die Sub-Session macht viele kleine Commits und öffnet einen PR gegen `main`.
4. Die **CI prüft den PR genauso wie bei Menschen**. Ein Agent kann keine roten Checks „wegreden“.
5. Der Orchestrator prüft den Diff, der PR wird gemergt, das Change wird mit `openspec archive` archiviert (z. B. PR #244 „archive polish-platform-consistency“).
6. Die CI validiert die Specs selbst: `npx -y @fission-ai/openspec@1.3.1 validate --all --strict` im Job `contract`.

### Belege aus Git und GitHub

- 214 Commits auf `main` tragen die Zeile `Co-Authored-By: Claude` (von 828 Commits insgesamt).
- 125 von allen 133 gemergten PRs enthalten „Claude Code“ im PR-Text.
- 14 dieser PRs kommen von Branches mit Präfix `claude/` (z. B. PR #235 `claude/ios-polish-b9fb39`, 37 Commits, Checks `contract`, `mobile-contract`, `backend-test`, `swift-tests`, `build-and-push` grün). Die übrigen Agent-PRs nutzen Präfixe wie `feat/`, `fix/`, `ci/`.
- 37 archivierte OpenSpec-Changes in `openspec/changes/archive/`, 22 offene in `openspec/changes/`.
- Die Release-Protokolle 2026-11-18 sagen: „Ausgeführt von Claude Code im Auftrag von Erik („Merge and deploy“)“. Das Deployment läuft also mit Eriks LeoCloud-Zugang und auf seine ausdrückliche Anweisung, nicht automatisch.

---

## 6. Was gut läuft, was fehlt

### Gut

- Über 3.200 automatische Tests, davon 1.780 bei jedem PR nach `main`.
- Breite automatische Prüfung bei jedem PR: Vertrag, Backend mit echtem OpenSearch, zwei Browser-Suiten, iOS auf macOS.
- API-Vertrag als zentrale Quelle; Breaking Changes werden automatisch erkannt.
- Reproduzierbare Images mit Commit-SHA-Tag, nie `:latest` im Cluster.
- Rollout und Rollback sind dokumentiert, mit Backup und Smoke-Check; jedes Release ist protokolliert.
- Claude-Code-Arbeit geht durch dieselben Checks wie menschliche Arbeit.

### Fehlt / Schwächen

- Kein Continuous Deployment: LeoCloud-Rollout manuell, braucht Eriks Zugang.
- `main` nicht geschützt: grüne Checks und Reviews sind nicht erzwungen.
- Keine formalen GitHub-Reviews auf den PRs.
- Browsertests blockieren den Image-Build nicht (`needs` enthält nur `contract` und `backend-test`).
- `:latest` wird weiterhin mit gepusht, obwohl nicht verwendet.
- iOS: keine Signierung, kein TestFlight-Upload in CI. Android: kein Code, keine Pipeline.
- Wiederkehrende CI-Instabilität durch externe Dienste (Maven Central 429, Playwright/Chromium auf `ubuntu-latest` = 26.04, deshalb gepinnt auf `ubuntu-24.04`).
- `backend/indooro_server/build.sh` pusht laut `DEPLOYMENT.md` noch das alte Image `indooro-backend:latest` (ohne `-v2`).
- Website-Deployment über den Branch `website` ist nicht Teil der dokumentierten Pipeline.

---

## 7. Offene Punkte (nicht aus dem Repo belegbar)

- Welches Image **gerade** live läuft, steht nur im Cluster. Im Repo zeigt `k8s/backend.yaml` auf `:308cd08`; das letzte Release-Protokoll (2026-11-18) nennt ebenfalls `:308cd08`. Spätere Rollouts sind nicht dokumentiert. Prüfen mit `kubectl -n student-it220209 get deployment indooro-backend -o jsonpath='{..image}'`.
- `RELEASES.md` enthält nur die Rollouts vom 17. und 18.10.; die späteren stehen nur als einzelne Dateien in `docs/pilot-readiness/releases/`.
- Ob das GHCR-Paket öffentlich ist, ist im Repo nicht belegt (`k8s/backend.yaml` hat einen auskommentierten Hinweis auf `imagePullSecrets`).
- Wie iOS-Builds auf echte Geräte kommen (Xcode lokal, TestFlight?), ist in den Workflows nicht beschrieben.
- Wer im Team neben Erik LeoCloud-Zugang hat, ist nicht dokumentiert. Das Runbook sagt: „Die Befehle führt die Person mit LeoCloud-Zugang aus (Erik).“

---

## 8. So präsentieren wir das (Sprechnotizen, ca. 9 Minuten)

1. **Titel (15 s):** „Wir zeigen, wie Code bei Indooro von einem Commit bis in die LeoCloud kommt.“
2. **Begriffe (1 min):** CI = bauen und testen bei jedem PR. Delivery = fertiges Paket liegt bereit. Deployment = geht automatisch live. Bild: Paket gepackt vs. Paket automatisch zugestellt.
3. **Wo stehen wir (30 s):** CI ja, Continuous Delivery ja (Image in GHCR), Continuous Deployment nein, bewusst.
4. **Wörter (30 s):** Branch, Pull Request, GitHub Actions, Docker-Image, GHCR, LeoCloud je in einem Satz erklären (eigene Folie). Nicht überspringen, wenn das Publikum nicht aus der Informatik kommt.
5. **Pipeline-Diagramm (1 min):** Branch → PR → Actions → GHCR → manueller Rollout → LeoCloud. Betonen: LeoCloud zieht das Image, GitHub schiebt nicht.
6. **Was geprüft wird (1 min):** pro Job die Frage nennen, die er beantwortet („Funktioniert der Server?“), nicht den Job-Namen.
7. **Tests (30 s):** 3.240 automatische Tests, 1.780 davon bei jedem PR. Kurz auf den längsten Balken zeigen (Backend, 793).
8. **Image und LeoCloud (1 min):** ein Image für Backend + Admin + Showcase; fester SHA-Tag; Runbook mit Backup, `kubectl set image`, Smoke-Check, Rollback.
9. **Claude Code (1 min):** OpenSpec → Sessions in Worktrees → PR → gleiche CI. Zahlen: 214 Co-Authored-Commits, 125 von 133 PRs.
10. **Live-Beispiel (1,5 min):** PR #241 im Browser öffnen, roten Lauf vom 25.11. zeigen, dann grüne Checks.
11. **Gut / fehlt (1 min):** drei Punkte gut, drei Punkte fehlt. Ehrlich bleiben: kein Branch-Schutz, kein CD, iOS nur Test.

Tipps: Diagramm-Folie zweimal zeigen (am Anfang und vor dem Live-Beispiel). Vorher `gh auth status` prüfen und den PR-Tab offen haben, falls das WLAN langsam ist.

---

## 9. Mögliche Prüfungsfragen mit Antworten

**1. Was ist der Unterschied zwischen Continuous Delivery und Continuous Deployment?**
Bei Delivery liegt nach jeder grünen Änderung ein auslieferbares Artefakt bereit, ein Mensch löst die Auslieferung aus. Bei Deployment geht jede grüne Änderung automatisch in Produktion.

**2. Welche Stufe erreicht Indooro?**
CI und Continuous Delivery für das Backend. Kein Continuous Deployment: der Rollout in die LeoCloud ist manuell mit `kubectl set image`.

**3. Warum deployt ihr nicht automatisch?**
Laut Runbook: Vor jedem Rollout ein Backup, kein Rollout während einer Pilot-Sitzung im Markt, Smoke-Check danach. Außerdem hat nur Erik LeoCloud-Zugang; im Repo gibt es keine Cluster-Credentials als Secret.

**4. Was löst die Pipeline aus?**
`pull_request` nach `main` (immer) und `push` auf `main` (nur bei Änderungen in bestimmten Pfaden). iOS-, Beacon-Lab- und Field-Tools-Workflows haben eigene Pfadfilter.

**5. Wo liegt das Docker-Image und wie heißt es?**
In der GitHub Container Registry: `ghcr.io/htl-leo-itp-25-27-4-5bhitm/indooro-backend-v2`, Tag = 7-stelliger Commit-SHA (zusätzlich `latest`).

**6. Warum ein SHA-Tag statt `latest`?**
Ein SHA-Tag zeigt eindeutig auf einen Commit. Man weiß, was läuft, und kann gezielt auf den alten Tag zurückrollen. `latest` ändert sich bei jedem Push.

**7. Wie kommt das Image in die LeoCloud?**
Das Kubernetes-Deployment `indooro-backend` im Namespace `student-it220209` bekommt per `kubectl set image` den neuen Tag. Kubernetes zieht das Image dann aus GHCR.

**8. Warum läuft `build-and-push` mit `-DskipTests`?**
Weil `build-and-push` per `needs` auf `backend-test` wartet, und dort lief `mvn -B verify` auf demselben Commit schon. Tests laufen nicht doppelt.

**9. Was macht der Job `contract`?**
Er prüft den API-Vertrag (`openspec/specs/shared-api/openapi.yaml`): Lint, Tests, generierte Typen aktuell, Parität mit dem Quarkus-Export, Breaking Changes mit `oasdiff`, OpenSpec-Validierung.

**10. Welche Secrets nutzt die Pipeline?**
Nur `secrets.GITHUB_TOKEN`, das GitHub automatisch bereitstellt, für den Login bei GHCR. App-Secrets (Datenbank, Keycloak) liegen als Kubernetes-Secrets im Cluster, im Repo gibt es nur `k8s/secrets.example.yaml`.

**11. Was passiert, wenn ein Deployment schiefgeht?**
Logs sichern (`kubectl logs --previous`, `describe pod`), dann `kubectl set image` auf den vorher notierten Tag, Smoke-Check, Revert-Commit für `k8s/backend.yaml`. Bei neuer Flyway-Migration eventuell Datenbank-Restore aus dem Backup.

**12. Welche Rolle spielt Claude Code?**
Claude Code schreibt Code in eigenen Sessions, jede in einem git worktree auf einem eigenen Branch, und öffnet PRs. Diese PRs durchlaufen dieselben Checks. Deployt wird nur auf ausdrücklichen Auftrag mit Eriks Zugang.

**13. Was ist OpenSpec?**
Ein Format für Änderungsvorschläge im Repo (`openspec/changes/<name>/` mit `proposal.md`, `design.md`, `tasks.md`, Spec-Deltas). Nach dem Umsetzen wird der Change archiviert und die Specs unter `openspec/specs/` werden aktualisiert. Die CI validiert das mit `openspec validate --all --strict`.

**14. Wird die iOS-App automatisch ausgeliefert?**
Nein. `ios.yaml` baut und testet nur (Simulator-Build, unsignierter Release-Build, Unit- und UI-Tests). Keine Signierung, kein TestFlight.

**15. Was würdet ihr als Nächstes verbessern?**
Branch-Schutz auf `main` mit Pflicht-Checks; Browsertests in `needs` von `build-and-push`; einen Deploy-Workflow mit manueller Freigabe (GitHub Environment) prüfen, falls die LeoCloud einen Zugang für CI erlaubt; `:latest` nicht mehr pushen.

**16. Was ist ein Service-Container in GitHub Actions?**
Ein zusätzlicher Docker-Container, der neben dem Job läuft. Bei uns startet `backend-test` OpenSearch 2.9.0 als Service, damit der Integrationstest gegen einen echten Suchdienst läuft.

**17. Wie viele Tests habt ihr?**
In den letzten grünen Läufen 3.240 automatische Tests. Bei jedem Pull Request nach `main` laufen davon 1.780 (Workflow `ci.yaml`); der größte Teil sind 793 Java-Tests im Backend. iOS (646), Positioning-Lab (553) und Feldwerkzeuge (261) laufen nur bei Änderungen in ihrem Bereich.
