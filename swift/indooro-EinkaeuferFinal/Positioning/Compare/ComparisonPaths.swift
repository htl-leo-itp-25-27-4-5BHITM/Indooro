import Foundation
import IndooroNavigation
import IndooroModels
import simd

/// Result of one tick of one pipeline.
struct PathTick: Equatable {
    var t: TimeInterval
    /// Displayed (projected) position, `nil` without a solution in this tick.
    var displayed: SIMD2<Float>?
    /// Raw point of the solver.
    var solved: SIMD2<Float>?
    var confidence: Float
    /// Fresh measurements at tick time.
    var beaconsUsed: Int
    /// Position counts as trusted (projected point and confidence at least `lowThreshold`).
    var trusted: Bool
}

/// The recording in replay order and the tick schedule that BOTH paths use.
///
/// Rules (the same as `NavigationReplay` and `BeaconManager`):
/// - The virtual clock starts at the first line and ticks every `updateIntervalSeconds` (accumulated, like the replay).
/// - All lines up to the tick time are applied before the tick (callbacks come before the timer).
/// - Ticks inside the warm-up (`tick - start < warmupSeconds`) do nothing: no solve, no removal of RSSI samples.
/// - `scan`, `session` and `sync` lines carry no measurement. `step` and `heading` lines are dropped because the
///   motion model (`motionAided`) is off in the app by default.
struct ReplayPlan {
    struct Tick {
        var time: TimeInterval
        /// Lines `[consumed, lineEnd)` are applied before this tick.
        var lineEnd: Int
        var isWarmup: Bool
    }

    let lines: [NavigationRecordLine]
    let start: TimeInterval
    let end: TimeInterval
    let ticks: [Tick]
    let warmupSeconds: TimeInterval
    let intervalSeconds: TimeInterval

    init(recording: [NavigationRecordLine], config: StabilizedNavigationConfig) {
        let timeline = recording.filter { line in
            switch line {
            case .measurement, .layout, .event, .truth: return true
            case .step, .heading, .scan, .session, .sync, .shadow: return false
            }
        }
        lines = timeline.enumerated().sorted {
            $0.element.timestamp == $1.element.timestamp ? $0.offset < $1.offset : $0.element.timestamp < $1.element.timestamp
        }.map(\.element)
        warmupSeconds = config.beacon.warmupSeconds
        intervalSeconds = config.beacon.updateIntervalSeconds
        guard let first = lines.first, let last = lines.last else {
            start = 0
            end = 0
            ticks = []
            return
        }
        start = first.timestamp
        end = last.timestamp
        var schedule: [Tick] = []
        var nextTick = start + intervalSeconds
        var index = 0
        while index < lines.count {
            while index < lines.count, lines[index].timestamp <= nextTick { index += 1 }
            schedule.append(Tick(time: nextTick, lineEnd: index, isWarmup: nextTick - start < warmupSeconds))
            nextTick += intervalSeconds
        }
        ticks = schedule
    }
}

/// The current app pipeline, driven the way `BeaconManager` drives it: ranging and RSSI samples go into
/// `BeaconMeasurementStore` / `RSSISampleBuffer`, every `updateIntervalSeconds` `PositioningPipeline.tick` runs,
/// and the projected point is what the map shows. `NavigationReplay` runs the same chain (plus routing) without
/// the warm-up; a test checks that both agree when the warm-up is zero.
enum CurrentPipelinePath {
    static func run(plan: ReplayPlan, layout: LayoutData, config: StabilizedNavigationConfig) -> [PathTick] {
        let graph = NavigationReplay.makeGraph(layout)
        let beacons = NavigationReplay.layoutBeacons(layout)
        let beaconNames = beacons.map(\.name)
        let store = BeaconMeasurementStore(config: config.beacon)
        store.syncBeacons(beacons)
        let pipeline = PositioningPipeline(
            store: store,
            graph: graph,
            bounds: CGRect(x: 0, y: 0, width: layout.gridSize.width, height: layout.gridSize.height),
            config: config
        )
        var samples = RSSISampleBuffer()
        var output: [PathTick] = []
        var consumed = 0

        for tick in plan.ticks {
            while consumed < tick.lineEnd {
                switch plan.lines[consumed] {
                case .measurement(let record):
                    switch record.source {
                    case .rssi:
                        guard record.rssi != 0, record.rssi != 127 else { break }
                        samples.record(name: record.beacon, rssi: record.rssi, timestamp: record.t, txPower: record.txPower)
                    case .ranging:
                        store.recordRanging(
                            beaconName: record.beacon,
                            accuracy: record.accuracy ?? 0,
                            rssi: record.rssi,
                            quality: PositioningPipeline.rangingQuality(
                                rssi: record.rssi,
                                accuracy: record.accuracy ?? 0,
                                proximity: record.proximity ?? .unknown,
                                config: config.beacon
                            ),
                            timestamp: record.t
                        )
                    }
                case .event(let event) where event.kind == .calibrate:
                    if let x = event.x, let y = event.y {
                        _ = pipeline.calibrate(to: SIMD2(x, y), at: event.t)
                    }
                case .event, .layout, .truth, .step, .heading, .scan, .session, .sync, .shadow:
                    break
                }
                consumed += 1
            }
            guard !tick.isWarmup else { continue }
            let result = pipeline.tick(beaconNames: beaconNames, samples: samples, at: tick.time)
            samples.removeSamples()
            output.append(PathTick(
                t: tick.time,
                displayed: result.projectedPoint,
                solved: result.solvedPoint,
                confidence: result.confidence,
                beaconsUsed: store.activeMeasurements(at: tick.time).count,
                trusted: result.projectedPoint != nil && result.confidence >= config.confidence.lowThreshold
            ))
        }
        return output
    }
}

/// `PositioningEngine` fed with the same samples on the same schedule. The radio is replaced by direct calls of
/// `ingest` (what a radio would deliver), and the clock is a manual clock, so each tick runs exactly once, in order.
enum EnginePath {
    struct Output {
        var ticks: [PathTick]
        /// Measurements of the layout that the engine's `BeaconCatalog` could not assign to the recorded beacon.
        var unmappedMeasurements: Int
    }

    static func run(plan: ReplayPlan, layout: LayoutData, config: StabilizedNavigationConfig) async -> Output {
        let clock = ManualClock(start: plan.start)
        let engine = PositioningEngine(
            radio: NullBeaconRadio(),
            headingProvider: nil,
            motionProvider: nil,
            clock: clock,
            config: config
        )
        let positioningLayout = PositioningLayout(layout: layout, revision: 1)
        let mapper = EngineSampleMapper(catalog: positioningLayout.beacons)
        await engine.setLayout(positioningLayout)
        await engine.start()

        var output: [PathTick] = []
        var unmapped = 0
        var consumed = 0
        for tick in plan.ticks {
            while consumed < tick.lineEnd {
                switch plan.lines[consumed] {
                case .measurement(let record):
                    switch mapper.sample(for: record) {
                    case .sample(let sample): await engine.ingest(sample)
                    case .unmapped: unmapped += 1
                    case .skipped: break
                    }
                case .event(let event) where event.kind == .calibrate:
                    if let x = event.x, let y = event.y {
                        clock.set(event.t)
                        await engine.calibrate(to: SIMD2(x, y))
                    }
                case .event, .layout, .truth, .step, .heading, .scan, .session, .sync, .shadow:
                    break
                }
                consumed += 1
            }
            clock.set(tick.time)
            await engine.runTick()
            guard !tick.isWarmup, let snapshot = await engine.latestSnapshot else { continue }
            output.append(PathTick(
                t: snapshot.timestamp,
                displayed: snapshot.displayedPoint,
                solved: snapshot.rawPoint,
                confidence: snapshot.confidence,
                beaconsUsed: snapshot.activeBeaconCount,
                trusted: snapshot.isTrusted
            ))
        }
        await engine.stop()
        return Output(ticks: output, unmappedMeasurements: unmapped)
    }
}

/// Turns a recorded measurement into the sample a radio would hand to the engine.
///
/// A recording stores the layout `beaconId` per measurement, not the radio identity. The identity is rebuilt from the
/// layout (UUID, major, minor) and then resolved by the engine's `BeaconCatalog`, so a layout whose identities do not
/// resolve to the recorded name shows up as `unmapped`. What this cannot show is how the real radio code reads
/// manufacturer data and advertisements; that is a field question (shadow mode).
struct EngineSampleMapper {
    enum Result {
        case sample(BeaconSample)
        /// The engine would assign the measurement to a different beacon or to none.
        case unmapped
        /// The radio layer drops it for both paths (RSSI 0 or 127 of an advertisement) or the layout has no such beacon.
        case skipped
    }

    let catalog: BeaconCatalog
    static let fallbackUUID = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!

    func sample(for record: MeasurementRecord) -> Result {
        guard let beacon = catalog.beacons.first(where: { $0.name == record.beacon }) else { return .skipped }
        let identity = BeaconIdentity(
            uuid: beacon.beaconUUID ?? Self.fallbackUUID,
            major: beacon.beaconMajor ?? 0,
            minor: beacon.beaconMinor ?? 0
        )
        switch record.source {
        case .ranging:
            guard catalog.rangingName(for: identity) == beacon.name else { return .unmapped }
            return .sample(BeaconSample(
                source: .ranging(accuracy: record.accuracy ?? 0, proximity: record.proximity ?? .unknown),
                rssi: record.rssi,
                timestamp: record.t,
                identity: identity
            ))
        case .rssi:
            guard record.rssi != 0, record.rssi != 127 else { return .skipped }
            guard catalog.explicitName(for: identity) == beacon.name else { return .unmapped }
            return .sample(BeaconSample(
                source: .advertisement(txPower: record.txPower),
                rssi: record.rssi,
                timestamp: record.t,
                identity: identity
            ))
        }
    }
}

/// Clock that only moves when told to; `sleep` never returns until the task is cancelled. The comparison calls
/// `PositioningEngine.runTick()` itself, so the engine's own tick loop stays idle.
final class ManualClock: PositioningClock, @unchecked Sendable {
    private let lock = NSLock()
    private var current: TimeInterval

    init(start: TimeInterval) {
        current = start
    }

    func now() -> TimeInterval {
        lock.withLock { current }
    }

    func set(_ time: TimeInterval) {
        lock.withLock { current = time }
    }

    func sleep(for seconds: TimeInterval) async throws {
        try await Task.sleep(for: .seconds(24 * 60 * 60))
    }
}

/// Radio without samples (the comparison feeds the engine directly).
struct NullBeaconRadio: BeaconRadio {
    func samples() -> AsyncStream<BeaconSample> { AsyncStream { $0.finish() } }
    func status() -> AsyncStream<RadioStatus> { AsyncStream { $0.finish() } }
    func start(constraints: [BeaconConstraint]) async {}
    func stop() async {}
}
