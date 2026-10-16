## Why

Older customers and people with low vision are among those who would benefit most from a product finder, but the app has only 21 accessibility modifiers, 22 fixed font sizes and an unlabeled map (`docs/pilot-readiness/01_PROJECT_AUDIT.md` 3.1). Phase 3 test persons will include older people; unreadable text or an inaccessible map would distort the results.

## What Changes

- Dynamic Type everywhere in customer-facing views (replace fixed `.system(size:)`), layouts that wrap at accessibility sizes.
- VoiceOver: labels and hints for tab bar, search results, shelf text, tour panel buttons, map (summary element: „Ziel: Gang 4 links, 12 Meter entfernt“), study-free.
- Minimum tap targets 44 pt, contrast ≥ 4.5:1 for text, no information by color only on the map.
- Accessibility audit with Xcode Accessibility Inspector; findings list.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `ios-client-architecture`: accessibility baseline for customer-facing views.

## Impact

- Owner: Person A (Mac). Branch `pilot/ios-accessibility` after `prepare-pilot-ios-build` is merged. Touches A-owned views; for Erik-owned views (`StoreMapPage` target card/tour panel, `MapView`) only accessibility modifiers, agreed with Erik per file.
