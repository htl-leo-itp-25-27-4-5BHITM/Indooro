# Indooro – Full-Stack Audit (2026-09-17)

Plattformübergreifender Audit von Backend, Admin-Frontend, Kunden-Web, Infrastruktur/CI und iOS-App. Normative Anforderungen stehen in `openspec/specs/`; diese Dokumente erklären, belegen und priorisieren.

| Dokument | Phase | Inhalt |
| --- | --- | --- |
| [SYSTEM_MAP.md](SYSTEM_MAP.md) | 1 | Systemkontext, Komponenten, Swift-/Admin-/Backend-Architektur, Datenbank- und Indexschema, API-Überblick, Infrastruktur, CI/CD, Secrets, Versionslandschaft, Testbasis (gemessen) |
| [CODE_AUDIT.md](CODE_AUDIT.md) | 2 | 127 Befunde mit Beleg und Schweregrad: Dead Code (`DC`), Security (`SEC`), Vertragsabweichungen (`API`), Performance (`PERF`), Korrektheit (`BUG`), Code Smells (`SMELL`) |
| [MODERNIZATION_BLUEPRINT.md](MODERNIZATION_BLUEPRINT.md) | 4 | Zielbild, Swift-6-Plan, Admin-Modernisierung, Backend-Upgrades, CI/CD, Prioritätsmatrix P0/P1/P2, Kennzahlen, Architekturentscheidungen |

## Phase 3 – OpenSpec

| Artefakt | Zweck |
| --- | --- |
| `openspec/specs/admin-dashboard/` | Querschnittsvertrag der Admin-UI (Tabellen, Filter, Bulk-Aktionen, Editor-Modi) |
| `openspec/specs/swift-client/` | Plattformvertrag der iOS-App (Framework-Inventar, lokale Daten, kein Sync/Push, Concurrency-Budget) |
| `openspec/specs/backend-core/` | Backend-Struktur, Persistenz, Auth, Audit, Lebenszyklen, Pipelines |
| `openspec/specs/shared-api/` | HTTP-Vertrag inkl. [`openapi.yaml`](../../openspec/specs/shared-api/openapi.yaml) (86 Operationen, mit Code abgeglichen) |
| `openspec/changes/harden-platform-security-baseline` | Security-P0/P1 |
| `openspec/changes/fix-admin-dashboard-contract-drift` | Admin-/Kunden-Web-Vertragsfehler, Datenverlust beim Rezept-Bearbeiten |
| `openspec/changes/optimize-backend-data-access` | N+1, Transaktionsgrenzen, Indizes, Retention |
| `openspec/changes/establish-shared-api-contract` | Vertragsdurchsetzung, `/api/v1`, Codegen |

Validierung: `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`

## Messläufe dieser Sitzung

| Messung | Befehl | Ergebnis |
| --- | --- | --- |
| Backend-Tests | `mvn -o -q test` in `backend/indooro_server` | 70 Tests, 0 Fehler; JaCoCo 31,0 % Zeilen |
| iOS Strict Concurrency | `xcodebuild … build CODE_SIGNING_ALLOWED=NO SWIFT_STRICT_CONCURRENCY=complete` (Xcode 26.3) | Build erfolgreich, 120 eindeutige Diagnosen |
| Vertrag ↔ Code | Abgleich aller `@Path`/`@GET|POST|PUT|PATCH|DELETE` mit `openapi.yaml` | 86 = 86, keine Abweichung, alle `$ref` auflösbar |
| Secrets in Git-Historie | `git log --all -G` auf OpenAI-, AWS-, GitHub-Token- und Private-Key-Muster | keine Treffer |

Nicht ausgeführt: Tests gegen das Produktivsystem und Logins mit Demo-Zugangsdaten. Befunde, die davon abhängen, sind im Audit als „zu verifizieren“ markiert.
