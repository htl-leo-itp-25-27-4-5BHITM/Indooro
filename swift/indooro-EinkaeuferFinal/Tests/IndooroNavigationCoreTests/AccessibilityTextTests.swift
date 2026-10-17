import XCTest
@testable import IndooroNavigationCore

/// Prüft die VoiceOver-Formulierungen aus AccessibilityText. Jeder Zweig ist abgedeckt,
/// einschließlich des Beispiels aus der Spezifikation der Kartenzusammenfassung.
final class AccessibilityTextTests: XCTestCase {

    // MARK: - distancePhrase

    func testDistancePhraseReturnsNilForMissingOrInvalidValues() {
        XCTAssertNil(AccessibilityText.distancePhrase(meters: nil))
        XCTAssertNil(AccessibilityText.distancePhrase(meters: -1))
        XCTAssertNil(AccessibilityText.distancePhrase(meters: -0.5))
        XCTAssertNil(AccessibilityText.distancePhrase(meters: .nan))
        XCTAssertNil(AccessibilityText.distancePhrase(meters: .infinity))
    }

    func testDistancePhraseBelowOneMeterIsWenigerAlsEinMeter() {
        XCTAssertEqual(AccessibilityText.distancePhrase(meters: 0), "weniger als 1 Meter")
        XCTAssertEqual(AccessibilityText.distancePhrase(meters: 0.4), "weniger als 1 Meter")
        XCTAssertEqual(AccessibilityText.distancePhrase(meters: 0.99), "weniger als 1 Meter")
    }

    func testDistancePhraseUsesSingularForOneMeter() {
        XCTAssertEqual(AccessibilityText.distancePhrase(meters: 1.0), "1 Meter entfernt")
        XCTAssertEqual(AccessibilityText.distancePhrase(meters: 1.4), "1 Meter entfernt")
    }

    func testDistancePhraseRoundsToWholeMeters() {
        XCTAssertEqual(AccessibilityText.distancePhrase(meters: 12.0), "12 Meter entfernt")
        XCTAssertEqual(AccessibilityText.distancePhrase(meters: 12.4), "12 Meter entfernt")
        XCTAssertEqual(AccessibilityText.distancePhrase(meters: 12.6), "13 Meter entfernt")
        XCTAssertEqual(AccessibilityText.distancePhrase(meters: 1.5), "2 Meter entfernt")
    }

    // MARK: - mapSummary

    func testMapSummaryMatchesSpecificationExample() {
        let summary = AccessibilityText.mapSummary(
            targetText: "Gang 4 links",
            distanceMeters: 12,
            routeOrigin: "Standort",
            positionTrusted: true
        )

        XCTAssertEqual(summary, "Ziel: Gang 4 links, 12 Meter entfernt. Route ab Standort.")
    }

    func testMapSummaryWithoutTargetSaysNoTargetAndOmitsRouteOrigin() {
        let summary = AccessibilityText.mapSummary(
            targetText: nil,
            distanceMeters: 12,
            routeOrigin: "Standort",
            positionTrusted: true
        )

        XCTAssertEqual(summary, "Kein Ziel gewählt.")
    }

    func testMapSummaryTreatsBlankTargetAsNoTarget() {
        let summary = AccessibilityText.mapSummary(
            targetText: "   ",
            distanceMeters: 12,
            routeOrigin: "Standort",
            positionTrusted: true
        )

        XCTAssertEqual(summary, "Kein Ziel gewählt.")
    }

    func testMapSummaryOmitsDistanceWhenMissing() {
        let summary = AccessibilityText.mapSummary(
            targetText: "Gang 4 links",
            distanceMeters: nil,
            routeOrigin: "Standort",
            positionTrusted: true
        )

        XCTAssertEqual(summary, "Ziel: Gang 4 links. Route ab Standort.")
    }

    func testMapSummaryOmitsRouteOriginWhenMissingOrBlank() {
        let missing = AccessibilityText.mapSummary(
            targetText: "Gang 4 links",
            distanceMeters: 12,
            routeOrigin: nil,
            positionTrusted: true
        )
        let blank = AccessibilityText.mapSummary(
            targetText: "Gang 4 links",
            distanceMeters: 12,
            routeOrigin: "  ",
            positionTrusted: true
        )

        XCTAssertEqual(missing, "Ziel: Gang 4 links, 12 Meter entfernt.")
        XCTAssertEqual(blank, "Ziel: Gang 4 links, 12 Meter entfernt.")
    }

    func testMapSummaryWithTargetOnlyHasNoDistanceOrRoute() {
        let summary = AccessibilityText.mapSummary(
            targetText: "Gang 4 links",
            distanceMeters: nil,
            routeOrigin: nil,
            positionTrusted: true
        )

        XCTAssertEqual(summary, "Ziel: Gang 4 links.")
    }

    func testMapSummaryTrimsTargetText() {
        let summary = AccessibilityText.mapSummary(
            targetText: "  Gang 4 links  ",
            distanceMeters: 0.3,
            routeOrigin: nil,
            positionTrusted: true
        )

        XCTAssertEqual(summary, "Ziel: Gang 4 links, weniger als 1 Meter.")
    }

    func testMapSummaryAppendsUntrustedPositionWithTarget() {
        let summary = AccessibilityText.mapSummary(
            targetText: "Gang 4 links",
            distanceMeters: 12,
            routeOrigin: "Standort",
            positionTrusted: false
        )

        XCTAssertEqual(summary, "Ziel: Gang 4 links, 12 Meter entfernt. Route ab Standort. Position ungenau.")
    }

    func testMapSummaryAppendsUntrustedPositionWithoutTarget() {
        let summary = AccessibilityText.mapSummary(
            targetText: nil,
            distanceMeters: nil,
            routeOrigin: nil,
            positionTrusted: false
        )

        XCTAssertEqual(summary, "Kein Ziel gewählt. Position ungenau.")
    }

    // MARK: - productRowLabel

    func testProductRowLabelAppendsShelfText() {
        XCTAssertEqual(
            AccessibilityText.productRowLabel(name: "Milch", shelfText: "Regal 520/2/1/1"),
            "Milch, Regal 520/2/1/1"
        )
    }

    func testProductRowLabelFallsBackToNameWithoutShelf() {
        XCTAssertEqual(AccessibilityText.productRowLabel(name: "Milch", shelfText: nil), "Milch")
        XCTAssertEqual(AccessibilityText.productRowLabel(name: "Milch", shelfText: "  "), "Milch")
    }

    func testProductRowLabelTrimsName() {
        XCTAssertEqual(
            AccessibilityText.productRowLabel(name: " Milch ", shelfText: "Regal 520"),
            "Milch, Regal 520"
        )
    }

    // MARK: - productActionLabel

    func testProductActionLabelJoinsActionAndName() {
        XCTAssertEqual(AccessibilityText.productActionLabel("Einplanen", name: "Milch"), "Einplanen: Milch")
    }

    func testProductActionLabelFallsBackToActionWhenNameEmpty() {
        XCTAssertEqual(AccessibilityText.productActionLabel("Einplanen", name: ""), "Einplanen")
        XCTAssertEqual(AccessibilityText.productActionLabel("Einplanen", name: "   "), "Einplanen")
    }

    func testProductActionLabelTrimsActionAndName() {
        XCTAssertEqual(
            AccessibilityText.productActionLabel(" Einplanen ", name: " Milch "),
            "Einplanen: Milch"
        )
    }

    // MARK: - shoppingItemValue

    func testShoppingItemValueReflectsCheckedState() {
        XCTAssertEqual(AccessibilityText.shoppingItemValue(isChecked: true), "Erledigt")
        XCTAssertEqual(AccessibilityText.shoppingItemValue(isChecked: false), "Offen")
    }

    // MARK: - stopMarkerLabel

    func testStopMarkerLabelIncludesNameAndActiveState() {
        XCTAssertEqual(
            AccessibilityText.stopMarkerLabel(index: 3, name: "Milch", isActive: true),
            "Stopp 3, Milch, aktuell"
        )
    }

    func testStopMarkerLabelWithoutNameOrActiveIsJustIndex() {
        XCTAssertEqual(AccessibilityText.stopMarkerLabel(index: 3, name: nil, isActive: false), "Stopp 3")
        XCTAssertEqual(AccessibilityText.stopMarkerLabel(index: 3, name: "  ", isActive: false), "Stopp 3")
    }

    func testStopMarkerLabelWithNameButInactive() {
        XCTAssertEqual(
            AccessibilityText.stopMarkerLabel(index: 3, name: "Milch", isActive: false),
            "Stopp 3, Milch"
        )
    }

    func testStopMarkerLabelActiveWithoutName() {
        XCTAssertEqual(
            AccessibilityText.stopMarkerLabel(index: 3, name: nil, isActive: true),
            "Stopp 3, aktuell"
        )
    }
}
