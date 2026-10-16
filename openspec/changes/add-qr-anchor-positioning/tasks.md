## 1. Setup

- [x] 1.1 Start after `main` (with the admin rebuild) is merged into `pilot/first-store`; create `pilot/qr-anchors` from `origin/pilot/first-store`; baseline `swift test`, simulator build, admin checks, `sh ./mvnw test`. (branch `pilot/qr-anchors` = `origin/pilot/first-store` + `origin/pilot/erik-guided-tour`, because the scan buttons sit next to „Ich bin hier“ and the untrusted banner from PR 113)
- [x] 1.2 Run `npx -y @fission-ai/openspec@1.3.1 validate add-qr-anchor-positioning --strict`.

## 2. Payload and Layout Model

- [x] 2.1 Add `AnchorPayload` (pure Swift, SwiftPM target): parse/build the URL, validate store code and anchor id; tests incl. malformed URLs.
- [x] 2.2 Decode `anchor` elements in `LayoutData`; expose anchors per layout; tests with a fixture.
- [x] 2.3 Backend `LayoutDocumentValidator`: unique `anchorId`, id format; JUnit tests.
- [x] 2.4 Admin `editor/validation.ts`: same rule; unit tests.

## 3. iOS Scan

- [x] 3.1 Add `Views/Scan/AnchorScannerView.swift` with VisionKit `DataScannerViewController` (QR only), availability check, fallback message if unsupported.
- [x] 3.2 Add „QR-Code scannen“ to the indoor map header and the „Position ungenau“ banner.
- [x] 3.3 Wire a valid scan to the manual calibration path (trusted position, one route rebuild, study counter `manualPositionCount`).
- [x] 3.4 Store mismatch and unknown anchor states per requirement.
- [x] 3.5.5 Simulator check with a QR image (camera simulation not available: use a DEBUG „Payload einfügen“ field to test the same code path); device check documented as human step. Simulator check done (evidence in `docs/pilot-readiness/evidence/qr-anchors/`); **device check with a printed code is a human step** (see `STATUS.md`).

## 4. Admin Editor and Print Sheet

- [x] 4.1 Add the anchor tool and inspector fields (id, label) to the new editor; JSON round trip tests.
- [x] 4.2 Vendor a small QR encoder (license compatible, no CDN); unit test that a known payload produces a decodable matrix.
- [x] 4.3 Add page „QR-Codes drucken“ per store (print CSS, 6 per A4 page); mocked browser test.
- [ ] 4.4 Document the workflow in `docs/pilot-readiness/operations/STORE_DATA_ENTRY.md` (coordinate with Person C). **Not done:** the file does not exist yet (Person C, `prepare-pilot-store-operations`); the workflow is recorded in `design.md` „Implementation notes“.

## 5. Verification

- [x] 5.1 All checks green; OpenSpec strict validation; screenshots in `docs/pilot-readiness/evidence/qr-anchors/`. Checks green (swift 152, backend 146, admin-ui 81 + browser 115); screenshots in `docs/pilot-readiness/evidence/qr-anchors/`. The printed-code device check remains open.
- [ ] 5.2 Pull request `pilot/qr-anchors` → `pilot/first-store` (admin/backend parts: also review by Person B); update `STATUS.md`.
