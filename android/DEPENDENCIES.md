# Abhängigkeiten, Entscheidungen und Implementierungsfolge

Die Android-Planung ist vollständig beschrieben; folgende Gates blockieren Teile ihrer späteren **Integration/Abnahme**, nicht die Erstellung des Plans. OpenSpec-Artefaktstatus ist kein Releasebeleg. IDs A01–A12 werden in Matrix, Designs und Abnahme verwendet.

## Verantwortungszuschnitt

| ID | Change / Verantwortung | Implementierungsvoraussetzung | Früh unabhängig möglich |
| --- | --- | --- | --- |
| A01 | [android-foundation](openspec/changes/android-foundation/proposal.md): App-Shell/Architektur/Designsystem | D01 Toolchainentscheidung | Architektur, Ressourcen, Navigation mit Fakes |
| A02 | [android-api-contract](openspec/changes/android-api-contract/proposal.md): HTTP/DTO/Error-Vertrag | A01; R-SC für finale versionierte Integration | Legacy-Fixtures, Decoder, Fehler-/Race-Tests |
| A03 | [android-store-discovery](openspec/changes/android-store-discovery/proposal.md): Stores/Mapprovider/Beaconlookup | A01/A02; R-DA exakter Match; D04 Kartenprovider | Parser, Storeliste, manuelle Auswahl mit Fake |
| A04 | [android-layout-catalog](openspec/changes/android-layout-catalog/proposal.md): Layout/Cache/Search/Produktposition | A02/A03; D03 für vollständige Kategorien | Decoder, Cache, Freitext, Resolver |
| A05 | [android-indoor-positioning](openspec/changes/android-indoor-positioning/proposal.md): Funk-/Sensorpose | A03/A04; D06 Feldqualifikation | Solver-/Filterreplays ab A01 |
| A06 | [android-routing-map](openspec/changes/android-routing-map/proposal.md): Graph/2D/Stabilität | A04; Pose-Interface, Integration A05; D05 genaue Zugangsseite | Graph, Geometry/Canvas, Routenreplay mit Fakepose |
| A07 | [android-shopping-lifecycle](openspec/changes/android-shopping-lifecycle/proposal.md): Listen/Room/Session/Stop | A01/A02 früh; A04/A06 für Tourintegration | CRUD, Room, Prozessrestore |
| A08 | [android-ar-guidance](openspec/changes/android-ar-guidance/proposal.md): ARCore-Vorschau | A05/A06, AR-Gerät, D05/D06 | Transform-/Previewtests mit synthetischer Route |
| A09 | [android-recipes](openspec/changes/android-recipes/proposal.md): Rezepte/Mapping/Übernahme | A02/A03/A07 | Listen-/Detail-/Mapping-Fakes |
| A10 | [android-upsell-lifecycle](openspec/changes/android-upsell-lifecycle/proposal.md): Plan/Prompt/Handled/Retry | A02/A03/A07; R-U4/R-B/R-DA/R-SH/D08 für finale Wirkung | Coordinator/Clock-/Payloadtests |
| A11 | [android-list-transfer](openspec/changes/android-list-transfer/proposal.md): v1 SAF/Sharing/Import | A02/A07 | Golden-v1-Codec und Parser-Sicherheitsfälle |
| A12 | [android-quality-release](openspec/changes/android-quality-release/proposal.md): Querschnitt und Freigabe | Beginnt A01; Abschluss alle A02–A11 plus Gates | Rechteplan, CI-Fakes, Accessibility ab erstem Screen |

## Abhängigkeitsgraph (gerichtete Kanten, keine Parallelagenten erforderlich)

```text
A01 ──> A02 ──> A03 ──> A04 ──> A05 ──> A08 ─────────────┐
 │        │       │       └────> A06 ──> A07 ──> A10 ─────┤
 │        │       │                 │      ├──> A09 ─────┤
 │        │       │                 └─> A08├──> A11 ─────┤
 │        └───────┴───────────────────────> A09/A10       │
 └─> A07 Domain/Room früh                                 ├─> A12 Abschluss
 └─> A12 Rechte/CI/Accessibility früh ─────────────────────┘
A05 -> A06 Liveintegration (reiner Graph benötigt nur Pose-Interface)

R-SC -> A02 finale API; R-DA -> A03 exakte Detektion
D03 -> A04 komplette Filialkategorien
D05/D06 -> A05/A06/A08 räumliche Feldabnahme
R-B + R-DA + D08 -> A10 wirksame Server-Dismissals
R-U4 -> A10 Pre-AI-Retry/Qualität; R-SH -> A10/A12 sichere Freigabe
D04 -> A03 finale Outdoor-Karte; D01/D02 -> A01/A12 Build/Distribution
```

**Technisch kritischer Pfad:** A01 → A02 → A03 → A04 → A06 → A07 → A10 → A12; gleichrangiger Hardwarepfad A04 → A05 → A08 → A12, mit A06→A08. Ohne Aufwandsschätzungen ist dies ein logischer Gatepfad, keine belastbare Kalenderdauer. Am wahrscheinlichsten verzögern D03/D05/D06 und R-U4/R-DA die Vollabnahme. Freitext, lokale Listen, Transfer und Rezeptanzeige müssen nicht bis dahin warten.

## Root-Abhängigkeiten – aktuelle Arbeit wird nicht als erledigt angenommen

| Gate | Root-Change / Statusbasis | Betroffene Androidfälle | Freigabebeleg / Alternative bis dahin |
| --- | --- | --- | --- |
| R-B | [fix-ios-contract-and-spec-drift](../openspec/changes/fix-ios-contract-and-spec-drift/design.md), offen | Preis/Layoutnullability, echte Koordinaten, Confidence, Rotation, HTTP; serverseitig Dismissalgrenze | Android korrigiert Clientfehler selbst anhand Soll; nur DTO-Bound benötigt Backendveröffentlichung. Test 1440/43200 gegen lokalen freigegebenen Vertrag |
| R-C | [modernize-ios-client-architecture](../openspec/changes/modernize-ios-client-architecture/design.md), offen | API-Versionkonsum, Persistenz, Performance und neue iOS-Referenztests | **Keine harte Android-Abhängigkeit** auf Swiftmodule oder Swift-v2-Persistenz. Referenzfixtures nach Merge neu vergleichen |
| R-D | [protect-legacy-write-endpoints](../openspec/changes/protect-legacy-write-endpoints/proposal.md), offen | gemeinsame Backend-Releasebereitschaft | Sicherheitsverantwortliche bestätigen Rollout; Android ruft weder Legacy-Layoutwrites noch PDF-/Indexutilities auf |
| R-SH | [harden-platform-security-baseline](../openspec/changes/harden-platform-security-baseline/proposal.md), offen | 429, verschachtelte DTO-Limits, anonyme Upsellkosten, sichere Infrastruktur | Lokale Contracttests für Limits/Retry-After; Produktionspilot erst nach Root-Freigabe. Keine Secrets oder Infrastruktur in Android ändern |
| R-SC | [establish-shared-api-contract](../openspec/changes/establish-shared-api-contract/design.md), offen | /api/v1, einheitliche Fehler, OpenAPI-Export mit android-Consumer | Review-/CI-geprüfter Export und lokaler Vertragstest, später Deploymentversion bestätigen; Legacy nur explizites Profil |
| R-DA | [optimize-backend-data-access](../openspec/changes/optimize-backend-data-access/design.md), offen | exakte Beaconidentität, wirksame/nullsichere Dismissals, ETag, bounded Lists und Latenz | Identitätsnegativtest und Dismissal-Wirkung nachweisen; ETag optional bis dahin; keine automatische ungesicherte Storeaktivierung |
| R-U4 | [stabilize-upsell-quality-and-request-lifecycle](../openspec/changes/stabilize-upsell-quality-and-request-lifecycle/design.md), offen | handled unabhängig Cache, kanonische IDs, Pre-AI-Retry, Substitute-/Variantenfilter | Android-Reducer sofort; Retry erst bei maschinenlesbarem Pre-AI-Vertrag. Kostenmehrdeutigkeit = kein Retry; Backendqualität nicht im Client nacherfinden |
| R-AD | [fix-admin-dashboard-contract-drift](../openspec/changes/fix-admin-dashboard-contract-drift/proposal.md), offen | Rezeptdatenqualität nach Adminänderung | Fixture für vollständige/fehlende Rezeptfelder; fachliche Pilotdaten nach Rootfix prüfen. Keine Android-Adminoberfläche |

R-B/R-C-Designs enthalten teils ältere Ownershiptexte zu Rate-Limits: maßgeblicher Implementierungsowner ist R-SH, wie Root-RUNBOOK und R-C-Ownershiptabelle festlegen. Ältere `mobile-upsell-suggestions` erlaubt allgemeinen Rule-Fallback; für den aktiven `/plan`-Flow ist `mobile-upsell-quality-gates` mit AI-first/leerem Fallback maßgeblich. Diese Konfliktauflösung wird nicht durch eine Backendkopie im Androidprojekt ersetzt.

## Entscheidungsregister

| ID | Vorschlag / noch festzulegender Punkt | Verantwortlichkeit und Zeitpunkt | Blockiert / konservativer Zwischenzustand |
| --- | --- | --- | --- |
| D01 | min26/target36/compile36 planen; genaue stabile AGP/Gradle/Kotlin/JDK/Compose/Nav3/Hilt/Room-Kombination und API37-Status beim Start sperren | Android-Buildowner vor A01-Build | Reproduzierbaren Build, nicht fachliche Planung |
| D02 | endgültige applicationId, Signingcustody und Distribution | Produkt-/Releaseowner vor signiertem Pilot | Signierten Release; Demo kann separate Suffix-ID nutzen |
| D03 | Vollständiges store-scoped Kategorie-/Pagingverhalten und globale Produkte; authoritative storeId verwenden | Backend/Productowner: **neuer oder erweiterter Root-Change erforderlich**; bestehender R-B allein deckt es nicht | Vollständige Kategorieparität; interim globale limitierte Vorschau, keine falsche Storeverfügbarkeit |
| D04 | Google Maps empfohlen; Kosten/Keys/Privacy/No-Play-Services oder MapLibre+lizenzierte Tiles | Produkt-/Androidowner vor Providerintegration | Echte Outdoor-Kartenparität; manuelle Filialliste läuft |
| D05 | accessAngle-Nullpunkt/Drehsinn, Layout-Nordrotation, Walkability und genaue Regalzugangsseite | Layout-/Backendowner; Root-Roadmap `define-shelf-access-side` ist **noch kein offener implementierter Change** | Exakte Regalseite/absoluter Heading; vorläufig Regalnähe und bestätigtes lokales AR-Alignment |
| D06 | Mittelklasse-Gerät, Beaconaufstellung, zulässige Fehler/Batterie-/Driftgrenzen | Test-/Produktowner vor Feldabnahme; vorgeschlagene Grenzwerte ARCHITECTURE | Trusted-Pose-/AR-Produktfreigabe; keine behauptete Ein-Meter-Garantie |
| D07 | automatische Backups/Device-Transfer ausschließen, expliziter Export | Android/Produktowner, vorgeschlagener Default festgelegt | Keine externe Entscheidung für erste Implementierung nötig; jede spätere Lockerung gesondert prüfen |
| D08 | Dismissal-Scope bei anonymer sessionId=null: ist store/product-weite Wirkung gewollt? | Backend/Productowner vor cross-session-Unterdrückung | Globale Serverwirkung darf nicht als persönliche Präferenz verkauft werden; lokal Nur diese Tour |
| D09 | optionales Transfer-v2 für freie Zutaten/Store/Herkunft | gemeinsamer Mobileowner als späterer Root-Vertragschange | **Kein v1-Paritätsblocker**; v1-Verlustgrenze sichtbar halten |

## Empfohlene Ausführung

1. A01, A02; A12-Permission-/CI-/A11Y-Baseline gleichzeitig mit ersten Screens. D01/D02 klären; Rootgates verbindlich einplanen.
2. A03/A04; A07-Listen/Room parallel fachlich vorbereiten; D03/D04/D05 klären.
3. A05 und A06 mit deterministischen Fakes, dann A07-Tourintegration und erste reale Beaconrunde.
4. A09 und A11 auf stabiler Persistenz; Interoperabilität mit iOS früh prüfen.
5. A10 nach Root-Vertragsfixtures und A08 nach stabilem 2D-Alignment. D06 Feldprofile finalisieren.
6. A12 vollständige Matrixabnahme, signierter Testtrack, später gestaffelte Veröffentlichung nach gesondertem Implementierungsauftrag.

Keine Root-Fixes, Codeimplementierung oder Veröffentlichung sind Teil dieses Auftrags. Android-Tickets dürfen gegen lokale Fakes fortschreiten; ein blockierter Abnahmepunkt bleibt offen und wird nicht mit einem abgewandelten Demoerfolg geschlossen.
