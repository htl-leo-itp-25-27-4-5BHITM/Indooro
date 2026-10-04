# Android-Architektur und bewusste Abweichungen

Alle folgenden Festlegungen sind **geplantes Android-Verhalten (Annahme/Entscheidung)**. Plattformfakten sind in [RESEARCH](RESEARCH.md) belegt; jede fachliche Änderung besitzt eine Delta-Spec. Backendverträge bleiben im Root.

| Entscheidung | Gewählt und Begründung | Verglichene Alternative / Konsequenz | Owner |
| --- | --- | --- | --- |
| Laufzeit/UI | Kotlin, Single Activity, Compose Material 3, deutsche Ressourcen, adaptive Navigation, Light/Dark | XML erzeugt zusätzliche Stateadapter; Crossplattform widerspricht nativem Auftrag; Swift-Pixelmaße keine Android-dp-Vorgabe | A01 |
| Navigation | Navigation 3, typisierte IDs, Backstack pro Tab, Sheet vor Seite schließen | Navigation Compose 2 wäre nutzbar, aber neuer Compose-Start folgt aktuellem empfohlenem Ansatz; D01 muss stabile Restore-Integration bestätigen | A01 |
| State | immutable StateFlow, UDF, screen-scoped ViewModels; Repositories als Datenautorität | globaler Swift-artiger Manager koppelt Sensoren, Netz und UI; SavedState nur kleine UI-IDs, Room für Dauerhaftes | A01/A07 |
| DI | Hilt an Android-Grenzen, Constructor Injection in Kotlin | manueller Container bei wachsender Modulzahl aufwendiger; kein Service-Locator | A01 |
| Module | app orchestriert; core:model/network/database/designsystem/testing; domain:navigation/shopping; platform:beacons/ar; feature:home/planning/stores/map/shopping/recipes/upsell/transfer | keine Feature→Feature-Imports; kleine reine Algorithmen bleiben zusammen, keine künstlichen Einzelmodule pro Klasse | A01 |
| Netzwerk | OkHttp/Retrofit, Kotlin Serialization, schmale DTOs, domain mapper, zentrale Fehler/Timeout/Cancellation | Ktor hätte hier keinen Multiplattformnutzen; Root-OpenAPI-Codegen erst nach R-SC belastbar | A02 |
| API | aktuelles /api explizit, /api/v1 erst mit R-SC; anonymous Mobile, kein Kundenlogin | kein Prefix-Probing oder doppelte POSTs; Admin-Keycloak bleibt außerhalb Android | A02 |
| Daten | Room für Liste/Item/Session/PendingTransfer; DataStore für Einstellungen | JSON-Blob wie iOS verliert Atomizität bei konkurrierenden Aktionen; kein direkter iOS-UserDefaults-Import | A07/A11 |
| Offline | Listen voll lokal; Store-/Layout-/Rezeptcache mit Provenienz; Suche online; keine Offline-Writequeue für Upsell | kein umfassender Offlinekatalog ohne Vertrag; Demo ist nicht reales Filiallayout | A02/A04/A09 |
| BLE | BluetoothLeScanner, exakte manufacturer-Identität, foreground-only, keine MAC-IDs | AltBeacon später austauschbarer Adapter; Companion Device Manager ungeeignet für öffentliche ungekoppelte Beacons | A03/A05 |
| Ortung | RSSI/Kalman/Trilateration/Fusion/Matching lokal, monotone Zeit, gerätespezifische Qualitätsprofile | Android besitzt kein CoreLocation accuracy/proximity; keine GPS-Ersatzposition im Gebäude | A05 |
| Routing | geteilte rotierte Geometrie, gecachter Graph, heap A*, erreichbarer Regalzugang, stabile Route | alter Pathfinder und Regalmitten sind keine Vorlage; keine Luftlinienroute durch Hindernisse | A06 |
| Outdoor-Map | MapProvider mit Google-Maps-Empfehlung, D04 kommerzielle/Datenschutzentscheidung | MapLibre braucht ebenfalls Tilevertrag; Liste bleibt ohne Provider nutzbar, finale Kartenparität bleibt Gate | A03 |
| AR | ARCore Optional, lokales Alignment, Boden/Tracking geprüft, kleine eigene Marker-Engine | AR Required würde Geräte ausschließen; Compass-Kameraoverlay täuscht räumliche Verankerung vor | A08 |
| Transfer | v1 kompatibel, SAF/FileProvider, explizite Mengenentnahme | keine AirDrop-Annahme; Chooser-Ergebnis kein Empfangsbeleg; v2 nicht einseitig erfinden | A11 |
| Hintergrund | App hidden/screen off pausiert Scan, Motion und Kamera; Tourdaten bleiben | Foreground Service/WorkManager-Polling für jetzigen Scope unnötig; Fortsetzen benötigt neuen Fix | A12 |
| Release | minSdk26, geplantes target/compile36, API37-Qualifikation; konkrete stabile Versionen vor Implementierung sperren | nicht behaupten, 36 sei aktuell höchstes SDK. Play-Anforderungen vor Release erneut prüfen | A01/A12 |

## Zustandsverträge

StoreContext = gewählte/erkannte Filiale + LayoutSnapshot + generation. Jede Response und jedes abgeleitete Route-/AR-Ergebnis trägt die Generation. Wechsel invalidiert laufende Featurezustände atomar, erhält lokale Listen. Eine bewusst manuelle Wahl wird nicht von einem zufälligen Funkcallback ersetzt.

UiState trennt Initial/Loading/Content/Empty/Error; Content kann stale/provenance tragen. Error enthält fachlichen Recoverypfad, keine rohen Serverbodies. Flow-Cancellation allein reicht nicht, weil bereits abgeschlossene Callbacks eintreffen können. Jeder Commit prüft RequestKey und Generation.

Session = running/paused/completed plus listId/storeId/generation/routeMode. Einzelproduktziel und Tourziel sind exklusiv. Beim Prozesstod persistierte Daten wiederherstellen, Sensoren/AR/Netzanfragen neu starten; Side Effects nur mit idempotenten Aktionsschlüsseln. Kein Request durch bloße Recomposition.

## Persistenz und Versionen

Room v1 enthält List, Item, Session; Transfer- und Upsell-Tabellen erhalten später explizite Schemaweiterentwicklungen mit Migrationstests. Mutationen an Liste/Session/Handled sind transaktional. DataStore enthält UI-Einstellungen und gewählte IDs nur soweit nicht fachlich gemeinsam mit der Session benötigt. Cache: environment+storeId+layoutId/revision+schemaVersion+fetchedAt; keine Positionshistorie.

Unlesbare DB bleibt verwahrt; Recovery statt Defaultüberschreiben. Keine destruktive Migration. Automatische Backups für private Daten ausgeschlossen; explizite .indoorolist-Exporte sind bewusst vom Benutzer verwaltete Dokumente. v1 migriert nur den exportierbaren Teil der iOS-Liste, nicht freie Zutaten/Rezeptherkunft.

## Versions- und Hardwarematrix

| Klasse | Verhalten / Testpflicht |
| --- | --- |
| API26–28 | ältere BLE-/Location-Rechte, Location-Schalter, begrenzte Sensoren; kein Storage-Recht für SAF |
| API29–30 | Fine Location, One-time/Revoke soweit OS unterstützt; kein Background Location, Lifecycle-Stopp |
| API31–32 | Nearby Devices/SCAN plus Fine Location, Präzisionswahl, nötige CONNECT-APIs prüfen |
| API33–34 | Auto-reset/Permission-Revoke, kein Notifications-Recht ohne Funktion; moderne Sharesheet-/URI-Fälle |
| API35–36 | Edge-to-edge/Insets, Predictive Back, adaptive Fenster-/Tabletbedienung, Release-Mindestziel prüfen |
| API37 oder jüngste verfügbare Version | zusätzliche Kompatibilitätsprüfung; Preview nur als Preview dokumentieren, Toolchain-/Targetentscheidung D01 aktualisieren |
| Kein BLE / keine Play Services / kein ARCore / Kamera fehlt | Installierbar, manuelle Liste/Store/2D nutzbar; AR und Providerfunktionen explizit begrenzt |
| OEMs / Tablet / Foldable | mindestens zwei Hersteller, ein schwächeres Gerät, Rotation/Multiwindow, Screen-off und reales Beaconfeld |

## Initiale Leistungs- und Qualitätsbudgets

Planungsziele, noch ungemessen: App-UI reagiert auf lokale Mutation binnen 100 ms p95; Stoppneuberechnung 40×30 m/25 Stopps <=50 ms p95 im Worker auf festgehaltener Mittelklasse; kein Sensorcallback blockiert Main >16 ms. AR >=30 fps während zehn Minuten nach Warmup, Pool <=120. Feldziel Positionsfehler Median <=1 m, p95 <=2 m an kontrollierten Messpunkten und stationärer p95-Radius <=2 m über 60 s; bei Nichterreichen kein Trusted-Qualitätsversprechen, Profil/Anforderungen mit D06 prüfen. Batterieverbrauch über 30 Minuten messen und Pilotgrenze vor Freigabe festlegen, keine erfundene Messung.
