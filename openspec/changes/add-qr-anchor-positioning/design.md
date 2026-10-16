## Context

- Manual calibration exists (`NavigationSessionCore.manualCalibration(at:)`), and `add-pilot-guided-tour-fallbacks` defines a trusted manual position.
- Camera usage description exists (`NSCameraUsageDescription`). VisionKit `DataScannerViewController` is available from iOS 16; the pilot deployment target is ≥ 17.
- Layout elements are free-form JSON objects; the new editor (`admin-ui/src/editor/`) supports typed tools and an inspector; `editor/validation.ts` and backend `LayoutDocumentValidator` validate documents.
- The customer web view is served under `/customer/`.

## Decisions

1. **Payload is a URL**, so any camera app opens the web finder, and the iOS app parses the same URL (`store`, `a` query items). No custom scheme needed for the pilot.
2. **Anchor element**: `{ "type": "anchor", "anchorId": "A12", "x": 10.5, "y": 3.0, "width": 1, "height": 1, "label": "Gang 4 – Anfang" }`; `anchorId` unique per layout, `[A-Z0-9-]{1,12}`.
3. **Scan sets position**: projected to the nearest walkable point; counts as manual position for the study counters; route rebuilds once.
4. **QR generation in the browser** from the active layout; print CSS for A4, 6 codes per page, minimum 4 cm code size.
5. **Store mismatch**: if `store` differs from the active store, show „Dieser Code gehört zu <Filiale>. Wechseln?“.

## Risks / Trade-offs

- Codes can be moved or damaged; the anchor label and a check in the store onboarding checklist mitigate it.
- Customers may not scan spontaneously; the tour panel suggests scanning when the position is not trusted.

## Implementation notes

- Anchors need `width` and `height` like every non-beacon element (the generic layout validator requires them); the editor always writes 1 × 1. The iOS client takes the element center, and anchors block no grid cell (`IndoorGraphBuilder`) and are not drawn as shelves.
- Anchor ids are validated at publication (`saveLayoutVersion` with activation, `activateLayoutVersion`, `LayoutService.saveCurrentLayout`), not for drafts.
- QR encoding in the browser uses `qrcode-generator` 2.0.4 (MIT, bundled, no CDN); `jsqr` 1.4.0 (Apache-2.0, devDependency) decodes the rendered matrix in the unit test.
- `https://<host>/customer/?store=<storeCode>&a=<anchorId>`: the host is the host of the admin page; the customer web view does not read `a` yet (`upgrade-customer-web-product-finder`, Person C).
- `docs/pilot-readiness/operations/STORE_DATA_ENTRY.md` (task 4.4) does not exist yet (`prepare-pilot-store-operations`, Person C); the workflow is described here and in `STATUS.md`: place anchors in the editor tool „QR-Anker“, print via „QR-Codes drucken“ (6 per A4 page, ≥ 4 cm), stick at aisle ends, reprint after layout changes.
- The camera usage text („… für die AR-Navigation …“) belongs to Person A (`Info.plist`/build settings); suggested wording: „Die Kamera wird für die AR-Navigation und zum Scannen von QR-Codes im Markt verwendet.“
