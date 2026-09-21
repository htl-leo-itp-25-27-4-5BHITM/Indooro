## Context

The Swift code base exists in three trees:

| Tree | Scheme | Bundle ID | Role after this change |
| --- | --- | --- | --- |
| `swift/indooro-EinkaeuferFinal/indooroApp` | `MCindooroApp` | `at.ac.htl.leonding.indooroswift2` | Canonical customer app, specified here |
| `swift/indooro-/indooroApp` | `MCindooroApp` | `at.ac.htl.leonding.indooroswift` | Legacy reference, not specified |
| `swift/indooroApp/indooroApp` | `indooroApp` | `at.ac.htl.leonding.indooroswift` | Legacy prototype, not specified |

All statements in the delta specs were verified by reading the canonical sources on 2026-09-17 at commit `63a42d4`.

## Goals / Non-Goals

**Goals**

- Give every user-visible iOS feature at least one requirement with observable scenarios.
- Record concrete numeric parameters (timeouts, thresholds, limits) so tests can assert them.
- Keep requirement names disjoint from requirement names that active changes add or modify, so later archives do not overwrite each other.

**Non-Goals**

- No code changes.
- No specification of defective behavior. Defects are listed below and handled by `fix-ios-contract-and-spec-drift`.
- No re-specification of upsell and recipe backend behavior; those remain owned by the active changes `add-upsell-cross-sell-suggestions`, `harden-upsell-prefilter-quality`, `stabilize-upsell-quality-and-request-lifecycle`, `add-recipe-shopping-list-integration`, and `improve-recipe-product-mapping-selection`.

## Decisions

1. **Five new `ios-*` capabilities instead of growing `mobile-*`.** The `mobile-*` capabilities describe cross-cutting mobile behavior (detection, positioning, lists, AR) that is shared with the backend contract. UI structure, networking, and tab behavior are iOS-specific and are easier to replace per platform if Android is ever added.
2. **EARS phrasing inside OpenSpec requirements.** Requirement statements use `WHEN … the iOS app SHALL …`, `WHILE …`, `IF … THEN …` so each statement has one trigger and one response. Scenarios keep GIVEN/WHEN/THEN.
3. **Numeric values are part of the contract.** Values from `StabilizedNavigationConfig`, `UpsellSuggestionStore`, and `BeaconManager` are specified as defaults. Changing them requires a delta, which keeps field-tuning traceable.
4. **Platform baseline is iOS 18.5.** The project sets `IPHONEOS_DEPLOYMENT_TARGET = 18.5` and uses iOS 17+ APIs (`onChange(of:initial:)`, `Map(position:)`, `MapCameraPosition`, `Annotation`). The iOS 15 statement is replaced.

## Known drift (not specified as desired behavior)

| Drift | Violated requirement | Fixed by |
| --- | --- | --- |
| City/hash-based fallback coordinates for stores without coordinates (`StoreMapPage.fallbackCoordinate`) | `mobile-store-detection` › Manual store selection remains possible | `fix-ios-contract-and-spec-drift` |
| 2D map shows raw position without degraded styling; `isLowConfidence` and `navigationStatusMessage` are only shown in AR | `mobile-positioning-navigation` › Blue Dot requires enough fresh beacon data; Positioning quality targets are explicit | `fix-ios-contract-and-spec-drift` |
| No persistent layout cache; store-layout failure loads no fallback map; server `fallback` flag ignored | `mobile-positioning-navigation` › Mobile layout can fall back when network is unavailable | `fix-ios-contract-and-spec-drift` |
| Product search network errors are shown as „no results“ | `mobile-positioning-navigation` › Product search requires network … | `fix-ios-contract-and-spec-drift` |
| Product search does not send `storeId`/`storeCode` | `product-catalog-search` › Store-aware catalog data is preferred | `fix-ios-contract-and-spec-drift` |
| Dismissal requests send `suppressMinutes=1440`, backend DTO allows at most 30 → HTTP 400 | `mobile-upsell-suggestions` (active change) › Customer can add or dismiss suggestions | `fix-ios-contract-and-spec-drift` |
| Walkable graph ignores element `rotation`, `accessAngle` unused | `store-layout-management` layout JSON semantics | `fix-ios-contract-and-spec-drift` |

## Risks / Trade-offs

- **Risk:** Specifying numeric defaults freezes tuning. **Mitigation:** Requirements state them as defaults of a single configuration type; a delta updating the table is cheap.
- **Risk:** Active changes add requirements to `mobile-shopping-lists`. **Mitigation:** This change only uses ADDED requirements with new names in that capability.
- **Risk:** Archiving creates new spec files with a placeholder purpose. **Mitigation:** Purpose sections are rewritten immediately after archive (task 4.3).

## Migration Plan

1. Validate the change with `npx -y @fission-ai/openspec@1.3.1 validate integrate-ios-client-specs --strict`.
2. Archive with `npx -y @fission-ai/openspec@1.3.1 archive integrate-ios-client-specs --yes`.
3. Replace generated purpose placeholders.
4. Validate all specs and changes with `--all --strict`.

Rollback: revert the archive commit; no runtime system is affected.
