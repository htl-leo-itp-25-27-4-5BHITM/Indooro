# Indooro – Spezifikationsdokumente

`openspec/specs/` ist die normative Single Source of Truth. Der plattformübergreifende Audit (Backend, Admin, Infrastruktur, Swift) vom 2026-09-17 liegt unter [docs/audit/](../audit/README.md). Die Dokumente hier erklären, visualisieren und priorisieren; bei Widersprüchen gilt OpenSpec.

| Dokument | Inhalt | Wann lesen |
| --- | --- | --- |
| [AUDIT.md](AUDIT.md) | Repository-Inventar, Swift-⇄-Backend-Vertragsabgleich, Befunde `AUD-01…38`, OpenSpec-Audit | Einstieg, Onboarding, vor jeder Planung |
| [FSD.md](FSD.md) | Personas, UI-Zustandsdiagramme, Offline-Verhalten, Feature Requirements `FR-001…108`, Sequenzdiagramme, NFRs | fachliche Fragen, Abnahme |
| [TSD.md](TSD.md) | Ist-/Soll-Architektur der iOS-App, Networking, Security, alle Datenmodelle, DB-/Index-Schemata, API-Verträge, Algorithmen | Implementierung |
| [ARCHITECTURE_BLUEPRINT.md](ARCHITECTURE_BLUEPRINT.md) | Architekturprinzipien, Zielschichten, Modulstruktur, Fitness-Functions, ADR-001…012 | Architekturentscheidungen |
| [ROADMAP.md](ROADMAP.md) | Priorisierter Masterplan P0/P1/P2 mit Abhängigkeiten und Abnahmekriterien | Sprint-Planung |

## OpenSpec-Capabilities für die iOS-App

| Capability | Thema |
| --- | --- |
| `ios-client-architecture` | Projekt-Baseline, Tab-Shell, Store-Ownership, Berechtigungen, Dokumenttyp, Bundle-Layout, Debug-Log |
| `ios-backend-integration` | Routenkatalog, Decoding, Stale-Schutz, Statusprüfung, Upsell-Payload und -Events |
| `ios-product-planning` | Tab „Planung“ |
| `ios-store-map-experience` | Tab „Karte“ |
| `ios-recipe-experience` | Tab „Rezepte“ |
| `mobile-store-detection` | Beacon-basierte Filialerkennung (Backend + iOS-Pipeline) |
| `mobile-positioning-navigation` | Ortung, Graph, Routing, Kalibrierung |
| `mobile-shopping-lists` | Listen, Tour, Teilen, Import |
| `mobile-ar-navigation` | AR-Routenvorschau |

## Offene Changes (empfohlene Reihenfolge)

| # | Change | Zweck |
| --- | --- | --- |
| 1 | `protect-legacy-write-endpoints` (D) | Backend-Schreibrouten absichern, Index-Fehler 409 |
| 2 | `fix-ios-contract-and-spec-drift` (B) | Vertragsfehler und Spec-Drift im iOS-Client beheben |
| 3 | `harden-platform-security-baseline` | Keycloak-Prod, XSS/CSP, Netzwerk, Rate Limiting, PDF-Grenzen |
| 4 | `fix-admin-dashboard-contract-drift` | Admin-UI an Backend-Vertrag angleichen |
| 5 | `establish-shared-api-contract` | OpenAPI-Vertrag, `/api/v1`, Contract-Tests |
| 6 | `optimize-backend-data-access` | Datenzugriff im Backend optimieren |
| 7 | `modernize-ios-client-architecture` (C) | Swift 6, Observation, Module, APIClient, Tests, CI |
| 8 | `stabilize-upsell-quality-and-request-lifecycle` | Upsell-Qualität und Anfrage-Lebenszyklus |

Alle abgeschlossenen Changes liegen unter `openspec/changes/archive/`.

Validierung: `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`
