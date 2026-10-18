import IndooroModels
import XCTest
import simd
@testable import IndooroNavigationCore

/// improve-positioning-with-motion (Gruppe 2-3): Tracker, Schaetzer-Bewegungsdaten und das Replay mit
/// `motionAided`. Synthetische Laeufe mit Schritt- und Kompasszeilen; Erwartungen siehe Kommentare.
final class MotionAidedTests: XCTestCase {
    private let tick = 0.35

    private func layout() throws -> LayoutData {
        try TestLayouts.demoSupermarket(beaconSpacing: 8)
    }

    private func roundTrip(_ lines: [NavigationRecordLine]) throws -> [NavigationRecordLine] {
        try NavigationRecordLine.parse(jsonl: NavigationRecordLine.jsonl(lines))
    }

    private func stop(_ id: String, _ x: Float, _ y: Float) -> RecordedStop {
        RecordedStop(id: id, title: id, x: x, y: y)
    }

    /// Replay mit oder ohne Flag; liefert Metriken und alle Ticks.
    private func replay(
        _ lines: [NavigationRecordLine],
        layout: LayoutData,
        motionAided: Bool
    ) throws -> (metrics: ReplayMetrics, ticks: [ReplayTick]) {
        var config = StabilizedNavigationConfig.default
        config.motion.motionAided = motionAided
        var ticks: [ReplayTick] = []
        let metrics = NavigationReplay.run(
            recording: try roundTrip(lines),
            layout: layout,
            config: config,
            onTick: { ticks.append($0) }
        )
        return (metrics, ticks)
    }

    /// Schrittzeilen (kumulativ ab `t0`) fuer Gehen mit `speed` m/s bis `end`; optional Kompasszeilen mit fester Peilung.
    private func motionLines(
        from t0: TimeInterval,
        to end: TimeInterval,
        speed: Double,
        bearingDegrees: Double?
    ) -> [NavigationRecordLine] {
        let rate = speed / 0.7
        var lines: [NavigationRecordLine] = []
        for t in stride(from: t0, through: end, by: 0.1) {
            let steps = Int(((t - t0) * rate).rounded(.down))
            lines.append(.step(StepRecord(t: t, steps: steps, distance: nil, source: "pedometer")))
        }
        if let bearingDegrees {
            for t in stride(from: t0, through: end, by: 0.5) {
                lines.append(.heading(HeadingRecord(t: t, degrees: bearingDegrees, accuracy: 10, source: "compass")))
            }
        }
        return lines
    }

    /// Ein Schrittzaehler-Basiswert ohne Schritte (Stillstand ab `t0`).
    private func constantSteps(at t0: TimeInterval) -> [NavigationRecordLine] {
        [.step(StepRecord(t: t0, steps: 0, distance: nil, source: "pedometer"))]
    }

    private func firstTime(_ lines: [NavigationRecordLine]) -> TimeInterval {
        lines.map(\.timestamp).min() ?? 0
    }

    /// Pfadlaenge der projizierten Positionen ab `seconds` nach dem ersten Tick.
    private func pathLength(_ ticks: [ReplayTick], afterSeconds seconds: Double) -> Double {
        guard let first = ticks.first?.t else { return 0 }
        let points = ticks.filter { $0.t - first >= seconds }.compactMap(\.projected)
        return zip(points, points.dropFirst()).reduce(0.0) { $0 + Double(simd_length($1.1 - $1.0)) }
    }

    private func pathLength(_ points: [SIMD2<Float>]) -> Float {
        zip(points, points.dropFirst()).reduce(Float(0)) { $0 + simd_length($1.1 - $1.0) }
    }

    // MARK: - 1. MotionTracker

    func testTrackerIsUnknownWithoutStepData() {
        let tracker = MotionTracker(config: MotionConfig())
        XCTAssertNil(tracker.isStanding(at: 0))
        XCTAssertFalse(tracker.hasStepData)
        XCTAssertEqual(tracker.consumeNewSteps(), 0)
    }

    func testTrackerStandingStartsAfterStandingThreshold() {
        let tracker = MotionTracker(config: MotionConfig())
        tracker.recordStep(cumulativeSteps: 0, at: 0)
        XCTAssertEqual(tracker.isStanding(at: 1.4), false)
        XCTAssertEqual(tracker.isStanding(at: 1.5), true)
    }

    func testTrackerNewStepResetsStanding() {
        let tracker = MotionTracker(config: MotionConfig())
        tracker.recordStep(cumulativeSteps: 0, at: 0)
        XCTAssertEqual(tracker.isStanding(at: 3), true)
        tracker.recordStep(cumulativeSteps: 1, at: 2.0)
        XCTAssertEqual(tracker.isStanding(at: 3.4), false)
        XCTAssertEqual(tracker.isStanding(at: 3.5), true)
    }

    func testTrackerConsumesNewStepsOnlyOnce() {
        let tracker = MotionTracker(config: MotionConfig())
        tracker.recordStep(cumulativeSteps: 0, at: 0)
        tracker.recordStep(cumulativeSteps: 3, at: 1)
        XCTAssertEqual(tracker.consumeNewSteps(), 3)
        XCTAssertEqual(tracker.consumeNewSteps(), 0)
        tracker.recordStep(cumulativeSteps: 5, at: 2)
        XCTAssertEqual(tracker.consumeNewSteps(), 2)
    }

    func testTrackerCounterResetRebasesWithoutLosingTheStanding() {
        let tracker = MotionTracker(config: MotionConfig())
        tracker.recordStep(cumulativeSteps: 0, at: 0)
        tracker.recordStep(cumulativeSteps: 4, at: 1)
        // Zaehler faellt auf 1: ausstehende Schritte verfallen, Basis ist neu.
        tracker.recordStep(cumulativeSteps: 1, at: 2)
        XCTAssertEqual(tracker.consumeNewSteps(), 0)
        XCTAssertEqual(tracker.isStanding(at: 3.4), false)
        XCTAssertEqual(tracker.isStanding(at: 3.5), true)
        tracker.recordStep(cumulativeSteps: 3, at: 3)
        XCTAssertEqual(tracker.consumeNewSteps(), 2)
    }

    func testTrackerHeadingMapsBearingToMapDirection() throws {
        let tracker = MotionTracker(config: MotionConfig())
        // Nord (0 Grad) zeigt auf der Karte nach oben (-y), Ost (90 Grad) nach rechts (+x).
        tracker.recordHeading(bearingDegrees: 0, accuracy: 10, at: 0)
        let north = try XCTUnwrap(tracker.headingDirection(at: 0))
        XCTAssertEqual(north.x, 0, accuracy: 1e-5)
        XCTAssertEqual(north.y, -1, accuracy: 1e-5)

        tracker.recordHeading(bearingDegrees: 90, accuracy: 10, at: 1)
        let east = try XCTUnwrap(tracker.headingDirection(at: 1))
        XCTAssertEqual(east.x, 1, accuracy: 1e-5)
        XCTAssertEqual(east.y, 0, accuracy: 1e-5)
    }

    func testTrackerRejectsInaccurateHeadingAndClearsPreviousOne() {
        let tracker = MotionTracker(config: MotionConfig())
        tracker.recordHeading(bearingDegrees: 90, accuracy: 10, at: 0)
        XCTAssertNotNil(tracker.headingDirection(at: 0))

        tracker.recordHeading(bearingDegrees: 90, accuracy: 40, at: 0.5)
        XCTAssertNil(tracker.headingDirection(at: 0.5))

        tracker.recordHeading(bearingDegrees: 90, accuracy: 10, at: 0.5)
        tracker.recordHeading(bearingDegrees: 90, accuracy: -1, at: 0.6)
        XCTAssertNil(tracker.headingDirection(at: 0.6))
    }

    func testTrackerHeadingExpiresAfterMaxAge() {
        let tracker = MotionTracker(config: MotionConfig())
        tracker.recordHeading(bearingDegrees: 90, accuracy: 10, at: 0)
        XCTAssertNotNil(tracker.headingDirection(at: 2.0))
        XCTAssertNil(tracker.headingDirection(at: 2.01))
    }

    // MARK: - 2. PoseFusionService

    /// Verrauschte Folge mit jedem 17. Punkt als Ausreisser (+15 m in x).
    private func noisyTrack(count: Int, speed: Float, seed: UInt64) -> [(time: TimeInterval, point: SIMD2<Float>)] {
        var rng = SplitMix64(seed: seed)
        return (0..<count).map { index -> (time: TimeInterval, point: SIMD2<Float>) in
            let time = Double(index) * 0.35
            let truth = SIMD2<Float>(5 + speed * Float(time), 5)
            let noise = SIMD2<Float>(Float(rng.nextGaussian(sigma: 0.4)), Float(rng.nextGaussian(sigma: 0.4)))
            let outlier = index % 17 == 16 ? SIMD2<Float>(15, 0) : .zero
            return (time: time, point: truth + noise + outlier)
        }
    }

    func testPoseFusionNilMotionAidIsIdenticalToCallWithoutArgument() {
        let samples = noisyTrack(count: 200, speed: 1.3, seed: 5)
        let plainService = PoseFusionService(config: StabilizedNavigationConfig.default.poseFusion)
        let nilService = PoseFusionService(config: StabilizedNavigationConfig.default.poseFusion)
        let defaultService = PoseFusionService(config: StabilizedNavigationConfig.default.poseFusion)
        var plain: [SIMD2<Float>] = []
        var withNil: [SIMD2<Float>] = []
        var withDefault: [SIMD2<Float>] = []
        for sample in samples {
            if let estimate = plainService.update(solvedPoint: sample.point, confidence: 0.8, timestamp: sample.time) {
                plain.append(estimate.point)
            }
            if let estimate = nilService.update(solvedPoint: sample.point, confidence: 0.8, timestamp: sample.time, motion: nil) {
                withNil.append(estimate.point)
            }
            if let estimate = defaultService.update(
                solvedPoint: sample.point, confidence: 0.8, timestamp: sample.time, motion: MotionAid()
            ) {
                withDefault.append(estimate.point)
            }
        }
        XCTAssertEqual(plain.count, samples.count)
        XCTAssertEqual(withNil, plain)
        XCTAssertEqual(withDefault, plain)
    }

    func testMotionAidDampingReducesEstimatePathUnderNoise() {
        // Stillstand mit Rauschen: die gedaempfte Alpha bewegt den Schaetzer weniger.
        let samples = noisyTrack(count: 150, speed: 0, seed: 9)
        let freeService = PoseFusionService(config: StabilizedNavigationConfig.default.poseFusion)
        let dampedService = PoseFusionService(config: StabilizedNavigationConfig.default.poseFusion)
        var free: [SIMD2<Float>] = []
        var damped: [SIMD2<Float>] = []
        for sample in samples {
            if let estimate = freeService.update(solvedPoint: sample.point, confidence: 1, timestamp: sample.time) {
                free.append(estimate.point)
            }
            if let estimate = dampedService.update(
                solvedPoint: sample.point, confidence: 1, timestamp: sample.time, motion: MotionAid(alphaFactor: 0.2)
            ) {
                damped.append(estimate.point)
            }
        }
        let freePath = pathLength(free)
        let dampedPath = pathLength(damped)
        print(String(format: "MOTION damping freePath=%.2f dampedPath=%.2f", freePath, dampedPath))
        XCTAssertLessThan(dampedPath, freePath)
    }

    // MARK: - 3. Flag aus gegen Flag an ohne Bewegungszeilen

    private func walkCleanLines(layout: LayoutData) -> [NavigationRecordLine] {
        var recording = SyntheticRecording(layout: layout, seed: 33)
        recording.event(.startTour, plan: [stop("A", 30.5, 9.5)])
        recording.walk([SIMD2(2.5, 9.5), SIMD2(30.5, 9.5)], speed: 1.2)
        return recording.lines
    }

    private func stationary60sLines(layout: LayoutData) -> [NavigationRecordLine] {
        var recording = SyntheticRecording(layout: layout, seed: 11)
        recording.noiseSigmaMeters = 0.5
        recording.event(.startTour, plan: [stop("A", 8.5, 9.5), stop("B", 24.5, 9.5)])
        recording.stand(at: SIMD2(16.5, 9.5), seconds: 60)
        return recording.lines
    }

    private func dropoutLines(layout: LayoutData) -> [NavigationRecordLine] {
        var recording = SyntheticRecording(layout: layout, seed: 88)
        recording.beaconDropoutProbability = 0.35
        recording.event(.startTour, plan: [stop("A", 30.5, 9.5)])
        recording.walk([SIMD2(2.5, 9.5), SIMD2(16.5, 9.5)], speed: 1.2)
        recording.blackout(seconds: 1.4, truth: SIMD2(16.5, 9.5))
        recording.walk([SIMD2(16.5, 9.5), SIMD2(30.5, 9.5)], speed: 1.2)
        return recording.lines
    }

    func testFlagOnWithoutMotionLinesMatchesFlagOffOnReplayScenarios() throws {
        let layout = try layout()
        let scenarios: [(name: String, lines: [NavigationRecordLine])] = [
            ("walkClean", walkCleanLines(layout: layout)),
            ("stationary60s", stationary60sLines(layout: layout)),
            ("dropout", dropoutLines(layout: layout)),
        ]
        for scenario in scenarios {
            let off = try replay(scenario.lines, layout: layout, motionAided: false).metrics
            let on = try replay(scenario.lines, layout: layout, motionAided: true).metrics
            XCTAssertGreaterThan(off.tickCount, 0, scenario.name)
            XCTAssertEqual(on, off, scenario.name)
        }
    }

    // MARK: - 4. Stehen (3.1)

    func testStandingDampsBLENoiseOnStationaryRun() throws {
        let layout = try layout()
        let base = stationary60sLines(layout: layout)
        let withSteps = base + constantSteps(at: firstTime(base))

        let off = try replay(base, layout: layout, motionAided: false)
        let on = try replay(withSteps, layout: layout, motionAided: true)
        let offPath = pathLength(off.ticks, afterSeconds: 5)
        let onPath = pathLength(on.ticks, afterSeconds: 5)
        print(String(format: "MOTION standing offPath=%.2f onPath=%.2f ratio=%.2f", offPath, onPath, onPath / offPath))
        XCTAssertGreaterThan(offPath, 0)
        XCTAssertLessThanOrEqual(onPath, 0.6 * offPath)
    }

    // MARK: - 5. Gehen (3.2)

    func testWalkingWithHeadingReducesMeanLag() throws {
        let layout = try layout()
        let base = walkCleanLines(layout: layout)
        let t0 = firstTime(base)
        let end = base.map(\.timestamp).max() ?? t0
        let withMotion = base + motionLines(from: t0, to: end, speed: 1.3, bearingDegrees: 90)

        let off = try replay(base, layout: layout, motionAided: false).metrics
        let on = try replay(withMotion, layout: layout, motionAided: true).metrics
        let offLag = try XCTUnwrap(off.meanLagMeters)
        let onLag = try XCTUnwrap(on.meanLagMeters)
        print(String(format: "MOTION walking offLag=%.2f onLag=%.2f", offLag, onLag))
        XCTAssertLessThanOrEqual(onLag, offLag)
    }

    func testWalkingWithoutHeadingDoesNotCrashAndMatchesFlagOff() throws {
        let layout = try layout()
        let base = walkCleanLines(layout: layout)
        let t0 = firstTime(base)
        let end = base.map(\.timestamp).max() ?? t0
        // Nur Schritte: keine Richtung, also keine Verschiebung; ohne Stillstand wirkt auch keine Daempfung.
        let stepsOnly = base + motionLines(from: t0, to: end, speed: 1.3, bearingDegrees: nil)

        let off = try replay(base, layout: layout, motionAided: false).metrics
        let on = try replay(stepsOnly, layout: layout, motionAided: true).metrics
        XCTAssertGreaterThan(on.tickCount, 0)
        XCTAssertEqual(on, off)
    }

    // MARK: - 6. BLE-Sprung (3.3)

    /// Stand bei P0, Funkloch mit Wahrheitssprung nach P1 (17 m), danach Stand in P1.
    private func jumpLines(layout: LayoutData) -> (lines: [NavigationRecordLine], blackoutStart: TimeInterval) {
        var recording = SyntheticRecording(layout: layout, seed: 55)
        recording.event(.startTour, plan: [stop("A", 30.5, 9.5)])
        recording.stand(at: SIMD2(10.5, 9.5), seconds: 5)
        let blackoutStart = recording.clock
        recording.blackout(seconds: 3, truth: SIMD2(10.5, 26.5))
        recording.stand(at: SIMD2(10.5, 26.5), seconds: 25)
        return (recording.lines, blackoutStart)
    }

    /// Erster Tick nach Beginn des Funklochs, dessen projizierte Position mehr als 8 m vom Ausgangspunkt liegt.
    private func jumpTime(_ ticks: [ReplayTick], blackoutStart: TimeInterval) -> TimeInterval? {
        guard let reference = ticks.last(where: { $0.t < blackoutStart })?.projected else { return nil }
        return ticks.first { tick in
            guard tick.t >= blackoutStart, let projected = tick.projected else { return false }
            return simd_length(projected - reference) > 8
        }?.t
    }

    func testBLEJumpWhileStandingIsConfirmedLaterThanFlagOff() throws {
        let layout = try layout()
        let jump = jumpLines(layout: layout)
        let base = jump.lines
        let withSteps = base + constantSteps(at: firstTime(base))

        let off = try replay(base, layout: layout, motionAided: false)
        let on = try replay(withSteps, layout: layout, motionAided: true)
        let offTime = try XCTUnwrap(jumpTime(off.ticks, blackoutStart: jump.blackoutStart), "Flag aus erreicht den Sprung nicht")
        let onTime = try XCTUnwrap(jumpTime(on.ticks, blackoutStart: jump.blackoutStart), "Flag an erreicht den Sprung nicht (Deadlock?)")
        let delayTicks = Int(((onTime - offTime) / tick).rounded())
        print("MOTION jump standing offTick=\(Int(((offTime - jump.blackoutStart) / tick).rounded())) "
            + "onTick=\(Int(((onTime - jump.blackoutStart) / tick).rounded())) delayTicks=\(delayTicks)")
        XCTAssertGreaterThanOrEqual(delayTicks, 6)
    }

    func testBLEJumpWhileWalkingIsNotDelayed() throws {
        let layout = try layout()
        let jump = jumpLines(layout: layout)
        let base = jump.lines
        let t0 = firstTime(base)
        let end = base.map(\.timestamp).max() ?? t0
        // Schritte laufen durch (Gehen): kein Stillstand, also keine Abweichung vom Flag-aus-Pfad.
        let walking = base + motionLines(from: t0, to: end, speed: 1.3, bearingDegrees: nil)

        let off = try replay(base, layout: layout, motionAided: false)
        let on = try replay(walking, layout: layout, motionAided: true)
        let offTime = try XCTUnwrap(jumpTime(off.ticks, blackoutStart: jump.blackoutStart))
        let onTime = try XCTUnwrap(jumpTime(on.ticks, blackoutStart: jump.blackoutStart))
        let delayTicks = Int(((onTime - offTime) / tick).rounded())
        print("MOTION jump walking delayTicks=\(delayTicks)")
        XCTAssertLessThanOrEqual(delayTicks, 1)
    }
}
