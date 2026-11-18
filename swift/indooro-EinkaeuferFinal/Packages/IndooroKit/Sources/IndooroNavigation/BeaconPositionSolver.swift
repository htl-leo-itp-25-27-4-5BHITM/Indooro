import Foundation
import CoreGraphics
import simd

struct BeaconAnchorMeasurement {
    let beaconName: String
    let anchorPoint: SIMD2<Float>
    let distanceMeters: Float
    let quality: Float
    let ageSeconds: Float
}

struct BeaconPositionEstimate {
    let point: SIMD2<Float>
    let residualMeters: Float
    let geometryScore: Float
    let confidence: Float
    let usedBeaconCount: Int
}

final class BeaconPositionSolver {
    private let bounds: CGRect
    private let config: BeaconPositioningConfig

    init(bounds: CGRect, config: BeaconPositioningConfig) {
        self.bounds = bounds
        self.config = config
    }

    func solve(
        measurements: [BeaconAnchorMeasurement],
        previousEstimate: SIMD2<Float>? = nil
    ) -> BeaconPositionEstimate? {
        let usable = measurements.filter { measurement in
            measurement.distanceMeters.isFinite
                && measurement.distanceMeters >= config.minDistanceMeters
                && measurement.distanceMeters <= config.maxDistanceMeters
                && measurement.quality > 0
        }

        guard usable.count >= config.minBeaconCountForSolution else {
            return nil
        }

        let centroid = weightedCentroid(for: usable)
        var point = initialGuess(centroid: centroid, previousEstimate: previousEstimate)

        for _ in 0..<10 {
            let step = gaussNewtonStep(from: point, measurements: usable)
            if simd_length_squared(step) <= 0.0001 {
                break
            }

            point = clampToBounds(point - step)
        }

        let refinedResidual = residual(for: point, measurements: usable)
        let centroidResidual = residual(for: centroid, measurements: usable)
        let chosenPoint = refinedResidual <= centroidResidual + 0.05 ? point : centroid
        let chosenResidual = min(refinedResidual, centroidResidual)
        let geometryScore = geometryScore(for: usable, around: chosenPoint)
        let qualityScore = usable.reduce(0 as Float) { $0 + $1.quality } / Float(usable.count)
        let countScore = clamp(Float(usable.count - 2) / 3.0, minValue: 0, maxValue: 1)
        let residualScore = clamp(1 - (chosenResidual / 2.2), minValue: 0, maxValue: 1)
        let confidence = clamp(
            0.24 * countScore
                + 0.28 * geometryScore
                + 0.24 * qualityScore
                + 0.24 * residualScore,
            minValue: 0,
            maxValue: 1
        )

        return BeaconPositionEstimate(
            point: chosenPoint,
            residualMeters: chosenResidual,
            geometryScore: geometryScore,
            confidence: confidence,
            usedBeaconCount: usable.count
        )
    }

    private func initialGuess(centroid: SIMD2<Float>, previousEstimate: SIMD2<Float>?) -> SIMD2<Float> {
        guard let previousEstimate else {
            return centroid
        }

        return clampToBounds(previousEstimate * 0.62 + centroid * 0.38)
    }

    private func weightedCentroid(for measurements: [BeaconAnchorMeasurement]) -> SIMD2<Float> {
        var weightedSum = SIMD2<Float>(repeating: 0)
        var totalWeight: Float = 0

        for measurement in measurements {
            let distanceWeight = 1 / max(config.minDistanceMeters, measurement.distanceMeters)
            let freshnessWeight = clamp(1 - (measurement.ageSeconds / Float(config.staleMeasurementSeconds)), minValue: 0.15, maxValue: 1)
            let weight = max(0.05, measurement.quality * distanceWeight * freshnessWeight)
            weightedSum += measurement.anchorPoint * weight
            totalWeight += weight
        }

        guard totalWeight > 0 else {
            return clampToBounds(SIMD2<Float>(Float(bounds.midX), Float(bounds.midY)))
        }

        return clampToBounds(weightedSum / totalWeight)
    }

    private func gaussNewtonStep(from point: SIMD2<Float>, measurements: [BeaconAnchorMeasurement]) -> SIMD2<Float> {
        var h00: Float = config.solverDamping
        var h01: Float = 0
        var h11: Float = config.solverDamping
        var b0: Float = 0
        var b1: Float = 0

        for measurement in measurements {
            let delta = point - measurement.anchorPoint
            let predictedDistance = max(0.05, simd_length(delta))
            let direction = delta / predictedDistance
            let residual = predictedDistance - measurement.distanceMeters
            let robustWeight = huberWeight(for: abs(residual))
            let distanceWeight = 1 / max(0.4, measurement.distanceMeters)
            let freshnessWeight = clamp(
                1 - (measurement.ageSeconds / Float(config.staleMeasurementSeconds)),
                minValue: 0.12,
                maxValue: 1
            )
            let weight = max(0.05, measurement.quality * robustWeight * distanceWeight * freshnessWeight)

            h00 += weight * direction.x * direction.x
            h01 += weight * direction.x * direction.y
            h11 += weight * direction.y * direction.y

            b0 += weight * direction.x * residual
            b1 += weight * direction.y * residual
        }

        let determinant = (h00 * h11) - (h01 * h01)
        guard abs(determinant) > 0.0001 else {
            return .zero
        }

        return SIMD2<Float>(
            (h11 * b0 - h01 * b1) / determinant,
            (-h01 * b0 + h00 * b1) / determinant
        )
    }

    private func residual(for point: SIMD2<Float>, measurements: [BeaconAnchorMeasurement]) -> Float {
        var weightedError: Float = 0
        var totalWeight: Float = 0

        for measurement in measurements {
            let predictedDistance = simd_length(point - measurement.anchorPoint)
            let error = abs(predictedDistance - measurement.distanceMeters)
            let weight = max(0.05, measurement.quality)
            weightedError += (error * error) * weight
            totalWeight += weight
        }

        guard totalWeight > 0 else {
            return .greatestFiniteMagnitude
        }

        return sqrt(weightedError / totalWeight)
    }

    private func geometryScore(
        for measurements: [BeaconAnchorMeasurement],
        around point: SIMD2<Float>
    ) -> Float {
        guard measurements.count >= 3 else {
            return 0.15
        }

        let diagonal = simd_length(
            SIMD2<Float>(Float(bounds.width), Float(bounds.height))
        )
        let anchorSpread = furthestAnchorDistance(in: measurements) / max(diagonal, 0.001)

        let angles = measurements.map { measurement in
            atan2(measurement.anchorPoint.y - point.y, measurement.anchorPoint.x - point.x)
        }.sorted()

        guard let firstAngle = angles.first else {
            return clamp(anchorSpread, minValue: 0, maxValue: 1)
        }

        var largestGap: Float = 0
        for index in 0..<angles.count {
            let current = angles[index]
            let next = index + 1 < angles.count ? angles[index + 1] : firstAngle + (2 * .pi)
            largestGap = max(largestGap, next - current)
        }

        let angularCoverage = clamp(1 - (largestGap / (2 * .pi)), minValue: 0, maxValue: 1)
        return clamp(0.55 * angularCoverage + 0.45 * anchorSpread, minValue: 0, maxValue: 1)
    }

    private func furthestAnchorDistance(in measurements: [BeaconAnchorMeasurement]) -> Float {
        var best: Float = 0

        for leftIndex in measurements.indices {
            for rightIndex in measurements.indices where rightIndex > leftIndex {
                best = max(
                    best,
                    simd_length(measurements[leftIndex].anchorPoint - measurements[rightIndex].anchorPoint)
                )
            }
        }

        return best
    }

    private func huberWeight(for absoluteResidual: Float) -> Float {
        let delta = max(0.2, config.solverResidualScaleMeters)
        guard absoluteResidual > delta else {
            return 1
        }

        return delta / absoluteResidual
    }

    private func clampToBounds(_ point: SIMD2<Float>) -> SIMD2<Float> {
        SIMD2<Float>(
            clamp(point.x, minValue: Float(bounds.minX), maxValue: Float(bounds.maxX)),
            clamp(point.y, minValue: Float(bounds.minY), maxValue: Float(bounds.maxY))
        )
    }

    private func clamp(_ value: Float, minValue: Float, maxValue: Float) -> Float {
        Swift.max(minValue, Swift.min(maxValue, value))
    }
}
