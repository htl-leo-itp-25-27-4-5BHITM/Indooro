## ADDED Requirements

### Requirement: Shared design tokens have one typed source
The repository SHALL maintain `design-tokens/tokens.json` as the shared W3C Design Tokens Community Group (DTCG) format source using `$type` and `$value` for color, typography, spacing and radius values consumed by web and iOS. Token aliases SHALL resolve deterministically; invalid values, unresolved references and alias cycles SHALL fail generation. Platform-specific semantic tokens SHALL explicitly preserve existing differences where one shared value would change the appearance.

#### Scenario: Shared token changes
- **WHEN** a valid semantic token value is changed and generators run
- **THEN** the corresponding CSS custom property and Swift constant reflect the same source with documented platform conversion

#### Scenario: Token alias is invalid
- **WHEN** a token contains a missing reference or an alias cycle
- **THEN** generation exits unsuccessfully and does not leave partially updated outputs

### Requirement: Web applications consume generated CSS tokens
A deterministic generator SHALL produce CSS custom properties from `design-tokens/tokens.json` for `admin-ui`, `pilot-showcase`, customer web and landing. Web builds and static serving SHALL include those generated properties, and migrated shared design values SHALL use them. Generated files SHALL be committed with a generated-file marker and reproducible regeneration command. CI SHALL regenerate into temporary outputs and fail if committed outputs differ, including when the token source or generator changes.

#### Scenario: Generated CSS is stale
- **GIVEN** tokens or generation logic changed without updating committed CSS
- **WHEN** CI checks generation drift
- **THEN** CI fails and reports the regeneration command

### Requirement: Canonical iOS app consumes generated Swift tokens
A deterministic generator SHALL produce typed Swift constants from the same token source for the canonical `MCindooroApp` target. The generated source SHALL compile in that target, preserve color components and map dimensions/typography explicitly to iOS units and types. Generated Swift SHALL be committed with a generated-file marker and regeneration command. CI SHALL fail for stale Swift output after source or generator changes.

#### Scenario: Generated Swift is consumed
- **WHEN** token generation and the canonical iOS build run
- **THEN** migrated views compile using generated constants and the committed output matches regeneration

### Requirement: Token migration preserves approved rendering
Token adoption SHALL be a pure refactor preserving existing appearance and German UI copy across the three web surfaces and canonical iOS app, including existing light/dark values and responsive behavior. Verification SHALL compare rendering before and after migration with identical fixtures, viewports, simulator and appearance settings. Web visual gates and iOS before/after evidence SHALL show no intentional visual change; migration SHALL NOT refresh baselines to conceal a change.

#### Scenario: Token conversion alters appearance
- **GIVEN** approved screenshots captured before token migration
- **WHEN** generated token adoption changes a color, dimension or typography in the matching capture
- **THEN** the conversion or consumer mapping is corrected before acceptance and the baseline is not updated to accept the drift
