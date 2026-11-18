import Foundation

/// One epoch (tick) of one pipeline for the metrics: truth (if any) and displayed position (if any).
struct MetricEpoch: Equatable {
    var t: Double
    var truth: SIMD2<Double>?
    var position: SIMD2<Double>?
}

/// Figures of one pipeline on one recording.
///
/// Definitions follow `tools/beacon-lab/docs/METRICS.md` so that the Lab and this tool give the same numbers:
/// - `epochsWithTruth`: epochs with a truth reference. An epoch without truth never counts.
/// - outage: an epoch with truth but without a displayed position; `outageRate = failed / epochsWithTruth`.
/// - median, mean, rmse, P90, P95, max: over epochs with truth and position only (conditional on success).
///   Percentiles use linear interpolation between order statistics (Hyndman-Fan type 7, `PERCENTILE.INC`).
/// - `within2/3/5`: share of ALL epochs with truth whose error is at most 2/3/5 m; an outage counts as not within.
/// - jump: two consecutive epochs with a position (outages in between are skipped), time gap `0 < dt <= 2 s`,
///   speed above 2 m/s. `jumpRate = jumps / pairs`. Positions in a gap of more than 2 s do not form a pair.
///   Real walking is about 1 to 1.5 m/s; 2 m/s is an assumption for "implausible", not a measurement.
/// - Unit: metres (1 layout cell = 1 m, `MEASUREMENT_PROTOCOL.md`).
struct PathMetrics: Equatable {
    var epochs = 0
    var epochsWithTruth = 0
    var validEstimates = 0
    var failedEstimates = 0
    var outageRate: Double?
    var mean: Double?
    var median: Double?
    var rmse: Double?
    var p90: Double?
    var p95: Double?
    var max: Double?
    var within2: Double?
    var within3: Double?
    var within5: Double?
    var pairs = 0
    var jumps = 0
    var jumpRate: Double?

    static let jumpSpeedMetersPerSecond = 2.0
    static let maxPairGapSeconds = 2.0

    static func compute(_ epochs: [MetricEpoch]) -> PathMetrics {
        var metrics = PathMetrics()
        metrics.epochs = epochs.count

        var errors: [Double] = []
        var withTruth = 0
        for epoch in epochs {
            guard let truth = epoch.truth else { continue }
            withTruth += 1
            if let position = epoch.position {
                let error = hypot(position.x - truth.x, position.y - truth.y)
                if error.isFinite { errors.append(error) }
            }
        }
        metrics.epochsWithTruth = withTruth
        metrics.validEstimates = errors.count
        metrics.failedEstimates = withTruth - errors.count
        if withTruth > 0 {
            metrics.outageRate = Double(metrics.failedEstimates) / Double(withTruth)
            func within(_ threshold: Double) -> Double {
                Double(errors.filter { $0 <= threshold }.count) / Double(withTruth)
            }
            metrics.within2 = within(2)
            metrics.within3 = within(3)
            metrics.within5 = within(5)
        }
        if !errors.isEmpty {
            let sorted = errors.sorted()
            metrics.mean = errors.reduce(0, +) / Double(errors.count)
            metrics.median = percentile(sorted, 50)
            metrics.p90 = percentile(sorted, 90)
            metrics.p95 = percentile(sorted, 95)
            metrics.rmse = (errors.reduce(0) { $0 + $1 * $1 } / Double(errors.count)).squareRoot()
            metrics.max = sorted.last
        }

        let positioned = epochs
            .compactMap { epoch in epoch.position.map { (t: epoch.t, p: $0) } }
            .sorted { $0.t < $1.t }
        var pairs = 0
        var jumps = 0
        if positioned.count > 1 {
            for index in 1..<positioned.count {
                let previous = positioned[index - 1]
                let current = positioned[index]
                let dt = current.t - previous.t
                guard dt > 0, dt <= maxPairGapSeconds else { continue }
                pairs += 1
                let distance = hypot(current.p.x - previous.p.x, current.p.y - previous.p.y)
                if distance / dt > jumpSpeedMetersPerSecond { jumps += 1 }
            }
        }
        metrics.pairs = pairs
        metrics.jumps = jumps
        metrics.jumpRate = pairs == 0 ? nil : Double(jumps) / Double(pairs)
        return metrics
    }

    /// Hyndman-Fan type 7 on a sorted, non-empty array.
    static func percentile(_ sorted: [Double], _ p: Double) -> Double {
        let h = Double(sorted.count - 1) * p / 100
        let lower = Int(h.rounded(.down))
        let upper = Swift.min(lower + 1, sorted.count - 1)
        return sorted[lower] + (h - Double(lower)) * (sorted[upper] - sorted[lower])
    }
}
