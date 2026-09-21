## ADDED Requirements

### Requirement: Layout editor renders untrusted text as text
The layout editor SHALL insert layout element labels, beacon ids, beacon codes, identity keys, store names, store codes, category names, and validation messages into the page only as text (via `textContent` or `escapeHtml`) and SHALL NOT create markup from layout document values. Element ids used in data attributes SHALL be escaped.

#### Scenario: A layout label contains an image tag
- **GIVEN** a stored layout whose shelf label is `<img src=x onerror=alert(1)>`
- **WHEN** an admin opens the layout in the editor
- **THEN** the label is displayed literally and no `img` element or script execution results from it

#### Scenario: A store name contains markup
- **GIVEN** a store named `<b>Filiale</b>`
- **WHEN** the editor shows the store context box
- **THEN** the name is displayed literally

### Requirement: Admin UI works under the Content-Security-Policy
The Admin UI and layout editor SHALL work without inline scripts, `eval`, or third-party script origins so that the backend Content-Security-Policy `script-src 'self'` does not block any admin feature.

#### Scenario: Smoke tests run with CSP
- **GIVEN** the admin smoke server sends the production Content-Security-Policy
- **WHEN** `npm run admin:smoke` runs
- **THEN** all admin route tests pass and the browser console reports no CSP violations

#### Scenario: A developer adds an inline handler
- **GIVEN** a change adds `onclick="..."` to admin markup
- **WHEN** the smoke tests run with CSP
- **THEN** the test for the affected page fails
