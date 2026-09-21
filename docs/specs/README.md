# Indooro – Spezifikationsdokumente

**Einstieg und nächste Schritte:** [docs/RUNBOOK.md](../RUNBOOK.md)

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

## Offene Changes

Reihenfolge, Sofortmaßnahmen und Abnahmekriterien stehen im [Runbook](../RUNBOOK.md#2-nächste-schritte-in-dieser-reihenfolge).

Alle abgeschlossenen Changes liegen unter `openspec/changes/archive/`.

Validierung: `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`
