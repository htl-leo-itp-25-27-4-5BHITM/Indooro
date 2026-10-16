import XCTest
import simd
@testable import IndooroNavigationCore

/// Task 7.11: Session-Logik mit synthetischen Positionen und steuerbarer Uhr.
final class NavigationSessionTests: XCTestCase {
    private let tick: TimeInterval = 0.35

    /// Offenes 40 x 30 Raster ohne Regale: jede Position ist begehbar.
    private func openGraph() -> IndoorGraph {
        IndoorGraphBuilder.fromLayout(gridWidth: 40, gridHeight: 30, elements: [])
    }

    private func stop(_ id: String, _ x: Float, _ y: Float) -> NavigationStop {
        NavigationStop(id: id, title: id, mapPoint: SIMD2(x, y))
    }

    private struct Clock {
        var now: TimeInterval = 1000
        mutating func advance(_ seconds: TimeInterval) { now += seconds }
    }

    func testNoisyStationaryUpdatesNearTwoEquidistantStopsKeepActiveStopAndBuildNoRoute() {
        var core = NavigationSessionCore(graph: openGraph())
        let start = SIMD2<Float>(20.5, 15.5)
        core.seedPosition(start)
        core.startTour(plan: [stop("A", 10.5, 15.5), stop("B", 30.5, 15.5)])
        XCTAssertEqual(core.activeStopID, "A")
        let builds = core.routeBuildCount
        XCTAssertEqual(builds, 1)

        var rng = SplitMix64(seed: 5)
        var clock = Clock()
        for _ in 0..<Int(60 / tick) {
            clock.advance(tick)
            let noisy = start + SIMD2(Float(rng.nextGaussian(sigma: 0.8)), Float(rng.nextGaussian(sigma: 0.8)))
            core.positionUpdated(noisy, confidence: 0.9, at: clock.now)
        }
        XCTAssertEqual(core.activeStopID, "A")
        XCTAssertEqual(core.plan.map(\.id), ["A", "B"])
        XCTAssertEqual(core.routeBuildCount, builds)
    }

    func testShortDetourOfTwoSecondsCausesNoReroute() {
        var (core, clock) = tourOnStraightRoute()
        let builds = core.routeBuildCount
        // 2.0 s (6 Ticks) 6 m neben der Route, dann zurueck.
        for _ in 0..<6 {
            clock.advance(tick)
            core.positionUpdated(SIMD2(15.5, 21.5), confidence: 0.9, at: clock.now)
        }
        clock.advance(tick)
        core.positionUpdated(SIMD2(15.5, 15.5), confidence: 0.9, at: clock.now)
        for _ in 0..<20 {
            clock.advance(tick)
            core.positionUpdated(SIMD2(15.5, 15.5), confidence: 0.9, at: clock.now)
        }
        XCTAssertEqual(core.routeBuildCount, builds)
        XCTAssertNil(core.offRouteSince)
    }

    func testWrongAisleForTwoAndAHalfSecondsCausesExactlyOneRerouteToSameStop() {
        var (core, clock) = tourOnStraightRoute()
        let builds = core.routeBuildCount
        let order = core.plan.map(\.id)
        let wrong = SIMD2<Float>(15.5, 22.5)
        // 3.5 s in der falschen Gasse (Ticks 0.35 s).
        for _ in 0..<10 {
            clock.advance(tick)
            core.positionUpdated(wrong, confidence: 0.9, at: clock.now)
        }
        XCTAssertEqual(core.routeBuildCount, builds + 1)
        XCTAssertEqual(core.activeStopID, "A")
        XCTAssertEqual(core.plan.map(\.id), order)
        // Neue Route startet an der projizierten Position: weiteres Verweilen loest nichts mehr aus.
        for _ in 0..<30 {
            clock.advance(tick)
            core.positionUpdated(wrong, confidence: 0.9, at: clock.now)
        }
        XCTAssertEqual(core.routeBuildCount, builds + 1)
        XCTAssertEqual(core.activeRoute?.points.first, wrong)
    }

    func testLowConfidenceForTenSecondsAtSixMetersCausesNoReroute() {
        var (core, clock) = tourOnStraightRoute()
        let builds = core.routeBuildCount
        for _ in 0..<Int(10 / tick) {
            clock.advance(tick)
            core.positionUpdated(SIMD2(15.5, 21.5), confidence: 0.2, at: clock.now)
        }
        XCTAssertTrue(core.isLowConfidence)
        XCTAssertEqual(core.statusMessage, "Signal schwach - Kalibrierung empfohlen")
        XCTAssertEqual(core.routeBuildCount, builds)
        XCTAssertNotNil(core.activeRoute)
        XCTAssertNil(core.offRouteSince)
    }

    func testLowConfidenceHysteresis() {
        var core = NavigationSessionCore(graph: openGraph())
        core.confidenceUpdated(0.34)
        XCTAssertTrue(core.isLowConfidence)
        core.confidenceUpdated(0.45)
        XCTAssertTrue(core.isLowConfidence)
        core.confidenceUpdated(0.55)
        XCTAssertFalse(core.isLowConfidence)
        XCTAssertNil(core.statusMessage)
        core.confidenceUpdated(0.4)
        XCTAssertFalse(core.isLowConfidence)
    }

    func testJitterBackByOneAndAHalfMetersKeepsProgress() {
        var (core, clock) = tourOnStraightRoute()
        clock.advance(tick)
        core.positionUpdated(SIMD2(16.5, 15.5), confidence: 0.9, at: clock.now)
        let progress = core.routeProgress
        XCTAssertEqual(progress, 12, accuracy: 0.01)
        clock.advance(tick)
        core.positionUpdated(SIMD2(18.0, 15.5), confidence: 0.9, at: clock.now)
        XCTAssertEqual(core.routeProgress, progress, accuracy: 0.001)
    }

    func testTurningBackFourMetersLowersProgress() {
        var (core, clock) = tourOnStraightRoute()
        clock.advance(tick)
        core.positionUpdated(SIMD2(16.5, 15.5), confidence: 0.9, at: clock.now)
        let progress = core.routeProgress
        clock.advance(tick)
        core.positionUpdated(SIMD2(20.5, 15.5), confidence: 0.9, at: clock.now)
        XCTAssertEqual(core.routeProgress, progress - 4, accuracy: 0.001)
        XCTAssertEqual(core.maxRouteProgress, core.routeProgress, accuracy: 0.001)
    }

    func testRemainingRouteShrinksWithProgress() {
        var (core, clock) = tourOnStraightRoute()
        let total = core.remainingRouteLength
        clock.advance(tick)
        core.positionUpdated(SIMD2(22.5, 15.5), confidence: 0.9, at: clock.now)
        XCTAssertEqual(core.remainingRouteLength, total - 6, accuracy: 0.01)
        XCTAssertEqual(core.remainingRoutePolyline.first?.x ?? 0, 22.5, accuracy: 0.01)
        XCTAssertEqual(core.remainingRoutePolyline.last, SIMD2<Float>(5.5, 15.5))
    }

    func testManualCalibrationKeepsStopOrderAndRebuildsRouteToActiveStop() {
        var (core, _) = tourOnStraightRoute()
        let builds = core.routeBuildCount
        core.manualCalibration(at: SIMD2(12.5, 5.5))
        XCTAssertEqual(core.plan.map(\.id), ["A", "B"])
        XCTAssertEqual(core.activeStopID, "A")
        XCTAssertEqual(core.routeBuildCount, builds + 1)
        XCTAssertEqual(core.activeRoute?.points.first, SIMD2<Float>(12.5, 5.5))
        XCTAssertEqual(core.activeRoute?.points.last, SIMD2<Float>(5.5, 15.5))
    }

    func testSettingTheSameSingleTargetAgainDoesNotRebuildRoute() {
        var core = NavigationSessionCore(graph: openGraph())
        core.seedPosition(SIMD2(20.5, 15.5))
        core.setSingleTarget(SIMD2(5.5, 15.5))
        let builds = core.routeBuildCount
        XCTAssertEqual(builds, 1)
        for _ in 0..<5 { core.setSingleTarget(SIMD2(5.5, 15.5)) }
        XCTAssertEqual(core.routeBuildCount, builds)
        core.setSingleTarget(SIMD2(6.5, 15.5))
        XCTAssertEqual(core.routeBuildCount, builds + 1)
    }

    func testStopSkippedAdvancesToStoredNextStopEvenIfAnotherIsCloser() {
        var core = NavigationSessionCore(graph: openGraph())
        core.seedPosition(SIMD2(20.5, 15.5))
        core.startTour(plan: [stop("A", 5.5, 15.5), stop("B", 35.5, 15.5), stop("C", 21.5, 15.5)])
        core.stopSkipped()
        XCTAssertEqual(core.activeStopID, "B")
        XCTAssertEqual(core.plan.map(\.id), ["B", "C"])
        core.stopCompleted()
        core.stopCompleted()
        XCTAssertEqual(core.mode, .idle)
        XCTAssertNil(core.activeRoute)
    }

    func testListChangedKeepsActiveStopAndRouteWhenStopUnchanged() {
        var (core, _) = tourOnStraightRoute()
        let builds = core.routeBuildCount
        // Neue Planung ordnet B vor A und fuegt C hinzu: aktiver Stopp bleibt A.
        core.listChanged(plan: [stop("B", 30.5, 15.5), stop("A", 5.5, 15.5), stop("C", 20.5, 3.5)])
        XCTAssertEqual(core.activeStopID, "A")
        XCTAssertEqual(core.plan.map(\.id), ["A", "B", "C"])
        XCTAssertEqual(core.routeBuildCount, builds)
        // Aktiver Stopp ohne offene Artikel faellt weg: naechster Plan-Stopp wird aktiv, Route neu.
        core.listChanged(plan: [stop("B", 30.5, 15.5), stop("C", 20.5, 3.5)])
        XCTAssertEqual(core.activeStopID, "B")
        XCTAssertEqual(core.routeBuildCount, builds + 1)
    }

    func testReplanRequestedRebuildsRouteFromPosition() {
        var (core, _) = tourOnStraightRoute()
        let builds = core.routeBuildCount
        core.routeModeToggled(plan: [stop("A", 5.5, 15.5), stop("B", 30.5, 15.5)])
        XCTAssertEqual(core.routeBuildCount, builds)
        core.replanRequested(plan: [stop("B", 30.5, 15.5), stop("A", 5.5, 15.5)])
        XCTAssertEqual(core.activeStopID, "B")
        XCTAssertEqual(core.routeBuildCount, builds + 1)
    }

    func testLayoutChangedResetsRouteAndDropsSingleTarget() {
        var core = NavigationSessionCore(graph: openGraph())
        core.seedPosition(SIMD2(20.5, 15.5))
        core.setSingleTarget(SIMD2(5.5, 15.5))
        core.layoutChanged(graph: openGraph())
        XCTAssertEqual(core.mode, .idle)
        XCTAssertNil(core.activeRoute)

        core.startTour(plan: [stop("A", 5.5, 15.5)])
        core.layoutChanged(graph: openGraph())
        XCTAssertEqual(core.mode, .tour)
        XCTAssertNotNil(core.activeRoute)
        XCTAssertEqual(core.routeProgress, 0)
    }

    func testRouteWaitsForFirstPositionAndRouteToSameNodeIsNoRoute() {
        var core = NavigationSessionCore(graph: openGraph())
        core.setSingleTarget(SIMD2(5.5, 15.5))
        XCTAssertNil(core.activeRoute)
        core.positionUpdated(SIMD2(20.5, 15.5), confidence: 0.9, at: 1)
        XCTAssertNotNil(core.activeRoute)

        var same = NavigationSessionCore(graph: openGraph())
        same.seedPosition(SIMD2(5.6, 15.4))
        same.setSingleTarget(SIMD2(5.5, 15.5))
        XCTAssertNil(same.activeRoute)
    }

    func testPositionUpdatesNeverChangePlanOrActiveStop() {
        var (core, clock) = tourOnStraightRoute()
        let order = core.plan.map(\.id)
        var rng = SplitMix64(seed: 99)
        for _ in 0..<100 {
            clock.advance(tick)
            // Naeher an B als an A.
            let point = SIMD2<Float>(Float(28 + rng.nextUnit() * 2), 15.5)
            core.positionUpdated(point, confidence: 0.9, at: clock.now)
        }
        XCTAssertEqual(core.plan.map(\.id), order)
        XCTAssertEqual(core.activeStopID, "A")
    }

    // MARK: - Routenursprung ohne vertraute Position (Fallback)

    func testTourStartWithoutPositionBuildsRouteFromEntrance() {
        let graph = openGraph()
        var core = NavigationSessionCore(graph: graph, entrancePoint: SIMD2(2.5, 15.5))
        core.startTour(plan: [stop("A", 30.5, 15.5)])
        let projectedEntrance = WalkableProjector(graph: graph).project(SIMD2(2.5, 15.5))?.projectedPoint
        XCTAssertEqual(core.routeOriginKind, .entrance)
        XCTAssertNotNil(core.activeRoute)
        XCTAssertEqual(core.activeRoute?.points.first, projectedEntrance)
        XCTAssertEqual(core.routeBuildCount, 1)
        XCTAssertFalse(core.hasTrustedPosition)
    }

    func testCompletedStopWithoutPositionStartsNextRouteAtThatStop() {
        var core = NavigationSessionCore(graph: openGraph(), entrancePoint: SIMD2(2.5, 15.5))
        core.startTour(plan: [stop("A", 10.5, 15.5), stop("B", 30.5, 15.5)])
        core.stopCompleted()
        XCTAssertEqual(core.activeStopID, "B")
        XCTAssertEqual(core.routeOriginKind, .lastStop("A"))
        XCTAssertEqual(core.activeRoute?.points.first, SIMD2<Float>(10.5, 15.5))
    }

    func testSkippedStopGivesTheSameRouteOriginAsCompletedStop() {
        var core = NavigationSessionCore(graph: openGraph(), entrancePoint: SIMD2(2.5, 15.5))
        core.startTour(plan: [stop("A", 10.5, 15.5), stop("B", 30.5, 15.5)])
        core.stopSkipped()
        XCTAssertEqual(core.routeOriginKind, .lastStop("A"))
        XCTAssertEqual(core.activeRoute?.points.first, SIMD2<Float>(10.5, 15.5))
    }

    func testTrustedPositionRebuildsRouteExactlyOnceAndDropsFallback() {
        var core = NavigationSessionCore(graph: openGraph(), entrancePoint: SIMD2(2.5, 15.5))
        core.startTour(plan: [stop("A", 30.5, 15.5)])
        let builds = core.routeBuildCount
        XCTAssertEqual(core.routeOriginKind, .entrance)

        core.positionUpdated(SIMD2(20.5, 15.5), confidence: 0.9, at: 1)
        XCTAssertEqual(core.routeBuildCount, builds + 1)
        XCTAssertEqual(core.routeOriginKind, .position)
        XCTAssertNil(core.fallbackOrigin)
        XCTAssertTrue(core.hasTrustedPosition)
        XCTAssertEqual(core.activeRoute?.points.first, SIMD2<Float>(20.5, 15.5))

        for step in 1...5 {
            core.positionUpdated(SIMD2(20.5 + Float(step), 15.5), confidence: 0.9, at: 1 + Double(step) * tick)
        }
        XCTAssertEqual(core.routeBuildCount, builds + 1)
    }

    func testLayoutWithoutEntranceAndWithoutCompletedStopDrawsNoRouteAndNoError() {
        var core = NavigationSessionCore(graph: openGraph())
        core.startTour(plan: [stop("A", 30.5, 15.5)])
        XCTAssertNil(core.activeRoute)
        XCTAssertEqual(core.routeOriginKind, .position)
        core.tickUpdated(projected: nil, confidence: 0.9, at: 1)
        XCTAssertNil(core.activeRoute)
        core.positionUpdated(SIMD2(20.5, 15.5), confidence: 0.9, at: 2)
        XCTAssertNotNil(core.activeRoute)
    }

    func testUntrustedSeedProvidesNoRouteOrigin() {
        var core = NavigationSessionCore(graph: openGraph(), entrancePoint: SIMD2(2.5, 15.5))
        core.seedPosition(SIMD2(20.5, 15.5), trusted: false)
        core.startTour(plan: [stop("A", 30.5, 15.5)])
        XCTAssertNil(core.lastPosition)
        XCTAssertFalse(core.hasTrustedPosition)
        XCTAssertEqual(core.routeOriginKind, .entrance)
    }

    func testLostTrustKeepsProgressAndRouteAndNextStopUsesLastStopAgain() {
        var core = NavigationSessionCore(graph: openGraph(), entrancePoint: SIMD2(2.5, 15.5))
        core.seedPosition(SIMD2(20.5, 15.5))
        core.startTour(plan: [stop("A", 10.5, 15.5), stop("B", 30.5, 15.5)])
        core.positionUpdated(SIMD2(18.5, 15.5), confidence: 0.9, at: 1)
        let route = core.activeRoute
        let progress = core.routeProgress

        // Vertrauen verloren: Position weit ab der Route, aber nicht vertraut.
        core.positionUpdated(SIMD2(5.5, 15.5), confidence: 0.9, at: 2, trusted: false)
        XCTAssertFalse(core.hasTrustedPosition)
        XCTAssertEqual(core.activeRoute, route)
        XCTAssertEqual(core.routeProgress, progress)
        XCTAssertEqual(core.lastPosition, SIMD2<Float>(18.5, 15.5))
        XCTAssertNil(core.offRouteSince)

        core.stopCompleted()
        XCTAssertEqual(core.activeStopID, "B")
        XCTAssertEqual(core.routeOriginKind, .lastStop("A"))
        XCTAssertEqual(core.activeRoute?.points.first, SIMD2<Float>(10.5, 15.5))
    }

    // MARK: - Zaehler (Section 10.1/10.2)

    func testRerouteCounterCountsOnlyOffRouteRebuilds() {
        var (core, clock) = tourOnStraightRoute()
        let reroutesBefore = core.rerouteCount
        let wrong = SIMD2<Float>(15.5, 22.5)
        for _ in 0..<10 {
            clock.advance(tick)
            core.positionUpdated(wrong, confidence: 0.9, at: clock.now)
        }
        XCTAssertEqual(core.rerouteCount, reroutesBefore + 1)
    }

    func testStopCompletedAndPositionsKeepStopChangeCounterAtZeroAndRouteCounterMonotone() {
        var (core, clock) = tourOnStraightRoute()
        var builds = core.routeBuildCount
        for _ in 0..<20 {
            clock.advance(tick)
            core.positionUpdated(SIMD2(25.5, 15.5), confidence: 0.9, at: clock.now)
            XCTAssertGreaterThanOrEqual(core.routeBuildCount, builds)
            builds = core.routeBuildCount
        }
        core.stopCompleted()
        XCTAssertEqual(core.activeStopID, "B")
        XCTAssertGreaterThanOrEqual(core.routeBuildCount, builds)
        XCTAssertEqual(core.stopChangeWithoutEventCount, 0)
        XCTAssertEqual(core.manualPositionCount, 0)
    }

    func testManualCalibrationCountsOnceAndBuildsExactlyOneRoute() {
        var (core, _) = tourOnStraightRoute()
        let builds = core.routeBuildCount
        core.manualCalibration(at: SIMD2(12.5, 5.5))
        XCTAssertEqual(core.manualPositionCount, 1)
        XCTAssertEqual(core.routeBuildCount, builds + 1)
        XCTAssertTrue(core.hasTrustedPosition)
        XCTAssertEqual(core.routeOriginKind, .position)
    }

    // MARK: - Helpers

    /// Tour A (5.5/15.5) vor B (30.5/15.5), Start bei 28.5/15.5: gerade Route nach links.
    private func tourOnStraightRoute() -> (NavigationSessionCore, Clock) {
        var core = NavigationSessionCore(graph: openGraph())
        core.seedPosition(SIMD2(28.5, 15.5))
        core.startTour(plan: [stop("A", 5.5, 15.5), stop("B", 30.5, 15.5)])
        return (core, Clock())
    }
}
