## ADDED Requirements

### Requirement: Canonical plan state prevents duplicated work
Plan signatures and payloads MUST use identical sorted unique current/completed/trigger arrays with open precedence and SHALL allow only one in-flight plan per session.

#### Scenario: Gemischtes Duplikat
- **GIVEN** Produkt 7 ist in einer Zeile open und einer done
- **WHEN** der Plan aufgebaut wird
- **THEN** steht 7 nur in currentIDs und nicht completedIDs

#### Scenario: Callback-Sturm
- **GIVEN** ein Plan ist unterwegs
- **WHEN** mehrere Listenrevisionen eintreffen
- **THEN** läuft weiterhin genau eine Anfrage ohne routinebedingtes Cancel/Restart

### Requirement: Handled opportunities outlive cache entries
Shown/dismissed/accepted and successful empty opportunities SHALL be recorded as handled independently of suggestion cache lifetime and SHALL not re-request within the same session identity.

#### Scenario: Wiederöffnen
- **GIVEN** eine Station wurde gezeigt und abgelehnt
- **WHEN** deren Items erneut geöffnet und erledigt werden
- **THEN** entsteht weder weiterer Prompt noch neue Plananfrage für dieselbe Triggeridentität

### Requirement: Completion never waits for upsell
List/stop completion MUST commit immediately; prompts SHALL use matching preloaded results with max three suggestions, confidence threshold and ten-prompt session limit.

#### Scenario: Timeout
- **GIVEN** Upsell antwortet nicht
- **WHEN** Stopp Erledigt betätigt wird
- **THEN** geht die Tour sofort zum nächsten Stopp

#### Scenario: Elfter Prompt
- **GIVEN** zehn Prompts wurden gezeigt
- **WHEN** eine weitere Opportunity abgeschlossen wird
- **THEN** erscheint kein elfter Prompt

### Requirement: Retry requires verified pre-AI failure
The client SHALL retry at most once after one second only for verified pre-AI candidate lookup failure and MUST NOT retry token-consuming, ambiguous, empty or rate-limited results.

#### Scenario: Pre-AI
- **GIVEN** R-U4 bestätigt retryable candidate lookup failure ohne AI-Aufruf
- **WHEN** derselbe Kontext nach einer Sekunde noch gilt
- **THEN** erfolgt genau ein Retry

#### Scenario: Unklar
- **GIVEN** ein Timeout ohne Kosten-/Verbrauchsnachweis tritt auf
- **WHEN** die Fehlerbehandlung läuft
- **THEN** wird nicht erneut angefragt

### Requirement: Dismissal scope and success are truthful
Dismissal SHALL suppress locally at once; cross-session suppression SHALL be claimed only after compatible server bounds and effective dismissal matching are verified.

#### Scenario: Altes Backend
- **GIVEN** dismiss liefert 400 wegen suppressMinutes
- **WHEN** Nicht mehr gewählt wird
- **THEN** bleibt lokale Tourunterdrückung wirksam und eine dauerhafte Serverwirkung wird nicht behauptet

### Requirement: Acceptance and telemetry preserve privacy
Accepted suggestions SHALL use A07 with addedFromUpsell=true and SHALL not recursively trigger suggestions; events SHALL remain minimal best effort without customer identity or position.

#### Scenario: Annahme
- **GIVEN** ein Vorschlag ist sichtbar
- **WHEN** Hinzufügen zweimal schnell ausgelöst wird
- **THEN** wird nur eine akzeptierte Mutation gespeichert und der Artikel nicht zum neuen Trigger


### Requirement: Plan size remains contract bounded
The client MUST enforce the released root request limits before dispatch and SHALL skip oversized plan preloading without splitting it into multiple cost-incurring requests or blocking shopping.

#### Scenario: Opportunity limit exceeded
- **GIVEN** the plan snapshot contains 81 opportunities and the released contract allows 80
- **WHEN** preloading is considered
- **THEN** no plan request is sent, shopping remains usable and a content-free diagnostic records the limit reason

#### Scenario: Station has too many triggers
- **GIVEN** one station has 21 eligible trigger IDs and the released contract allows 20
- **WHEN** the plan is constructed
- **THEN** the oversized plan is not sent or silently truncated and no automatic sequence of replacement plans starts
