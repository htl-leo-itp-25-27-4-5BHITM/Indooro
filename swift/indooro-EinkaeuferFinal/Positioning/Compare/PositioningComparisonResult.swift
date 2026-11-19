import Foundation
import IndooroNavigation
import IndooroModels
import simd

/// One epoch (tick after the warm-up) with the truth and both pipelines.
struct ComparisonEpoch {
    var t: TimeInterval
    var truth: SIMD2<Double>?
    var current: PathTick
    var engine: PathTick

    func tick(_ method: PositioningMethod) -> PathTick {
        method == .current ? current : engine
    }
}

/// Result of a comparison: per-epoch rows, figures per pipeline, and the writers (CSV, JSON, text).
public struct PositioningComparisonResult {
    public let recordingName: String
    let recordingLineCount: Int
    let recordingSHA256: String
    let layout: LayoutData
    let session: SessionRecord?
    let config: StabilizedNavigationConfig
    let truth: TruthTrack
    let epochs: [ComparisonEpoch]
    let currentMetrics: PathMetrics
    let engineMetrics: PathMetrics
    let unmappedEngineMeasurements: Int
    private let currentTicks: [PathTick]
    private let engineTicks: [PathTick]

    init(
        recordingName: String,
        recordingLineCount: Int,
        recordingSHA256: String,
        layout: LayoutData,
        session: SessionRecord?,
        config: StabilizedNavigationConfig,
        truth: TruthTrack,
        current: [PathTick],
        engine: [PathTick],
        unmappedEngineMeasurements: Int
    ) {
        self.recordingName = recordingName
        self.recordingLineCount = recordingLineCount
        self.recordingSHA256 = recordingSHA256
        self.layout = layout
        self.session = session
        self.config = config
        self.truth = truth
        self.unmappedEngineMeasurements = unmappedEngineMeasurements
        currentTicks = current
        engineTicks = engine
        // Both paths run on the same schedule, so the tick lists have the same length; `zip` keeps the shorter one.
        let rows = zip(current, engine).map { current, engine in
            ComparisonEpoch(t: current.t, truth: truth.position(at: current.t), current: current, engine: engine)
        }
        epochs = rows
        func metricEpochs(_ method: PositioningMethod) -> [MetricEpoch] {
            rows.map { row in
                MetricEpoch(
                    t: row.t,
                    truth: row.truth,
                    position: row.tick(method).displayed.map { SIMD2(Double($0.x), Double($0.y)) }
                )
            }
        }
        currentMetrics = PathMetrics.compute(metricEpochs(.current))
        engineMetrics = PathMetrics.compute(metricEpochs(.engine))
    }

    /// `true` when the file name starts with `synthetic-` (generated data, not a measurement).
    public var isSynthetic: Bool { recordingName.hasPrefix("synthetic-") }

    /// `false` without truth markers or when no epoch lies inside the marker range: no figure can be computed.
    public var hasEvaluableEpochs: Bool { currentMetrics.epochsWithTruth > 0 }

    public var epochCount: Int { epochs.count }

    func metrics(_ method: PositioningMethod) -> PathMetrics {
        method == .current ? currentMetrics : engineMetrics
    }

    /// Number of epochs where both pipelines display the same position (or both none), and the largest distance
    /// between the two positions where both have one (metres).
    var agreement: (equalEpochs: Int, maxDistanceMeters: Double) {
        var equal = 0
        var largest = 0.0
        for row in epochs {
            switch (row.current.displayed, row.engine.displayed) {
            case (nil, nil):
                equal += 1
            case let (a?, b?):
                let distance = Double(simd_length(a - b))
                largest = max(largest, distance)
                if distance < 1e-6 { equal += 1 }
            default:
                break
            }
        }
        return (equal, largest)
    }

    // MARK: - Per-epoch CSV

    public static let csvHeader = [
        "t", "truth_x", "truth_y",
        "current_x", "current_y", "current_raw_x", "current_raw_y", "current_confidence", "current_beacons", "current_trusted",
        "engine_x", "engine_y", "engine_raw_x", "engine_raw_y", "engine_confidence", "engine_beacons", "engine_trusted",
    ].joined(separator: ",")

    /// One row per epoch (tick after the warm-up). Decimal point, 3 decimals, empty field for "none", `\n` line ends.
    public func csv() -> String {
        var out = [Self.csvHeader]
        out.reserveCapacity(epochs.count + 1)
        for row in epochs {
            var fields = [Self.f(row.t), Self.f(row.truth?.x), Self.f(row.truth?.y)]
            for method in PositioningMethod.allCases {
                let tick = row.tick(method)
                fields += [
                    Self.f(tick.displayed.map { Double($0.x) }), Self.f(tick.displayed.map { Double($0.y) }),
                    Self.f(tick.solved.map { Double($0.x) }), Self.f(tick.solved.map { Double($0.y) }),
                    Self.f(Double(tick.confidence)), String(tick.beaconsUsed), tick.trusted ? "1" : "0",
                ]
            }
            out.append(fields.joined(separator: ","))
        }
        return out.joined(separator: "\n") + "\n"
    }

    /// Tick CSV of one pipeline in the format of `NavigationReplay.csv` (header `NavigationReplay.csvHeader`), so that
    /// `scripts/field/field_stats.py` can read it. `truth_*` is the latest marker like in the replay export.
    public func tickCSV(_ method: PositioningMethod) -> String {
        let ticks = method == .current ? currentTicks : engineTicks
        let window = 2 * config.beacon.updateIntervalSeconds + 1e-6
        let replayTicks = ticks.map { tick -> ReplayTick in
            var latest: TruthTrack.Marker?
            for marker in truth.markers where marker.t <= tick.t { latest = marker }
            let point: SIMD2<Float>? = latest.flatMap { tick.t - $0.t <= window ? SIMD2(Float($0.x), Float($0.y)) : nil }
            return ReplayTick(
                t: tick.t,
                truth: point,
                solved: tick.solved,
                projected: tick.displayed,
                confidence: tick.confidence,
                beaconsUsed: tick.beaconsUsed,
                routeRebuild: false,
                stopChange: false
            )
        }
        return NavigationReplay.csv(ticks: replayTicks)
    }

    static func f(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "" }
        return String(format: "%.3f", value)
    }
}
