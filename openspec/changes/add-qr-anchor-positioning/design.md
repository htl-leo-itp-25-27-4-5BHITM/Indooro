## Context

- Manual calibration exists (`NavigationSessionCore.manualCalibration(at:)`), and `add-pilot-guided-tour-fallbacks` defines a trusted manual position.
- Camera usage description exists (`NSCameraUsageDescription`). VisionKit `DataScannerViewController` is available from iOS 16; the pilot deployment target is ≥ 17.
- Layout elements are free-form JSON objects; the new editor (`admin-ui/src/editor/`) supports typed tools and an inspector; `editor/validation.ts` and backend `LayoutDocumentValidator` validate documents.
- The customer web view is served under `/customer/`.

## Decisions

1. **Payload is a URL**, so any camera app opens the web finder, and the iOS app parses the same URL (`store`, `a` query items). No custom scheme needed for the pilot.
2. **Anchor element**: `{ "type": "anchor", "anchorId": "A12", "x": 10.5, "y": 3.0, "label": "Gang 4 – Anfang" }`; `anchorId` unique per layout, `[A-Z0-9-]{1,12}`.
3. **Scan sets position**: projected to the nearest walkable point; counts as manual position for the study counters; route rebuilds once.
4. **QR generation in the browser** from the active layout; print CSS for A4, 6 codes per page, minimum 4 cm code size.
5. **Store mismatch**: if `store` differs from the active store, show „Dieser Code gehört zu <Filiale>. Wechseln?“.

## Risks / Trade-offs

- Codes can be moved or damaged; the anchor label and a check in the store onboarding checklist mitigate it.
- Customers may not scan spontaneously; the tour panel suggests scanning when the position is not trusted.
