import XCTest
@testable import IndooroNavigationCore

/// Prüft Kontrastberechnung nach WCAG 2.x und stellt sicher, dass jede benannte Textfarbe
/// die Schwelle von 4.5:1 gegen Weiß erreicht.
final class AccessibilityPaletteTests: XCTestCase {

    private let white = AccessibilityPalette.white
    private let black = RGB(0, 0, 0)

    func testBlackOnWhiteIsTwentyOne() {
        XCTAssertEqual(AccessibilityPalette.contrastRatio(black, white), 21, accuracy: 0.0001)
    }

    func testWhiteOnWhiteIsOne() {
        XCTAssertEqual(AccessibilityPalette.contrastRatio(white, white), 1, accuracy: 0.0001)
    }

    func testContrastRatioIsSymmetric() {
        let a = AccessibilityPalette.brandGreen
        XCTAssertEqual(
            AccessibilityPalette.contrastRatio(a, white),
            AccessibilityPalette.contrastRatio(white, a),
            accuracy: 0.0001
        )
    }

    func testRelativeLuminanceOfBlackAndWhite() {
        XCTAssertEqual(AccessibilityPalette.relativeLuminance(black), 0, accuracy: 0.0001)
        XCTAssertEqual(AccessibilityPalette.relativeLuminance(white), 1, accuracy: 0.0001)
    }

    func testMidGrayMatchesKnownWcagRatio() {
        // #767676 erreicht auf Weiß 4.54:1 (bekannter Referenzwert für die Schwelle 4.5).
        let gray = RGB(118.0 / 255.0, 118.0 / 255.0, 118.0 / 255.0)
        XCTAssertEqual(AccessibilityPalette.contrastRatio(gray, white), 4.54, accuracy: 0.01)
    }

    func testOriginalRouteAccentFailsThresholdWhichMotivatesDarkerBlue() {
        let originalRouteAccent = RGB(0.15, 0.57, 0.88)
        let ratio = AccessibilityPalette.contrastRatio(originalRouteAccent, white)

        XCTAssertLessThan(ratio, AccessibilityPalette.minimumTextContrast)
        XCTAssertEqual(ratio, 3.37, accuracy: 0.01)
    }

    func testMinimumTextContrastIsWcagAA() {
        XCTAssertEqual(AccessibilityPalette.minimumTextContrast, 4.5)
    }

    func testBrandGreenMeetsMinimumTextContrastOnWhite() {
        XCTAssertGreaterThanOrEqual(
            AccessibilityPalette.contrastRatio(AccessibilityPalette.brandGreen, white),
            AccessibilityPalette.minimumTextContrast
        )
    }

    func testRouteBlueTextMeetsMinimumTextContrastOnWhite() {
        XCTAssertGreaterThanOrEqual(
            AccessibilityPalette.contrastRatio(AccessibilityPalette.routeBlueText, white),
            AccessibilityPalette.minimumTextContrast
        )
    }

    func testWhiteOnRouteButtonMeetsMinimumTextContrast() {
        // Weiße Schrift liegt auf der Buttonfläche; der Kontrast ergibt sich gegen Weiß.
        XCTAssertGreaterThanOrEqual(
            AccessibilityPalette.contrastRatio(AccessibilityPalette.whiteOnRouteButton, white),
            AccessibilityPalette.minimumTextContrast
        )
    }

    func testWarningTextMeetsMinimumTextContrastOnWhite() {
        XCTAssertGreaterThanOrEqual(
            AccessibilityPalette.contrastRatio(AccessibilityPalette.warningText, white),
            AccessibilityPalette.minimumTextContrast
        )
    }

    func testSecondaryTextMeetsMinimumTextContrastOnWhite() {
        XCTAssertGreaterThanOrEqual(
            AccessibilityPalette.contrastRatio(AccessibilityPalette.secondaryText, white),
            AccessibilityPalette.minimumTextContrast
        )
    }
}
