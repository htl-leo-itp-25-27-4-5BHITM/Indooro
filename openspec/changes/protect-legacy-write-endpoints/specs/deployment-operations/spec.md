## ADDED Requirements

### Requirement: Production has no insecure authentication defaults
The `prod` profile SHALL require the OIDC client secret from the environment (`QUARKUS_OIDC_CREDENTIALS_SECRET` or `OIDC_CLIENT_SECRET`) without a default value, SHALL restrict CORS origins to `https://it220209.cloud.htl-leonding.ac.at`, and SHALL deny JAX-RS endpoints without an explicit security annotation.

#### Scenario: Secret is missing
- **GIVEN** the backend container starts with the `prod` profile and neither `QUARKUS_OIDC_CREDENTIALS_SECRET` nor `OIDC_CLIENT_SECRET`
- **WHEN** Quarkus boots
- **THEN** start-up fails with a configuration error instead of using a development secret

#### Scenario: Cross-origin request from another site
- **GIVEN** the backend runs with the `prod` profile
- **WHEN** a browser on `https://example.org` sends a preflight request to `/api/stores`
- **THEN** the response does not allow that origin

#### Scenario: Endpoint without annotation
- **GIVEN** a new JAX-RS method without `@PermitAll`, `@Authenticated`, or `@RolesAllowed`
- **WHEN** it is called in `prod`
- **THEN** the backend denies the request
