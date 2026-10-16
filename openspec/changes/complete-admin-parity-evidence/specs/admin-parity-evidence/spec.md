## ADDED Requirements

### Requirement: Deferred Admin parity evidence is reproducible
Before a deferred Admin route is retired, the team SHALL record reproducible Legacy/Candidate action, role/scope, page-state, direct-link, keyboard/accessibility, mobile-impact, and route-rollback evidence. A route with an unresolved required check SHALL remain on its current entry.

#### Scenario: Editor evidence remains incomplete
- **WHEN** the Store or global Editor still has an unverified required action, state, or role/scope case
- **THEN** the `editor` route flag remains disabled and the Legacy entry remains available

#### Scenario: Deferred Editor cutover is proposed
- **WHEN** the team later proposes to enable the Editor route
- **THEN** each recorded check identifies its fixture, expected and observed result, test or live probe, and rollback outcome before the route flag changes
