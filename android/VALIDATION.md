# Planungsvalidierung

Stand: 2026-10-04. Referenz: `origin/main` bei `501e2f76e404f749ee5e0c6353f765c83aff189f`. Planungsbranch `codex/android-parity-plan` im isolierten Worktree. Ausschließlich neue Dateien unter android/; ursprünglicher Werbevideo-Branch und dessen vier Änderungen/Dateien blieben im abschließenden Git-Status unverändert.

## Tatsächlich ausgeführter OpenSpec-Workflow

- Repository-Vorgabe geprüft: gepinntes OpenSpec **1.3.1**; globale Installation meldet **1.11.0** und wurde nicht für maßgebliche Artefakt-/Validierungsarbeit benutzt.
- `npx -y @fission-ai/openspec@1.3.1 init android --tools none` vom isolierten Root erzeugte das verschachtelte Verzeichnis. Konfiguration anschließend gezielt unter android/openspec/config.yaml angelegt.
- Je Change aus android/: `new change`, `status --json`, `instructions proposal --json`, Proposal schreiben, anschließend `instructions specs`, Delta-Spec schreiben, `instructions design`, Design schreiben, `instructions tasks`, Tasks schreiben. Abhängigkeiten und Dateiexistenz sowie Status jeweils geprüft.
- Das Schema erlaubt Design und Specs nach Proposal gleichzeitig; die Repositoryreihenfolge **proposal → specs → design → tasks** wurde beibehalten. Alle zwölf Changes sind artefaktvollständig; **0 Implementierungstasks abgeschlossen**.

## Prüfungen und Ergebnisse

| Prüfung | Arbeitsverzeichnis | Ergebnis |
| --- | --- | --- |
| `npx -y @fission-ai/openspec@1.3.1 validate --all --strict` | android/ | **13 passed, 0 failed**: 12 Changes + 1 Planungsspec |
| gleicher Befehl | Repositoryroot | **38 passed, 0 failed**: 8 bestehende Changes + 30 Specs |
| `list --json` / `status --change … --json` | android/ | Nur Android-Changes; alle vier Artefakttypen vollständig; 0/290 Implementierungstasks |
| Markdown-Verweise | android/ rekursiv | Alle lokalen Ziele existieren; künftige Modulpfade sind ausdrücklich ungeklickter Plantext |
| Source-/Traceability-Prüfung | aktive Final-App / Androidmatrix | 52 Swiftdateien inventarisiert, 74 eindeutige P-IDs mit existierender Quelldatei/Zeilenanker und zugeordnetem A-Change; 74 offene T-P-Fälle |
| Delta-Struktur | 12 Android-Changes | 69 Requirements, 112 explizite GIVEN/WHEN/THEN-Szenarien; alle als ADDED und normativ SHALL/MUST |
| Aufgabenformat | 12 tasks.md | 290 eindeutige nummerierte `[ ]`-Tasks, keine `[x]`, keine Implementierungsbehauptung |
| Dateitypen / Scope | isolierter Worktree | Nur Markdown/YAML unter android/; kein Kotlin/Gradle-/Androidproduktionscode, Rootdateien unverändert |

Die getrennten Ergebnisse belegen das cwd-basierte verschachtelte Projekt: Root-validieren alleine umfasst **nicht** Android. Das ist kein automatisch vererbtes OpenSpec-Monorepo-Projekt. Deshalb sind zwei spätere CI-Schritte geplant. Eine Backend-OpenAPI-Kopie unter Android wurde bewusst nicht angelegt.

## Inhaltliche Nachprüfung

Korrigiert/abgesichert: exakte Java-Methodenzeilen, aktuelle Swift-v1-Feldschreibweise und ganzsekündige Exportdaten, eindeutiges Ablehnen einer veralteten Stoppaktion, begrenzte Upsell-Payloads ohne kostenpflichtige Splitrequests. Alle zwölf Designs vergleichen Alternativen und enthalten Voraussetzungen, Risiken, Abnahme, Migration/Rollback und offene Fragen. Root-Fixes/D03-Kategorievertrag/D05-Raumausrichtung sind als Gates sichtbar; kein iOS-Bug wird als Android-Soll übernommen.

## Grenzen dieser Abnahme

**Validiert wurde die Planung.** Keine Android-App, kein Swift-Build, kein laufendes Backend, keine Sensoren oder AR-Geräte wurden ausgeführt. Keine Migration, Veröffentlichung oder schreibende API-Operation fand statt. Alle Produkt-/Geräte-/Interoptests in ACCEPTANCE.md bleiben offen. Formale OpenSpec-Konformität ist kein Nachweis realer Parität oder Produktionsreife.
