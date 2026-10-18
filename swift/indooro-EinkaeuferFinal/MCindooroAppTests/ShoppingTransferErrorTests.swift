import XCTest
@testable import MCindooroApp

final class ShoppingTransferErrorTests: XCTestCase {
    func testErrorTextsUseUmlautsInsteadOfTransliterations() {
        let cases: [ShoppingTransferError] = [.emptySelection, .invalidFile, .unsupportedVersion(3), .noReadableData, .failedToCreateExport]
        for error in cases {
            let text = error.errorDescription ?? ""
            XCTAssertFalse(text.isEmpty)
            for pattern in ["fuer", "ausgewaehlt", "gueltig", "unterstuetz"] {
                XCTAssertFalse(text.contains(pattern), "\(text) enthält \(pattern)")
            }
        }
        XCTAssertEqual(ShoppingTransferError.emptySelection.errorDescription, "Es wurden keine Artikel für den Transfer ausgewählt.")
        XCTAssertEqual(ShoppingTransferError.invalidFile.errorDescription, "Die ausgewählte Datei ist keine gültige Indooro-Einkaufsliste.")
        XCTAssertEqual(ShoppingTransferError.unsupportedVersion(3).errorDescription, "Diese Listen-Datei verwendet eine nicht unterstützte Version (3).")
    }
}
