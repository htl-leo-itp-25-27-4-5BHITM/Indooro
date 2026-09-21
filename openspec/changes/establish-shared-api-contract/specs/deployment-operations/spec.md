## ADDED Requirements

### Requirement: CI verifies the API contract before publishing images
The CI pipeline SHALL run a `contract` job on every pull request and on pushes to `main` that lints `openspec/specs/shared-api/openapi.yaml`, exports the generated OpenAPI document from the backend, checks parity and breaking changes, verifies that generated Swift and TypeScript files are up to date, and runs `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`. The image publishing job SHALL depend on the `contract` job and on the backend test job.

#### Scenario: A pull request breaks the contract
- **GIVEN** a pull request that removes a response field used by the iOS client
- **WHEN** CI runs
- **THEN** the `contract` job fails and no image is published

#### Scenario: A pull request only changes documentation
- **GIVEN** a pull request that edits `docs/`
- **WHEN** CI runs
- **THEN** the `contract` job still validates OpenSpec and passes
