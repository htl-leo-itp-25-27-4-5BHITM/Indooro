# Indooro Android – vollständige native Paritätsplanung

Stand: 2026-10-04. **Nur Planung; keine Android-App implementiert.** Referenz ist frisch abgeholtes `origin/main` bei `501e2f76e404f749ee5e0c6353f765c83aff189f`. Die aktive App liegt ausschließlich in [swift/indooro-EinkaeuferFinal](../swift/indooro-EinkaeuferFinal/). Legacy-Verzeichnisse sind keine Implementierungsvorlage.

Der ursprüngliche Checkout stand auf `codex/indooro-v2-roughcut` mit bestehenden Änderungen an einem Videoskript und drei ungetrackten Dokument-/Archivdateien. Er wurde weder gewechselt noch bereinigt. Diese Planung liegt im separaten Worktree `android-parity-plan`, Branch `codex/android-parity-plan`, auf dem aktuellen Remote-main; lokaler main war älter. Keine laufenden APIs aufgerufen, keine Migrationen, Deployments oder Produktcodeänderungen.

## Lesereihenfolge

1. [Bestandsaufnahme und Beleggrenzen](DISCOVERY.md), [Swift→Android-Matrix](PARITY_MATRIX.md) und [Dateiinventar](SOURCE_INVENTORY.md).
2. [Architekturentscheidungen](ARCHITECTURE.md), [offizielle Plattformrecherche](RESEARCH.md) und [API-Vertragszuordnung](API_CONTRACT.md).
3. [Abhängigkeiten, offene Entscheidungen und Reihenfolge](DEPENDENCIES.md).
4. [Changes](openspec/changes/): jeweils proposal → Delta-Specs → design → tasks.
5. [Gesamtabnahme](ACCEPTANCE.md) und [tatsächliche Planungsvalidierung](VALIDATION.md).

## Eigenständiges OpenSpec-Projekt

`android/openspec/config.yaml` ist die Android-Konfiguration. OpenSpec 1.3.1 wurde mit `init android --tools none` gestartet; anschließend aus `android/` bedient. Global installiertes 1.11.0 wurde nicht für die maßgebliche Validierung benutzt. Root-Kontext/Regeln werden nicht automatisch vererbt: die Android-Konfiguration referenziert gemeinsame Verträge ausdrücklich. Root-Validierung entdeckt verschachtelte Android-Changes nicht automatisch.

```sh
cd android
npx -y @fission-ai/openspec@1.3.1 list
npx -y @fission-ai/openspec@1.3.1 status --change android-foundation
npx -y @fission-ai/openspec@1.3.1 validate --all --strict
```

Danach Root separat validieren (`cd ..`, gleicher validate-Befehl). Die permanente Spec [android-planning-governance](openspec/specs/android-planning-governance/spec.md) beschreibt nur Planungsregeln. Alle zukünftigen Produktanforderungen stehen in ADDED-Delta-Specs der zwölf Changes; sie werden erst nach Implementierung und Abnahme archiviert/synchronisiert. Vollständige Artefakte bedeuten **nicht** fertige Features. Alle Implementierungstasks bleiben `[ ]`.

Geteilte Backend-Autorität bleibt [Root shared-api](../openspec/specs/shared-api/spec.md) mit [OpenAPI](../openspec/specs/shared-api/openapi.yaml). Android definiert Consumer-Verhalten, keine konkurrierende Backend-Spezifikation.
