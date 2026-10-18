import Foundation
import CoreGraphics
import simd

/// Naehe-Klasse eines iBeacon-Rangings (Spiegel von `CLProximity`, damit Paket und Aufzeichnung ohne CoreLocation auskommen).
public enum BeaconProximityClass: String, Codable, Equatable, Sendable {
    case immediate
    case near
    case far
    case unknown
}

/// Puffer der RSSI-Rohsamples eines Ticks (letzte 12 je Beacon) samt Sichtzeit und TX-Power.
public struct RSSISampleBuffer {
    static let maxSamplesPerBeacon = 12

    public init() {}

    private(set) var samples: [String: [Int]] = [:]
    private(set) var lastSeenAt: [String: TimeInterval] = [:]
    public private(set) var txPower: [String: Float] = [:]

    public mutating func record(name: String, rssi: Int, timestamp: TimeInterval, txPower power: Float?) {
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
    public mutating func removeSamples() {
        samples.removeAll()
    }

    public mutating func removeAll() {
        samples.removeAll()
        lastSeenAt.removeAll()
        txPower.removeAll()
    }
}

/// Ergebnis eines Positionierungs-Ticks.
public struct PositioningTick: Sendable {
    public let timestamp: TimeInterval
    /// Vom Solver geloester Rohpunkt; `nil`, wenn zu wenige Beacons vorlagen.
    public let solvedPoint: SIMD2<Float>?
    public let confidence: Float
    /// `true`, wenn das Sprung-Gate den geloesten Punkt gehalten hat.
    public let wasHeld: Bool
    /// Projizierte Position (Eingang der Navigations-Session); `nil` ohne Loesung.
    public let projectedPoint: SIMD2<Float>?
}

/// Pro-Tick-Kette der Ortung: RSSI-Fenster -> Messspeicher -> Solver -> Schaetzer -> Projektion.
/// `BeaconManager` und `NavigationReplay` rufen genau diese Funktionen auf (design.md D11).
public final class PositioningPipeline {
    let store: BeaconMeasurementStore
    private let solver: BeaconPositionSolver
    private let estimator: PoseFusionService
    private let projector: WalkableProjector
    private let config: StabilizedNavigationConfig
    private let graph: IndoorGraph
    private let motion: MotionTracker

    /// Letzte Solver-Loesung (Startwert der naechsten Loesung).
    private(set) var lastSolvedPoint: SIMD2<Float>?

    public init(
        store: BeaconMeasurementStore,
        graph: IndoorGraph,
        bounds: CGRect,
        config: StabilizedNavigationConfig = .default
    ) {
        self.store = store
        self.config = config
        self.graph = graph
        motion = MotionTracker(config: config.motion)
        solver = BeaconPositionSolver(bounds: bounds, config: config.beacon)
        estimator = PoseFusionService(config: config.poseFusion)
        projector = WalkableProjector(graph: graph)
    }

    // MARK: - Bewegung

    /// Schrittzaehler-Zeile (kumulativ). Ohne `motionAided` ohne Wirkung.
    public func recordStep(cumulativeSteps: Int, at timestamp: TimeInterval) {
        guard config.motion.motionAided else { return }
        motion.recordStep(cumulativeSteps: cumulativeSteps, at: timestamp)
    }

    /// Kompasspeilung. Ohne `motionAided` ohne Wirkung.
    public func recordHeading(bearingDegrees: Double, accuracy: Double, at timestamp: TimeInterval) {
        guard config.motion.motionAided else { return }
        motion.recordHeading(bearingDegrees: bearingDegrees, accuracy: accuracy, at: timestamp)
    }

    // MARK: - Tick

    /// Ein Tick: RSSI-Fenster der Beacons ohne frisches Ranging, Ablauf veralteter Messungen, genau eine
    /// Loesung, Schaetzer, Projektion. Der Aufrufer leert danach `samples.removeSamples()`.
    public func tick(
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
            // Bekannte Grenze: neue Schritte ohne Loesung werden verworfen und nicht nachgeholt.
            if config.motion.motionAided, motion.hasStepData {
                _ = motion.consumeNewSteps()
            }
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

        let aid = motionAid(at: timestamp)
        guard let estimate = estimator.update(
            solvedPoint: solved.point,
            confidence: confidence,
            timestamp: timestamp,
            motion: aid
        ),
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

    /// Bewegungsdaten des Ticks. `nil` ohne Flag oder ohne Schrittdaten: dann Aufruf wie ohne Bewegung.
    private func motionAid(at timestamp: TimeInterval) -> MotionAid? {
        guard config.motion.motionAided, motion.hasStepData else { return nil }
        let standing = motion.isStanding(at: timestamp) ?? false
        let steps = motion.consumeNewSteps()

        var aid = MotionAid()
        if standing {
            aid.alphaFactor = config.motion.standingAlphaFactor
            aid.jumpConfirmations = config.motion.standingJumpConfirmations
        }
        if steps > 0, let current = estimator.estimate,
           let heading = motion.headingDirection(at: timestamp),
           let direction = walkDirection(from: current, heading: heading) {
            aid.displacement = direction * (Float(steps) * config.motion.stepLengthMeters)
        }
        return aid
    }

    /// Richtung der ausgehenden Kante des naechsten Knotens, die der Kompassrichtung am naechsten liegt.
    /// `nil`, wenn der Winkel groesser als `headingToleranceRadians` ist.
    private func walkDirection(from point: SIMD2<Float>, heading: SIMD2<Float>) -> SIMD2<Float>? {
        guard let node = graph.nearestNode(to: point) else { return nil }
        var best: SIMD2<Float>?
        var bestCosine = -Float.greatestFiniteMagnitude
        for neighbor in graph.neighborPoints(of: node.id) {
            let delta = neighbor - node.mapPoint
            let length = simd_length(delta)
            guard length > 0 else { continue }
            let direction = delta / length
            let cosine = simd_dot(direction, heading)
            if cosine > bestCosine {
                bestCosine = cosine
                best = direction
            }
        }
        guard let best, bestCosine >= cos(config.motion.headingToleranceRadians) else { return nil }
        return best
    }

    // MARK: - Kalibrierung und Reset

    /// Manuelle Kalibrierung: projizieren, Schaetzer und Solver-Startwert auf den Punkt setzen.
    /// Liefert den effektiven (projizierten) Punkt.
    public func calibrate(to mapPoint: SIMD2<Float>, at timestamp: TimeInterval) -> SIMD2<Float> {
        let effectivePoint = projector.project(mapPoint)?.projectedPoint ?? mapPoint
        estimator.reset(to: effectivePoint, timestamp: timestamp)
        lastSolvedPoint = effectivePoint
        // Schritte vor der Kalibrierung gehoeren zur alten Position und werden verworfen.
        _ = motion.consumeNewSteps()
        return effectivePoint
    }

    public func clearSolverSeed() {
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
    public static func rangingQuality(
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
