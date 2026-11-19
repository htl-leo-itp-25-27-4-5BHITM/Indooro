import Foundation
import CoreGraphics
import simd
import Combine

struct ARRouteRenderConfiguration {
    var markerHeight: Float = 0.03
    var markerBaseScale: Float = 1.0
    var markerSpacing: Float = 0.75
    var curveMarkerSpacing: Float = 0.45
    var previewDistanceMeters: Float = 4.5
    var maximumWaypointCount: Int = 3
    var stopPreviewAtNextDecision: Bool = true
    var markerSmoothingAlpha: Float = 0.22
    var floorSmoothingAlpha: Float = 0.14
    var minVisibleDistance: Float = 0.25
    var maxVisibleDistance: Float = 15.0
    var maxMarkerCount: Int = 120
    var breadcrumbEnabled: Bool = true
    var breadcrumbWidth: Float = 0.02
    var breadcrumbHeight: Float = 0.002
    var hideMarkersBehindUser: Bool = true
}

struct SampledRoutePoint {
    let mapPoint: SIMD2<Float>
    let headingRadians: Float
    let cumulativeDistance: Float
    let isTurnHint: Bool
}

final class ARNavigationHUDModel: ObservableObject {
    nonisolated deinit {}

    @Published var trackingMessage: String?
    @Published var nextTurnDistanceText: String?
    @Published var dimOverlay: Bool = false
    @Published var routeDebugText: String?
}

enum RouteResampler {
    static func prepareVisualRoute(_ routeMapPoints: [SIMD2<Float>]) -> [SIMD2<Float>] {
        // AR darf die Geometrie nicht verändern; nur redundante Duplikate entfernen.
        removeConsecutiveDuplicates(routeMapPoints)
    }

    static func resample(
        routeMapPoints: [SIMD2<Float>],
        defaultSpacing: Float,
        turnSpacing: Float,
        turnThresholdRadians: Float = .pi / 9
    ) -> [SampledRoutePoint] {
        guard !routeMapPoints.isEmpty else { return [] }
        guard routeMapPoints.count > 1 else {
            return [
                SampledRoutePoint(
                    mapPoint: routeMapPoints[0],
                    headingRadians: 0,
                    cumulativeDistance: 0,
                    isTurnHint: false
                )
            ]
        }

        var resampled: [SIMD2<Float>] = [routeMapPoints[0]]

        for segmentIndex in 0..<(routeMapPoints.count - 1) {
            let start = routeMapPoints[segmentIndex]
            let end = routeMapPoints[segmentIndex + 1]
            let segment = end - start
            let length = simd_length(segment)
            guard length > 0.0001 else { continue }

            let turnWeight = localTurnWeight(
                routeMapPoints: routeMapPoints,
                segmentIndex: segmentIndex,
                threshold: turnThresholdRadians
            )
            let spacing = max(0.25, lerp(defaultSpacing, turnSpacing, t: turnWeight))
            let steps = max(1, Int(ceil(length / spacing)))

            if steps > 1 {
                for step in 1..<steps {
                    let t = Float(step) / Float(steps)
                    let point = start + (segment * t)
                    if let previous = resampled.last, simd_length(point - previous) >= 0.05 {
                        resampled.append(point)
                    }
                }
            }

            if resampled.last != end {
                resampled.append(end)
            }
        }

        return buildSampledPoints(resampled, turnThresholdRadians: turnThresholdRadians)
    }

    static func rebuildSampledPoints(
        from points: [SIMD2<Float>],
        turnThresholdRadians: Float = .pi / 9
    ) -> [SampledRoutePoint] {
        buildSampledPoints(points, turnThresholdRadians: turnThresholdRadians)
    }

    private static func buildSampledPoints(
        _ points: [SIMD2<Float>],
        turnThresholdRadians: Float
    ) -> [SampledRoutePoint] {
        guard !points.isEmpty else { return [] }

        var headings: [Float] = Array(repeating: 0, count: points.count)
        var cumulativeDistances: [Float] = Array(repeating: 0, count: points.count)
        var turnHints: [Bool] = Array(repeating: false, count: points.count)

        for idx in points.indices {
            if idx > 0 {
                cumulativeDistances[idx] = cumulativeDistances[idx - 1] + simd_length(points[idx] - points[idx - 1])
            }
        }

        if points.count >= 3 {
            for idx in 1..<(points.count - 1) {
                let incoming = points[idx] - points[idx - 1]
                let outgoing = points[idx + 1] - points[idx]
                guard simd_length_squared(incoming) > 0.0001,
                      simd_length_squared(outgoing) > 0.0001 else {
                    continue
                }

                let inDir = simd_normalize(incoming)
                let outDir = simd_normalize(outgoing)
                let clampedDot = max(-1.0 as Float, min(1.0 as Float, simd_dot(inDir, outDir)))
                let angle = acos(clampedDot)
                turnHints[idx] = angle >= turnThresholdRadians
            }
        }

        for idx in points.indices {
            let forward = idx + 1 < points.count ? points[idx + 1] - points[idx] : SIMD2<Float>(repeating: 0)
            let backward = idx > 0 ? points[idx] - points[idx - 1] : SIMD2<Float>(repeating: 0)

            let direction: SIMD2<Float>
            if simd_length_squared(forward) > 0.0001 {
                direction = forward
            } else if simd_length_squared(backward) > 0.0001 {
                direction = backward
            } else {
                continue
            }

            let norm = simd_normalize(direction)
            headings[idx] = atan2(norm.x, norm.y)
        }

        return points.indices.map { idx in
            SampledRoutePoint(
                mapPoint: points[idx],
                headingRadians: headings[idx],
                cumulativeDistance: cumulativeDistances[idx],
                isTurnHint: turnHints[idx]
            )
        }
    }

    private static func localTurnWeight(
        routeMapPoints: [SIMD2<Float>],
        segmentIndex: Int,
        threshold: Float
    ) -> Float {
        var strongestTurn: Float = 0

        if segmentIndex > 0 {
            strongestTurn = max(
                strongestTurn,
                turnStrength(
                    a: routeMapPoints[segmentIndex] - routeMapPoints[segmentIndex - 1],
                    b: routeMapPoints[segmentIndex + 1] - routeMapPoints[segmentIndex],
                    threshold: threshold
                )
            )
        }

        if segmentIndex + 2 < routeMapPoints.count {
            strongestTurn = max(
                strongestTurn,
                turnStrength(
                    a: routeMapPoints[segmentIndex + 1] - routeMapPoints[segmentIndex],
                    b: routeMapPoints[segmentIndex + 2] - routeMapPoints[segmentIndex + 1],
                    threshold: threshold
                )
            )
        }

        return strongestTurn
    }

    private static func turnStrength(a: SIMD2<Float>, b: SIMD2<Float>, threshold: Float) -> Float {
        guard simd_length_squared(a) > 0.0001,
              simd_length_squared(b) > 0.0001 else {
            return 0
        }

        let da = simd_normalize(a)
        let db = simd_normalize(b)
        let angle = acos(max(-1 as Float, min(1 as Float, simd_dot(da, db))))
        guard angle > threshold else { return 0 }

        let normalized = (angle - threshold) / (.pi - threshold)
        return max(0, min(1, normalized))
    }

    private static func lerp(_ a: Float, _ b: Float, t: Float) -> Float {
        let clamped = max(0, min(1, t))
        return a + (b - a) * clamped
    }

    private static func removeConsecutiveDuplicates(_ points: [SIMD2<Float>]) -> [SIMD2<Float>] {
        guard let first = points.first else { return [] }

        var cleaned: [SIMD2<Float>] = [first]
        cleaned.reserveCapacity(points.count)

        for point in points.dropFirst() where cleaned.last != point {
            cleaned.append(point)
        }

        return cleaned
    }

}

extension SIMD2 where Scalar == Float {
    init(_ point: CGPoint) {
        self.init(Float(point.x), Float(point.y))
    }
}
