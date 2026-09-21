## ADDED Requirements

### Requirement: Customer web renders untrusted text safely
The customer web page SHALL insert layout labels, beacon ids, product names, and category names only as text and SHALL NOT create markup from API values.

#### Scenario: A product name contains markup
- **GIVEN** a product named `<script>alert(1)</script>`
- **WHEN** it appears in the search results
- **THEN** the name is displayed literally and no script runs

#### Scenario: A layout label contains markup
- **GIVEN** the current layout contains the label `<img src=x onerror=alert(1)>`
- **WHEN** the customer page renders the map
- **THEN** the label is displayed literally

### Requirement: Customer web loads no runtime third-party code
The customer web page SHALL load scripts and stylesheets only from the backend origin and SHALL NOT use the Tailwind Play CDN or any other runtime CDN.

#### Scenario: The page is loaded
- **GIVEN** the production deployment
- **WHEN** the browser loads `/customer/`
- **THEN** all script and stylesheet requests target the backend origin

#### Scenario: The CDN is unreachable
- **GIVEN** `cdn.tailwindcss.com` cannot be reached
- **WHEN** the page is loaded
- **THEN** the layout and styling are unchanged
