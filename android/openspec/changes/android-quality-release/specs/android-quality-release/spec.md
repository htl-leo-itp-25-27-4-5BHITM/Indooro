## ADDED Requirements

### Requirement: Permissions follow capability and OS version
The app SHALL request only required capabilities at point of use with the documented version split, SHALL not assert neverForLocation and SHALL preserve manual flows after denial.

#### Scenario: Präzision abgelehnt
- **GIVEN** API31+ gewährt nur groben Standort
- **WHEN** Beacon-Navigation aktiviert wird
- **THEN** wird fehlende Präzision erklärt, kein Trusted-Pose behauptet und manuelle Auswahl bleibt

#### Scenario: Permanent denied
- **GIVEN** Berechtigung ist dauerhaft abgelehnt
- **WHEN** der Benutzer die Funktion erneut wählt
- **THEN** erscheint ein optionaler Systemeinstellungslink statt wiederholter Dialogschleife

### Requirement: Background transitions stop active sensing
The app MUST stop live BLE/motion/camera acquisition when hidden and SHALL not restart sensing from background jobs or boot receivers.

#### Scenario: Sperren
- **GIVEN** eine Tour läuft
- **WHEN** das Display gesperrt wird
- **THEN** stoppt Sensorarbeit und nach Entsperren erfolgt neue Warmup-/Permissionprüfung

### Requirement: Local and transmitted data are minimized
The release SHALL contain no embedded secrets or raw-content logging, exclude sensitive operational data from backup and provide a user-visible local-data deletion path.

#### Scenario: Daten löschen
- **GIVEN** Listen und Layoutcache existieren
- **WHEN** lokale Daten löschen bestätigt wird
- **THEN** werden DB/Cache/PendingExports entfernt und eine neue Defaultliste erstellt

#### Scenario: Backup
- **GIVEN** Backup-/Device-Transfer-Konfiguration wird geprüft
- **WHEN** die freigegebenen Pfade aufgelistet werden
- **THEN** sind Listen, Sensor-/Layoutcache und Transferdaten ausgeschlossen

### Requirement: All primary flows are accessible
Primary flows MUST work with TalkBack and enlarged text, provide semantic actions and a non-map route/stop representation, and never communicate status solely by color.

#### Scenario: Screenreader
- **GIVEN** TalkBack ist aktiv
- **WHEN** der Nutzer den nächsten Stopp abschließen will
- **THEN** sind Stoppname, Status, Erledigt und Überspringen in sinnvoller Reihenfolge erreichbar

#### Scenario: Schrift
- **GIVEN** Schriftgröße steht auf 200 Prozent
- **WHEN** Importvorschau und Permissionhinweis erscheinen
- **THEN** bleiben Bestätigen/Abbrechen sichtbar erreichbar

### Requirement: Automated evidence is isolated and reproducible
CI SHALL validate both OpenSpec projects independently and run Android tests against local fixtures/fakes with no production writes or real AI usage.

#### Scenario: Pull Request
- **GIVEN** ein DTO bricht einen Root-Vertragsfixture
- **WHEN** CI läuft
- **THEN** schlägt der Android-Vertragstest fehl und kein Live-Endpoint wird aufgerufen

### Requirement: Release requires physical parity evidence
Production acceptance MUST pass every applicable parity case and real-device beacon/AR scenario in ACCEPTANCE.md with recorded build, OS, hardware class and sanitized results.

#### Scenario: Nur Emulator
- **GIVEN** alle Emulatortests sind grün, Feldmessung fehlt
- **WHEN** Release geprüft wird
- **THEN** bleibt die Hardware-Paritätsfreigabe blockiert

#### Scenario: Rolloutfehler
- **GIVEN** Pilot meldet Datenverlust oder Wandquerung
- **WHEN** Releaseverantwortliche bewerten den Build
- **THEN** wird weitere Verteilung gestoppt und eine kompatible Korrektur vorbereitet
