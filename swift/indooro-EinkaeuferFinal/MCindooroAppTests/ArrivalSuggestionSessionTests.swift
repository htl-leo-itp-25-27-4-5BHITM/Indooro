import XCTest
import IndooroNavigation
@testable import MCindooroApp

/// Ankunftsvorschlag auf Session-Ebene: Ticks rein, Vorschlag/Zaehler raus. Erledigt wird nie hier.
@MainActor
final class ArrivalSuggestionSessionTests: XCTestCase {
    private let plan = [
        NavigationStop(id: "s1", title: "Gang 2 – Molkereiprodukte", mapPoint: SIMD2<Float>(10, 10)),
        NavigationStop(id: "s2", title: "Gang 3 – Brot & Backwaren", mapPoint: SIMD2<Float>(40, 10)),
    ]
    /// 1 m vom ersten Stopp entfernt (innerhalb des Radius von 3 m).
    private let nearFirstStop = SIMD2<Float>(10, 11)
    private let farAway = SIMD2<Float>(100, 100)

    private func makeSession(positioningEnabled: Bool = true) -> NavigationSession {
        let session = NavigationSession(
            arrivalConfig: ArrivalSuggestionConfig(radiusMeters: 3, dwellSeconds: 5, suppressionSeconds: 30)
        )
        session.isArrivalPositioningEnabled = { positioningEnabled }
        return session
    }

    private func tick(
        _ session: NavigationSession,
        at time: TimeInterval,
        position: SIMD2<Float>? = nil,
        trusted: Bool = true
    ) {
        session.handle(NavigationSample(
            projectedPosition: position ?? nearFirstStop,
            confidence: 1,
            timestamp: time,
            isTrusted: trusted
        ))
    }

    /// Ticks jede Sekunde von `from` bis `to` (jeweils innerhalb der Lueckenregel).
    private func ticks(_ session: NavigationSession, from: Int, through: Int, position: SIMD2<Float>? = nil, trusted: Bool = true) {
        for second in from...through {
            tick(session, at: TimeInterval(second), position: position, trusted: trusted)
        }
    }

    private var firstSuggestion: ArrivalSuggestion {
        ArrivalSuggestion(stopID: "s1", title: "Gang 2 – Molkereiprodukte")
    }

    func testTrustedDwellNearActiveStopShowsSuggestionButDoesNotComplete() {
        let session = makeSession()
        session.startTour(plan: plan)

        ticks(session, from: 0, through: 4)
        XCTAssertNil(session.arrivalSuggestion, "vor Ablauf der Verweildauer kein Vorschlag")

        tick(session, at: 5)
        XCTAssertEqual(session.arrivalSuggestion, firstSuggestion)
        XCTAssertEqual(session.arrivalSuggestionShownCount, 1)
        XCTAssertEqual(session.activeStopID, "s1", "der Stopp bleibt offen, bis der Kunde bestaetigt")
        XCTAssertEqual(session.plan.map(\.id), ["s1", "s2"])
    }

    func testUntrustedPositionOrOhneOrtungNeverSuggests() {
        let untrusted = makeSession()
        untrusted.startTour(plan: plan)
        ticks(untrusted, from: 0, through: 10, trusted: false)
        XCTAssertNil(untrusted.arrivalSuggestion)
        XCTAssertEqual(untrusted.arrivalSuggestionShownCount, 0)

        let withoutPositioning = makeSession(positioningEnabled: false)
        withoutPositioning.startTour(plan: plan)
        ticks(withoutPositioning, from: 0, through: 10)
        XCTAssertNil(withoutPositioning.arrivalSuggestion)
        XCTAssertEqual(withoutPositioning.arrivalSuggestionShownCount, 0)
    }

    func testNoSuggestionOutsideTour() {
        let session = makeSession()
        ticks(session, from: 0, through: 10)
        XCTAssertNil(session.arrivalSuggestion)
    }

    func testAcceptClearsSuggestionAndLeavesCompletionToExistingPath() {
        let session = makeSession()
        session.startTour(plan: plan)
        ticks(session, from: 0, through: 5)
        XCTAssertEqual(session.arrivalSuggestion, firstSuggestion)

        let accepted = session.acceptArrivalSuggestion()

        XCTAssertEqual(accepted, firstSuggestion)
        XCTAssertNil(session.arrivalSuggestion)
        XCTAssertEqual(session.arrivalSuggestionAcceptedCount, 1)
        XCTAssertEqual(session.activeStopID, "s1", "Akzeptieren schliesst den Stopp nicht selbst")

        // Der Kunde steht weiter am Regal: fuer diesen Stopp kein zweiter Vorschlag.
        ticks(session, from: 6, through: 15)
        XCTAssertNil(session.arrivalSuggestion)
        XCTAssertEqual(session.arrivalSuggestionShownCount, 1)

        // Der bestehende Erledigt-Pfad rueckt auf den naechsten Stopp vor.
        session.stopCompleted()
        XCTAssertEqual(session.activeStopID, "s2")
    }

    func testRejectSuppressesSameStopForThirtySeconds() {
        let session = makeSession()
        session.startTour(plan: plan)
        ticks(session, from: 0, through: 5)
        XCTAssertEqual(session.arrivalSuggestion, firstSuggestion)

        session.rejectArrivalSuggestion()

        XCTAssertNil(session.arrivalSuggestion)
        XCTAssertEqual(session.arrivalSuggestionRejectedCount, 1)
        // Sperre: bis 5 s + 30 s = 35 s kein neuer Vorschlag, auch bei langer Verweildauer.
        ticks(session, from: 6, through: 34)
        XCTAssertNil(session.arrivalSuggestion)
        XCTAssertEqual(session.arrivalSuggestionShownCount, 1)

        // Nach der Sperre beginnt ein neuer Verweil-Lauf: Vorschlag frueheste bei 40 s.
        ticks(session, from: 35, through: 39)
        XCTAssertNil(session.arrivalSuggestion)
        tick(session, at: 40)
        XCTAssertEqual(session.arrivalSuggestion, firstSuggestion)
        XCTAssertEqual(session.arrivalSuggestionShownCount, 2)
    }

    func testLeavingRadiusWithdrawsSuggestion() {
        let session = makeSession()
        session.startTour(plan: plan)
        ticks(session, from: 0, through: 5)
        XCTAssertEqual(session.arrivalSuggestion, firstSuggestion)

        tick(session, at: 6, position: farAway)

        XCTAssertNil(session.arrivalSuggestion)
    }

    func testStopCompletedAndStopTourClearSuggestion() {
        let session = makeSession()
        session.startTour(plan: plan)
        ticks(session, from: 0, through: 5)
        XCTAssertNotNil(session.arrivalSuggestion)

        session.stopCompleted()
        XCTAssertNil(session.arrivalSuggestion)
        XCTAssertEqual(session.arrivalSuggestionShownCount, 1, "Zaehler bleiben beim Stopp-Wechsel erhalten")

        session.startTour(plan: plan)
        ticks(session, from: 6, through: 11)
        XCTAssertNotNil(session.arrivalSuggestion)

        session.stopTour()
        XCTAssertNil(session.arrivalSuggestion)
    }

    func testConfigCombinesDefaultsWithOptionalTuning() {
        let defaults = NavigationSession.arrivalSuggestionConfig(tuning: .init(radiusMeters: nil, dwellSeconds: nil))
        XCTAssertEqual(defaults, ArrivalSuggestionConfig(radiusMeters: 3, dwellSeconds: 5, suppressionSeconds: 30))

        let tuned = NavigationSession.arrivalSuggestionConfig(tuning: .init(radiusMeters: 4.5, dwellSeconds: 2))
        XCTAssertEqual(tuned, ArrivalSuggestionConfig(radiusMeters: 4.5, dwellSeconds: 2, suppressionSeconds: 30))
    }
}
