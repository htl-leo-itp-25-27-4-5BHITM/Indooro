import Foundation
import CoreGraphics
import simd

/// Naehe-Klasse eines iBeacon-Rangings (Spiegel von `CLProximity`, damit Paket und Aufzeichnung ohne CoreLocation auskommen).
enum BeaconProximityClass: String, Codable, Equatable {
    case immediate
    case near
    case far
    case unknown
}

/// Puffer der RSSI-Rohsamples eines Ticks (letzte 12 je Beacon) samt Sichtzeit und TX-Power.
struct RSSISampleBuffer {
    static let maxSamplesPerBeacon = 12

    private(set) var samples: [String: [Int]] = [:]
    private(set) var lastSeenAt: [String: TimeInterval] = [:]
    private(set) var txPower: [String: Float] = [:]

    mutating func record(name: String, rssi: Int, timestamp: TimeInterval, txPower power: Float?) {
        lastSeenAt[name] = timestamp
        if let power {
            txPower[name] = power
        }
        var values = samples[name] ?? []
        values.append(rssi)
        if values.count > Self.maxSamplesPerBeacon {
            values.removeFirst(values.count - Self.maxSamplesPerBeacon)
        }
        samples[name] = values
    }

    /// Verwirft die Samples eines Ticks, behaelt Sichtzeit und TX-Power.
    mutating func removeSamples() {
        samples.removeAll()
    }

    mutating func removeAll() {
        samples.removeAll()
        lastSeenAt.removeAll()
        txPower.removeAll()
    }
}

/// Ergebnis eines Positionierungs-Ticks.
struct PositioningTick {
    let timestamp: TimeInterval
    /// Vom Solver geloester Rohpunkt; `nil`, wenn zu wenige Beacons vorlagen.
    let solvedPoint: SIMD2<Float>?
    let confidence: Float
    /// `true`, wenn das Sprung-Gate den geloesten Punkt gehalten hat.
    let wasHeld: Bool
    /// Projizierte Position (Eingang der Navigations-Session); `nil` ohne Loesung.
    let projectedPoint: SIMD2<Float>?
}

/// Pro-Tick-Kette der Ortung: RSSI-Fenster -> Messspeicher -> Solver -> Schaetzer -> Projektion.
/// `BeaconManager` und `NavigationReplay` rufen genau diese Funktionen auf (design.md D11).
final class PositioningPipeline {
    let store: BeaconMeasurementStore
    private let solver: BeaconPositionSolver
    private let estimator: PoseFusionService
    private let projector: WalkableProjector
    private let config: StabilizedNavigationConfig

    /// Letzte Solver-Loesung (Startwert der naechsten Loesung).
    private(set) var lastSolvedPoint: SIMD2<Float>?

    init(
        store: BeaconMeasurementStore,
        graph: IndoorGraph,
        bounds: CGRect,
        config: StabilizedNavigationConfig = .default
    ) {
        self.store = store
        self.config = config
        solver = BeaconPositionSolver(bounds: bounds, config: config.beacon)
        estimator = PoseFusionService(config: config.poseFusion)
        projector = WalkableProjector(graph: graph)
    }

    // MARK: - Tick

    /// Ein Tick: RSSI-Fenster der Beacons ohne frisches Ranging, Ablauf veralteter Messungen, genau eine
    /// Loesung, Schaetzer, Projektion. Der Aufrufer leert danach `samples.removeSamples()`.
    func tick(
        beaconNames: [String],
        samples: RSSISampleBuffer,
        at timestamp: TimeInterval
    ) -> PositioningTick {
        for name in beaconNames {
            let values = samples.samples[name] ?? []
            // Pro Beacon genau eine Quelle: mit frischem Ranging werden RSSI-Samples verworfen.
            guard !values.isEmpty, store.shouldUseRSSI(for: name, at: timestamp) else {
                continue
            }
            processRSSIWindow(values, for: name, samples: samples, timestamp: timestamp)
        }

        store.expireStaleMeasurements(at: timestamp)
        return store.solveTick(at: timestamp) { measurements in
            solve(measurements: measurements, timestamp: timestamp)
        }
    }

    private func solve(measurements: [BeaconAnchorMeasurement], timestamp: TimeInterval) -> PositioningTick {
        let baseConfidence = Self.trackingConfidence(activeMeasurements: measurements, config: config.beacon)

        guard let solved = solver.solve(measurements: measurements, previousEstimate: lastSolvedPoint) else {
            return PositioningTick(
                timestamp: timestamp,
                solvedPoint: nil,
                confidence: baseConfidence,
                wasHeld: false,
                projectedPoint: nil
            )
        }

        let confidence = Self.clamp(0.45 * baseConfidence + 0.55 * solved.confidence, min: 0, max: 1)
        lastSolvedPoint = solved.point

        guard let estimate = estimator.update(solvedPoint: solved.point, confidence: confidence, timestamp: timestamp),
              let projection = projector.project(estimate.point) else {
            return PositioningTick(
                timestamp: timestamp,
                solvedPoint: solved.point,
                confidence: confidence,
                wasHeld: false,
                projectedPoint: nil
            )
        }

        return PositioningTick(
            timestamp: timestamp,
            solvedPoint: solved.point,
            confidence: confidence,
            wasHeld: estimate.wasHeld,
            projectedPoint: projection.projectedPoint
        )
    }

    // MARK: - Kalibrierung und Reset

    /// Manuelle Kalibrierung: projizieren, Schaetzer und Solver-Startwert auf den Punkt setzen.
    /// Liefert den effektiven (projizierten) Punkt.
    func calibrate(to mapPoint: SIMD2<Float>, at timestamp: TimeInterval) -> SIMD2<Float> {
        let effectivePoint = projector.project(mapPoint)?.projectedPoint ?? mapPoint
        estimator.reset(to: effectivePoint, timestamp: timestamp)
        lastSolvedPoint = effectivePoint
        return effectivePoint
    }

    func clearSolverSeed() {
        lastSolvedPoint = nil
    }

    // MARK: - RSSI und Ranging (rein)

    private func processRSSIWindow(
        _ values: [Int],
        for beaconName: String,
        samples: RSSISampleBuffer,
        timestamp: TimeInterval
    ) {
        let sorted = values.sorted()
        let filtered: [Int]
        if sorted.count >= 5 {
            filtered = Array(sorted.dropFirst().dropLast())
        } else {
            filtered = sorted
        }

        let averageRSSI = Double(filtered.reduce(0, +)) / Double(filtered.count)
        let measurementStdDev = Self.standardDeviation(of: filtered, mean: averageRSSI)
        let txPower = Double(samples.txPower[beaconName] ?? config.beacon.defaultTxPowerDBm)
        let rawDistance = Self.rssiDistance(rssi: averageRSSI, txPower: txPower, config: config.beacon)
        let sampleScore = Self.clamp(Float(filtered.count) / 6.0, min: 0.2, max: 1)
        let stabilityScore = Self.clamp(1 - Float(measurementStdDev / 9.0), min: 0.08, max: 1)
        let freshnessScore = Self.clamp(
            1 - Float((timestamp - (samples.lastSeenAt[beaconName] ?? timestamp)) / config.beacon.staleMeasurementSeconds),
            min: 0,
            max: 1
        )
        let quality = Self.clamp(
            0.42 * stabilityScore + 0.33 * sampleScore + 0.25 * freshnessScore,
            min: 0,
            max: 1
        )
        store.recordRSSI(
            beaconName: beaconName,
            rawDistance: rawDistance,
            rssi: Int(averageRSSI.rounded()),
            quality: quality,
            timestamp: timestamp
        )
    }

    /// Pfadverlust-Modell: `10^((txPower - rssi) / (10 * n))`, auf 0.35-11 m begrenzt.
    static func rssiDistance(rssi: Double, txPower: Double, config: BeaconPositioningConfig) -> Double {
        let exponent = (txPower - rssi) / (10.0 * Double(config.pathLossExponent))
        let distance = pow(10.0, exponent)
        return min(Double(config.maxDistanceMeters), max(Double(config.minDistanceMeters), distance))
    }

    /// Qualitaet einer Ranging-Messung: `0.42 * signal + 0.38 * distance + 0.20 * proximity`.
    static func rangingQuality(
        rssi: Int,
        accuracy: Double,
        proximity: BeaconProximityClass,
        config: BeaconPositioningConfig
    ) -> Float {
        guard rssi < 0 else {
            return 0.1
        }

        let signalScore = clamp((Float(rssi) + 92) / 34.0, min: 0.03, max: 1)
        let accuracyMeters = accuracy.isFinite && accuracy > 0 ? Float(accuracy) : config.maxDistanceMeters
        let distanceScore = clamp(1 - accuracyMeters / 6.0, min: 0.03, max: 1)
        let proximityScore: Float
        switch proximity {
        case .immediate: proximityScore = 1
        case .near: proximityScore = 0.8
        case .far: proximityScore = 0.28
        case .unknown: proximityScore = 0.05
        }
        return clamp(0.42 * signalScore + 0.38 * distanceScore + 0.20 * proximityScore, min: 0, max: 1)
    }

    static func trackingConfidence(
        activeMeasurements: [BeaconAnchorMeasurement],
        config: BeaconPositioningConfig
    ) -> Float {
        guard !activeMeasurements.isEmpty else {
            return 0
        }

        let countScore = clamp(Float(activeMeasurements.count - 2) / 3.0, min: 0, max: 1)
        let qualityScore = activeMeasurements.reduce(0 as Float) { $0 + $1.quality } / Float(activeMeasurements.count)
        let freshnessScore = activeMeasurements.reduce(0 as Float) { partialResult, measurement in
            let freshness = clamp(
                1 - (measurement.ageSeconds / Float(config.staleMeasurementSeconds)),
                min: 0,
                max: 1
            )
            return partialResult + freshness
        } / Float(activeMeasurements.count)
        let proximityScore = clamp(
            1 - (activeMeasurements.map(\.distanceMeters).min() ?? config.maxDistanceMeters) / 12.0,
            min: 0,
            max: 1
        )
        return clamp(
            0.30 * countScore + 0.30 * qualityScore + 0.20 * freshnessScore + 0.20 * proximityScore,
            min: 0,
            max: 1
        )
    }

    private static func standardDeviation(of values: [Int], mean: Double) -> Double {
        guard values.count > 1 else { return 0 }
        let variance = values.reduce(0.0) { partial, value in
            let delta = Double(value) - mean
            return partial + delta * delta
        } / Double(values.count)
        return sqrt(variance)
    }

    private static func clamp(_ value: Float, min lower: Float, max upper: Float) -> Float {
        Swift.min(upper, Swift.max(lower, value))
    }
}
