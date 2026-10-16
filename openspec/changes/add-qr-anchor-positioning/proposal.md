## Why

BLE positioning in a supermarket is expected to have several meters of error, and the pilot is designed to work without it (`add-pilot-guided-tour-fallbacks`). The cheapest way to give customers an exact position at known moments is a printed QR code at fixed points: entrance, aisle ends, service desk. Scanning one takes two seconds, needs no beacons, works on every phone, and gives the navigation session a trusted position that the BLE estimate can then follow. The same codes can open the store directly in the web product finder for customers without the iOS app (`upgrade-customer-web-product-finder`).

## What Changes

- Add a layout element type `anchor` (point with `anchorId`, label) that the editor can place and the layout JSON preserves.
- Define the QR payload `https://it220209.cloud.htl-leonding.ac.at/customer/?store=<storeCode>&a=<anchorId>` (universal for web; the iOS app recognizes the same URL).
- iOS: „QR-Code scannen“ action on the indoor map (VisionKit data scanner); a scanned anchor of the active store sets a trusted manual position at the anchor; a code of another store offers to switch stores; unknown codes show a message.
- Admin: printable QR sheet per store (A4, one code per anchor with label „Gang 4 – Anfang“, store name, short instruction), generated in the browser from the active layout.
- Backend: no new route; anchors live in the layout document. Layout validation rejects duplicate `anchorId`s.

## Capabilities

### New Capabilities

- `qr-anchor-positioning`: anchor elements, QR payload, scan-to-position in the iOS app, printable anchor sheet.

### Modified Capabilities

- None.

## Impact

- Owner: Erik (Mac). Branch `pilot/qr-anchors` from `pilot/first-store` after `main` (admin rebuild) is merged into it.
- iOS: new `Views/Scan/AnchorScannerView.swift`, `Utilities/AnchorPayload.swift` (pure, tested in SwiftPM), wiring into `NavigationSession` manual calibration and `StoreMapPage` (Erik-owned); `Models/LayoutData.swift` anchor decoding.
- Admin UI (new editor and layout model): anchor tool, inspector fields, QR sheet page; a small QR encoder (vendored, MIT/BSD license, no network).
- Backend: layout validation for unique anchor ids (`LayoutDocumentValidator`).
- Privacy: scanning happens on the device; no scan is reported to the server.
