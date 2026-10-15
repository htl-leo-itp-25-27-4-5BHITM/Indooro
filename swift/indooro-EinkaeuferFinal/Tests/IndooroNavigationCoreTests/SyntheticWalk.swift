import Foundation
import simd
@testable import IndooroNavigationCore

/// Erzeugt synthetische Laufwege entlang einer Polylinie.
/// Tick 0.35 s wie der Positionierungs-Timer der App.
struct SyntheticWalk {
    struct Sample {
        let time: TimeInterval
        let truth: SIMD2<Float>
        /// Aus Beacon-Distanzen geloeste Position inkl. Rauschen/Ausreisser.
        let solved: SIMD2<Float>
    }

    var polyline: [SIMD2<Float>]
    var speedMetersPerSecond: Double
    var tick: TimeInterval = 0.35
    var noiseSigmaMeters: Double = 0
    var outlierProbability: Double = 0
    var outlierMagnitudeMeters: Double = 6
    var dropoutProbability: Double = 0
    var seed: UInt64 = 1

    var totalLength: Float {
        zip(polyline, polyline.dropFirst()).reduce(0) { $0 + simd_length($1.1 - $1.0) }
    }

    func truth(atDistance distance: Float) -> SIMD2<Float> {
        guard polyline.count > 1 else { return polyline.first ?? .zero }
        var remaining = max(0, distance)
        for (a, b) in zip(polyline, polyline.dropFirst()) {
            let length = simd_length(b - a)
            if remaining <= length, length > 0 {
                return a + (b - a) * (remaining / length)
            }
            remaining -= length
        }
        return polyline.last ?? .zero
    }

    /// Sample-Folge; Ticks ohne Messung (Dropout) fehlen in der Ausgabe.
    func samples() -> [Sample] {
        var rng = SplitMix64(seed: seed)
        var result: [Sample] = []
        let duration = Double(totalLength) / max(speedMetersPerSecond, 0.001)
        var time = 0.0
        while time <= duration + 1e-9 {
            defer { time += tick }
            if dropoutProbability > 0, rng.nextUnit() < dropoutProbability { continue }

            let truthPoint = truth(atDistance: Float(speedMetersPerSecond * time))
            var noise = SIMD2<Float>(
                Float(rng.nextGaussian(sigma: noiseSigmaMeters)),
                Float(rng.nextGaussian(sigma: noiseSigmaMeters))
            )
            if outlierProbability > 0, rng.nextUnit() < outlierProbability {
                let angle = rng.nextUnit() * 2 * Double.pi
                noise += SIMD2<Float>(
                    Float(cos(angle) * outlierMagnitudeMeters),
                    Float(sin(angle) * outlierMagnitudeMeters)
                )
            }
            result.append(Sample(time: time, truth: truthPoint, solved: truthPoint + noise))
        }
        return result
    }

    /// Beacon-Distanzen (mit Rauschen) zur Wahrheitsposition; fuer BeaconPositionSolver-Tests.
    func beaconMeasurements(
        at truthPoint: SIMD2<Float>,
        beacons: [(name: String, point: SIMD2<Float>)],
        rng: inout SplitMix64
    ) -> [BeaconAnchorMeasurement] {
        beacons.compactMap { beacon in
            if dropoutProbability > 0, rng.nextUnit() < dropoutProbability { return nil }
            let distance = simd_length(beacon.point - truthPoint)
                + Float(rng.nextGaussian(sigma: noiseSigmaMeters))
            return BeaconAnchorMeasurement(
                beaconName: beacon.name,
                anchorPoint: beacon.point,
                distanceMeters: max(0.1, distance),
                quality: 1,
                ageSeconds: 0
            )
        }
    }
}
