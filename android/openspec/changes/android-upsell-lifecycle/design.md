## Context

**A10 – Upselling ohne doppelte Kosten oder verlorene Dismissals**. Im Code verifizierte Beobachtungen: [Matrix P56–P57, P61–P64](../../../PARITY_MATRIX.md), Referenzcommit und Beleggrenzen in [DISCOVERY](../../../DISCOVERY.md). Es gibt noch keine Android-Implementierung. Dokumentationsreferenzen aus Root: mobile-upsell-suggestions, mobile-upsell-quality-gates. Nachfolgende Androidentscheidungen sind geplant; Feldqualität und deployter Backendstand sind nicht feststellbar aus diesem statischen Audit.

## Goals / Non-Goals

**Goals:** native funktionale Parität für die zugeordneten Matrixfälle; beobachtbare Fehler-/Offlinezustände und getestete Übergänge; Android-native Plattformanbindung mit erhaltenem Datenvertrag.

**Non-Goals:** Root-Backend implementieren/deployen, Kundenkonto, Kundenpositionsspeicherung, Crossplatform-Framework oder Legacy-Swift-Dateien portieren. Dieser Auftrag schreibt nur Planungsartefakte.

## Prerequisites

A02, A03, A07; R-U4 für sichere Retry-/Qualitätssemantik, R-B und R-DA für wirksame serverseitige Dismissals, R-SH für Rate-Limits.

[Abhängigkeiten/Root-Gates](../../../DEPENDENCIES.md) unterscheiden sofortige Fake-/Domainarbeit von blockierter Vertrags-/Geräteabnahme. Keine Voraussetzung gilt allein wegen eines vollständigen OpenSpec-Artefakts als erledigt.

## Decisions

Session-scoped UpsellCoordinator getrennt von ViewModels. Identität: sessionGeneration, listID, storeID, normalisierte Quelle, opportunityId, sortierte eindeutige triggerIDs. Cache Missing/Loading/LoadedEmpty/LoadedSuggestions/Handled/FailedPreAI/FailedTerminal getrennt; Handled bleibt nach Verbrauch/TTL erhalten. Room-Session persistiert handled Identitäten und Promptzähler zur Wiederaufnahme; eigentliche Suggestions nur kurzlebiger Cache. Neuer expliziter Tourstart oder bestätigter Storewechsel startet neue Generation.

Requestgrenzen vor Dispatch prüfen (aktuell 80 Opportunities/20 Trigger pro Opportunity; weitere Listen-ID-Limits nach R-SH). Überschreitung deaktiviert nur Preloading für diesen Snapshot mit inhaltsfreier Diagnose; kein stilles Abschneiden, kein Aufteilen in kostenpflichtige Folgepläne. Eine Plananfrage gleichzeitig; Fortschritt bricht sie nicht ab und erzeugt keine neue parallele. currentIDs=open unique sorted, completedIDs=done/missing/skipped minus current; gleiche Arrays für Signatur und Payload. Trigger aus addedFromUpsell ausschließen. Station-ID station:shelf-<id>, unaufgelöstes Produkt item:<UUID>. Planpreload erst nach bewusster Store-/Touraktivierung; Abhaken nimmt vorhandenen Cache, startet keinen AI-Request. Pending höchstens 30 s und nur gleiche aktuelle Opportunity.

UI maximal drei passende Vorschläge mit confidence>=0,45 und zehn Prompts pro Session. Acht-Sekunden-Cooldown im shopping_list-Fluss; station shopping_session behält iOS-Ausnahme, gleiche Station trotzdem nur einmal. LoadedEmpty/filtered-empty sind erfolgreiche terminale Zustände. Bestehende Root-Qualitätsgate-Spec ist für /plan maßgeblich: kein deterministischer Ersatz trotz älterem allgemeinem Fallback-Text.

Nur R-U4-vertraglich als candidate_lookup_failed und sicher vor AI-Verbrauch ausgewiesener Fehler erlaubt einen Retry nach 1 s, gleiche Signatur, aktuelle Session, höchstens einmal. Bei unklarer Token-/Timinglage, Timeout, AI-empty, Filter-empty oder 429 kein Retry. R-B erweitert suppressMinutes, R-DA macht gespeicherte Dismissals wirksam; bis beide nachgewiesen sind lokale Unterdrückung und ehrlicher Hinweis Nur diese Tour, keine 24h-Erfolgsbehauptung. Keine OpenAI-Schnittstelle oder Secrets im Androidclient.

Offizielle Plattformbelege: [RESEARCH S01, S03, S15](../../../RESEARCH.md). Gemeinsame Entscheidungen/Alternativen: [ARCHITECTURE](../../../ARCHITECTURE.md). Methoden, Datenformen und aktuelle Abweichungen: [API_CONTRACT](../../../API_CONTRACT.md). Eigene Android-Budgets sind Designentscheidungen, keine angeblichen Plattformgarantien.

## Alternatives considered

| Gewählt | Alternative | Abwägung |
| --- | --- | --- |
| Persistiertes Handled-Ledger getrennt von kurzlebigem Plancache | Nur Cache/TTL oder generischer Netzwerkretry | Cacheverbrauch und Wiederaufnahme dürfen keine Kosten neu auslösen; unbekannter AI-Verbrauch verhindert Retry. |

## Planned modules and files

Alle folgenden Pfade sind **geplant**, relativ zu android/. `...` steht für den bei D02 festzulegenden Kotlin-Packagepfad, nicht eine existierende Datei. Tests liegen parallel in src/test bzw. src/androidTest; Fixtures in core/testing. Es wird hier kein Produktcode erzeugt.

- `feature/upsell/.../UpsellCoordinator.kt`
- `feature/upsell/.../OpportunityIdentity.kt`
- `feature/upsell/.../UpsellReducer.kt`
- `feature/upsell/.../UpsellPromptSheet.kt`
- `core/database/.../HandledOpportunityDao.kt`
- `core/network/.../UpsellRepository.kt`

## Risks / Trade-offs

Stopp-/Listenquellen dürfen keine Doppel-Opportunity erzeugen; Quellennormalisierung für denselben Stationskontext vor Hashing definieren. Anonyme serverseitige Dismissals können global wirken: D08 muss Scope bestätigen, keine gerätebezogene Identität erfinden.

Gegenmaßnahmen sind die konkreten Negativ-/Race-/Offlinefälle in Delta-Spec und tasks.md. Bis zum Nachweis bleibt der betroffene Abnahmepunkt offen; Demo/Fake ersetzt keine reale Sensor-/Serverfreigabe.

## Acceptance criteria

- Canonical plan state prevents duplicated work: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Handled opportunities outlive cache entries: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Completion never waits for upsell: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Retry requires verified pre-AI failure: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Dismissal scope and success are truthful: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Acceptance and telemetry preserve privacy: alle zugehörigen GIVEN/WHEN/THEN-Fälle als lokale Tests bzw. Geräteprotokolle belegen.
- Zugeordnete T-P-Fälle aus [ACCEPTANCE](../../../ACCEPTANCE.md) besitzen nachvollziehbare Belege; Unit/Integration/UI und gegebenenfalls reales Gerät gemäß Matrix.
- Store-/Listen-/Lifecycle-Wechsel erzeugen keine stale Mutation; verweigerte Rechte und Offlinebetrieb erhalten lokale Daten.
- Keine offenen harten Gates des jeweiligen Produktionsumfangs. Rollback-/Migrationspfad geprüft. Kein Task darf ohne Beleg abgehakt werden.

## Migration Plan

Handled-Records sind versioniert nach Session und Policy-Version. Wiederherstellung zeigt keinen schon behandelten Prompt. Servercache-Änderungen gehören R-U4. Android-Feature abschaltbar, Listen-/Stopabschluss immer unabhängig; nicht bestätigte POSTs nicht bei Restart replayen.

Einführung später gegen lokale Fixtures, danach integriertes Testbackend, dann synthetischer Geräte-/Storepilot. Reale Veröffentlichung/Deployment ausschließlich in einem späteren Implementierungsauftrag und nach A12-Freigabe. Die Androidplanung benötigt keine laufenden Backendmutationen.

## Open Questions

D08 Dismissal-Scope ohne Kundenidentität; R-U4 maschinenlesbares retryable plus Pre-AI-Nachweis, R-B/R-DA Deploymentgates.
