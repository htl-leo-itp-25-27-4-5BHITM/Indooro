import IndooroModels
import XCTest
import simd
@testable import IndooroNavigationCore
@testable import IndooroNavigation

/// Ankunftsvorschlag (add-arrival-suggestion): Unit-Tests der Detektor-Regeln und Replay gegen die Pipeline.
final class ArrivalSuggestionDetectorTests: XCTestCase {
    private typealias Event = ArrivalSuggestionDetector.Event

    private let stopPoint = SIMD2<Float>(10, 10)
    private let near = SIMD2<Float>(11, 10)   // 1 m vom Stopp
    private let far = SIMD2<Float>(20, 10)    // 10 m vom Stopp

    private func makeDetector(
        radius: Float = 3,
        dwell: TimeInterval = 5,
        suppression: TimeInterval = 30
    ) -> ArrivalSuggestionDetector {
        ArrivalSuggestionDetector(config: ArrivalSuggestionConfig(
            radiusMeters: radius, dwellSeconds: dwell, suppressionSeconds: suppression
        ))
    }

    /// Fuettert Samples von `from` bis `to` (inklusive) im Abstand `step`; liefert alle Ereignisse mit Zeitpunkt.
    @discardableResult
    private func feed(
        _ detector: inout ArrivalSuggestionDetector,
        from: TimeInterval,
        to: TimeInterval,
        step: TimeInterval = 0.5,
        position: SIMD2<Float>? = SIMD2<Float>(11, 10),
        trusted: Bool = true,
        enabled: Bool = true,
        active: String? = "A",
        stop: SIMD2<Float> = SIMD2<Float>(10, 10)
    ) -> [(time: TimeInterval, event: Event)] {
        var events: [(TimeInterval, Event)] = []
        var t = from
        while t <= to + 1e-9 {
            if let event = detector.update(
                position: position,
                trusted: trusted,
                positioningEnabled: enabled,
                activeStopID: active,
                stopPoint: stop,
                at: t
            ) {
                events.append((t, event))
            }
            t += step
        }
        return events
    }

    // MARK: - Spec-Szenario

    func testStandingWithinRadiusSuggestsAtDwellNotBefore() {
        var detector = makeDetector()
        let events = feed(&detector, from: 0, to: 6, position: near)

        XCTAssertEqual(events.count, 1, "genau ein Vorschlag, auch wenn der Kunde weiter steht")
        XCTAssertEqual(events.first?.time, 5.0)
        XCTAssertEqual(events.first?.event, .shown(stopID: "A"))
        XCTAssertEqual(detector.pendingStopID, "A")
        XCTAssertEqual(detector.counters.shown, 1)
        XCTAssertEqual(detector.counters.accepted, 0)
        XCTAssertEqual(detector.counters.rejected, 0)
    }

    func testRadiusComparisonIsInclusive() {
        var detector = makeDetector(radius: 3)
        let edge = SIMD2<Float>(13, 10) // genau 3 m
        let events = feed(&detector, from: 0, to: 6, position: edge)
        XCTAssertEqual(events.first?.time, 5.0)
    }

    // MARK: - Vertrauen, Ortung, Position

    func testUntrustedPositionNeverSuggests() {
        var detector = makeDetector()
        let events = feed(&detector, from: 0, to: 60, position: near, trusted: false)
        XCTAssertTrue(events.isEmpty)
        XCTAssertNil(detector.pendingStopID)
        XCTAssertEqual(detector.counters.shown, 0)
    }

    func testOhneOrtungNeverSuggests() {
        var detector = makeDetector()
        let events = feed(&detector, from: 0, to: 60, position: near, enabled: false)
        XCTAssertTrue(events.isEmpty)
        XCTAssertEqual(detector.counters.shown, 0)
    }

    func testNilPositionResetsDwell() {
        var detector = makeDetector()
        feed(&detector, from: 0, to: 4, position: near)
        feed(&detector, from: 4.5, to: 4.5, position: nil)
        // Dwell beginnt neu bei 5.0; Vorschlag erst bei 10.0.
        let events = feed(&detector, from: 5, to: 12, position: near)
        XCTAssertEqual(events.first?.time, 10.0)
    }

    // MARK: - Radius verlassen

    func testLeavingRadiusResetsDwell() {
        var detector = makeDetector()
        feed(&detector, from: 0, to: 3, position: near)
        feed(&detector, from: 3.5, to: 3.5, position: far)
        // Neuer Lauf ab 4.0: Vorschlag erst bei 9.0, nicht bei 5.0.
        let events = feed(&detector, from: 4, to: 12, position: near)
        XCTAssertEqual(events.first?.time, 9.0)
        XCTAssertEqual(events.count, 1)
    }

    func testLeavingRadiusWithdrawsPendingSuggestion() {
        var detector = makeDetector()
        feed(&detector, from: 0, to: 5, position: near)
        XCTAssertEqual(detector.pendingStopID, "A")

        let event = detector.update(position: far, trusted: true, positioningEnabled: true,
                                    activeStopID: "A", stopPoint: stopPoint, at: 5.5)
        XCTAssertEqual(event, .withdrawn(stopID: "A"))
        XCTAssertNil(detector.pendingStopID)
        XCTAssertEqual(detector.counters.shown, 1, "Zurueckziehen zaehlt nicht als Ablehnung")
        XCTAssertEqual(detector.counters.rejected, 0)
    }

    // MARK: - Ablehnen und Sperre

    func testRejectSuppressesForThirtySecondsThenRearmsAfterNewDwell() {
        var detector = makeDetector()
        let first = feed(&detector, from: 0, to: 5, position: near)
        XCTAssertEqual(first.map { $0.time }, [5.0])

        detector.reject(at: 5.0)
        XCTAssertNil(detector.pendingStopID)
        XCTAssertEqual(detector.counters.rejected, 1)

        // Kunde bleibt stehen: keine Vorschlaege waehrend der 30 s (bis 35.0).
        let during = feed(&detector, from: 5.5, to: 34.5, position: near)
        XCTAssertTrue(during.isEmpty)

        // Nach Ende der Sperre wird der Dwell von null neu gesammelt: Vorschlag bei 40.0, nicht bei 35.0.
        let after = feed(&detector, from: 35, to: 45, position: near)
        XCTAssertEqual(after.map { $0.time }, [40.0])
        XCTAssertEqual(detector.counters.shown, 2)
    }

    func testRejectSuppressionIsPerStop() {
        var detector = makeDetector()
        feed(&detector, from: 0, to: 5, position: near, active: "A")
        detector.reject(at: 5.0)
        // Anderer Stopp am selben Ort ist nicht gesperrt.
        let events = feed(&detector, from: 5.5, to: 11, position: near, active: "B")
        XCTAssertEqual(events.first?.event, .shown(stopID: "B"))
    }

    // MARK: - Akzeptieren

    func testAcceptIncrementsCountersClearsPendingAndDoesNotReshowSameStop() {
        var detector = makeDetector()
        feed(&detector, from: 0, to: 5, position: near)
        detector.accept()

        XCTAssertNil(detector.pendingStopID)
        XCTAssertEqual(detector.counters.accepted, 1)
        XCTAssertEqual(detector.counters.shown, 1)
        XCTAssertEqual(detector.counters.rejected, 0)

        // Der Aufrufer schaltet den Stopp erst danach um; bis dahin kein zweiter Vorschlag.
        let events = feed(&detector, from: 5.5, to: 30, position: near)
        XCTAssertTrue(events.isEmpty)
    }

    func testAcceptWithoutPendingHasNoEffect() {
        var detector = makeDetector()
        detector.accept()
        XCTAssertEqual(detector.counters, ArrivalSuggestionCounters())
    }

    // MARK: - Stopp-Wechsel

    func testActiveStopChangeWithdrawsPendingForOldStop() {
        var detector = makeDetector()
        feed(&detector, from: 0, to: 5, position: near, active: "A")
        let event = detector.update(position: near, trusted: true, positioningEnabled: true,
                                    activeStopID: "B", stopPoint: SIMD2(40, 40), at: 5.5)
        XCTAssertEqual(event, .withdrawn(stopID: "A"))
        XCTAssertNil(detector.pendingStopID)
    }

    func testActiveStopChangeResetsDwellForNewStop() {
        var detector = makeDetector()
        // Drei Sekunden bei A, dann wechselt der aktive Stopp zu B am selben Ort.
        feed(&detector, from: 0, to: 3, position: near, active: "A")
        let events = feed(&detector, from: 3.5, to: 10, position: near, active: "B")
        XCTAssertEqual(events.first?.time, 8.5)
        XCTAssertEqual(events.first?.event, .shown(stopID: "B"))
    }

    // MARK: - Sample-Luecken

    func testGapOfExactlyThreeSecondsIsNotABreak() {
        var detector = makeDetector()
        feed(&detector, from: 0, to: 3, position: near)
        let events = feed(&detector, from: 6, to: 6, position: near)
        // Dwell laeuft weiter ab 0.0: 6.0 - 0.0 >= 5.
        XCTAssertEqual(events.map { $0.time }, [6.0])
    }

    func testGapOverThreeSecondsResetsDwell() {
        var detector = makeDetector()
        feed(&detector, from: 0, to: 3, position: near)
        // 4 s ohne Sample: die letzte Messung im Radius ist veraltet.
        let stale = feed(&detector, from: 7, to: 7, position: near)
        XCTAssertTrue(stale.isEmpty)
        let events = feed(&detector, from: 7.5, to: 20, position: near)
        XCTAssertEqual(events.first?.time, 12.0)
    }

    // MARK: - Zaehler und Reset

    func testCountersAcrossShownRejectedAndAccepted() {
        var detector = makeDetector()
        feed(&detector, from: 0, to: 5, position: near)        // shown 1
        detector.reject(at: 5)                                  // rejected 1
        feed(&detector, from: 35, to: 40, position: near)      // shown 2
        detector.accept()                                       // accepted 1
        feed(&detector, from: 41, to: 60, position: far)       // kein Vorschlag, keine Zaehler

        XCTAssertEqual(detector.counters.shown, 2)
        XCTAssertEqual(detector.counters.accepted, 1)
        XCTAssertEqual(detector.counters.rejected, 1)
    }

    func testResetKeepsCountersAndDropsPendingAndSuppression() {
        var detector = makeDetector()
        feed(&detector, from: 0, to: 5, position: near)
        detector.reject(at: 5)
        feed(&detector, from: 5.5, to: 10, position: near, active: "A")
        detector.reset()

        XCTAssertNil(detector.pendingStopID)
        XCTAssertEqual(detector.counters.shown, 1)
        XCTAssertEqual(detector.counters.rejected, 1)
        // Sperre ist weg: der Dwell beginnt sofort neu.
        let events = feed(&detector, from: 11, to: 16, position: near, active: "A")
        XCTAssertEqual(events.first?.time, 16.0)
    }

    // MARK: - Konfiguration

    func testDefaultsUseMeasuredMedianAboveFloor() {
        let config = ArrivalSuggestionConfig.defaults(measuredMedianErrorMeters: 4.2)
        XCTAssertEqual(config.radiusMeters, 4.2, accuracy: 1e-5)
        XCTAssertEqual(config.dwellSeconds, 5)
        XCTAssertEqual(config.suppressionSeconds, 30)
    }

    func testDefaultsWithoutMeasurementUseFloor() {
        XCTAssertEqual(ArrivalSuggestionConfig.defaults().radiusMeters, 3)
        XCTAssertEqual(ArrivalSuggestionConfig.defaults(measuredMedianErrorMeters: nil).radiusMeters, 3)
    }

    func testDefaultsBelowFloorStayAtFloor() {
        XCTAssertEqual(ArrivalSuggestionConfig.defaults(measuredMedianErrorMeters: 1.5).radiusMeters, 3)
    }

    func testDetectorDefaultInitUsesDefaultsConfig() {
        let detector = ArrivalSuggestionDetector()
        XCTAssertEqual(detector.config, ArrivalSuggestionConfig.defaults())
    }

    // MARK: - Replay gegen die Positionierungs-Pipeline

    private func layout() throws -> LayoutData {
        try TestLayouts.demoSupermarket(beaconSpacing: 8)
    }

    /// Spielt eine Aufzeichnung durch `NavigationReplay` und liefert je Tick Position und Vertrauen.
    private func replayTicks(_ lines: [NavigationRecordLine], layout: LayoutData) throws -> [ReplayTick] {
        let recording = try NavigationRecordLine.parse(jsonl: NavigationRecordLine.jsonl(lines))
        var ticks: [ReplayTick] = []
        _ = NavigationReplay.run(recording: recording, layout: layout, onTick: { ticks.append($0) })
        return ticks
    }

    /// Vertrauen wie die Session: vorhandene Projektion und Konfidenz oberhalb der Low-Schwelle.
    private func trusted(_ tick: ReplayTick) -> Bool {
        tick.projected != nil && tick.confidence >= StabilizedNavigationConfig.default.confidence.lowThreshold
    }

    private func replayDetector(
        _ ticks: [ReplayTick],
        activeStopID: String,
        stopPoint: SIMD2<Float>
    ) -> (events: [(time: TimeInterval, event: Event)], detector: ArrivalSuggestionDetector) {
        var detector = ArrivalSuggestionDetector()
        var events: [(TimeInterval, Event)] = []
        for tick in ticks {
            if let event = detector.update(
                position: tick.projected,
                trusted: trusted(tick),
                positioningEnabled: true,
                activeStopID: activeStopID,
                stopPoint: stopPoint,
                at: tick.t
            ) {
                events.append((tick.t, event))
            }
        }
        return (events, detector)
    }

    func testReplayPausingAtStopSuggestsOnceWhileWalkingPastOtherStopDoesNot() throws {
        let layout = try layout()
        let shelfA = SIMD2<Float>(8.5, 9.5)

        // Szenario 1: Kunde geht zu A und bleibt dort stehen.
        var pause = SyntheticRecording(layout: layout, seed: 404)
        pause.event(.startTour, plan: [RecordedStop(id: "A", title: "A", x: shelfA.x, y: shelfA.y)])
        pause.walk([SIMD2(2.5, 9.5), shelfA], speed: 1.2)
        let arrival = pause.clock
        pause.stand(at: shelfA, seconds: 20)

        let pauseTicks = try replayTicks(pause.lines, layout: layout)
        let pauseRun = replayDetector(pauseTicks, activeStopID: "A", stopPoint: shelfA)

        XCTAssertEqual(pauseRun.events.count, 1, "genau ein Vorschlag beim Verweilen")
        XCTAssertEqual(pauseRun.events.first?.event, .shown(stopID: "A"))
        XCTAssertEqual(pauseRun.detector.counters.shown, 1)
        XCTAssertEqual(pauseRun.detector.pendingStopID, "A")

        // Der Vorschlag kommt erst nach dem Betreten des Radius (3 m) und nach 5 s Verweildauer.
        let firstInside = try XCTUnwrap(pauseTicks.first { tick in
            guard trusted(tick), let projected = tick.projected else { return false }
            return simd_length(projected - shelfA) <= 3
        }?.t)
        let shownAt = try XCTUnwrap(pauseRun.events.first?.time)
        XCTAssertGreaterThanOrEqual(shownAt - firstInside, 5.0 - 1e-6)
        XCTAssertLessThan(shownAt - firstInside, 5.0 + 0.35 + 1e-6)
        XCTAssertGreaterThanOrEqual(shownAt, arrival, "Vorschlag erst beim Stehen am Regal")

        // Szenario 2: Kunde laeuft an B vorbei, der aktive Stopp ist A (weit entfernt).
        let stopA = SIMD2<Float>(30.5, 26.5)
        let shelfB = SIMD2<Float>(16.5, 9.5)
        var walk = SyntheticRecording(layout: layout, seed: 505)
        walk.event(.startTour, plan: [
            RecordedStop(id: "A", title: "A", x: stopA.x, y: stopA.y),
            RecordedStop(id: "B", title: "B", x: shelfB.x, y: shelfB.y)
        ])
        walk.walk([SIMD2(2.5, 9.5), SIMD2(30.5, 9.5)], speed: 1.2)

        let walkTicks = try replayTicks(walk.lines, layout: layout)
        let passedB = walkTicks.contains { tick in
            guard trusted(tick), let projected = tick.projected else { return false }
            return simd_length(projected - shelfB) <= 3
        }
        XCTAssertTrue(passedB, "Replay muss B tatsaechlich passieren")

        let walkRun = replayDetector(walkTicks, activeStopID: "A", stopPoint: stopA)
        XCTAssertTrue(walkRun.events.isEmpty)
        XCTAssertEqual(walkRun.detector.counters.shown, 0)
    }
}
