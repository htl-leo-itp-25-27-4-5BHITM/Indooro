import Foundation
import ARKit
import simd

struct ARMapAlignment {
    var worldOriginForMapOrigin: SIMD3<Float>
    var yawRadians: Float
    var metersPerMapUnit: Float
    var fallbackFloorY: Float

    private var rotation: simd_float3x3 {
        let c = cos(yawRadians)
        let s = sin(yawRadians)
        return simd_float3x3(
            SIMD3<Float>(c, 0, -s),
            SIMD3<Float>(0, 1, 0),
            SIMD3<Float>(s, 0, c)
        )
    }

    func worldPosition(for mapPoint: SIMD2<Float>, floorY: Float?) -> SIMD3<Float> {
        let local = SIMD3<Float>(mapPoint.x * metersPerMapUnit, 0, mapPoint.y * metersPerMapUnit)
        let rotated = rotation * local
        let y = floorY ?? fallbackFloorY
        return SIMD3<Float>(
            worldOriginForMapOrigin.x + rotated.x,
            y,
            worldOriginForMapOrigin.z + rotated.z
        )
    }

    func mapPoint(for worldPosition: SIMD3<Float>) -> SIMD2<Float> {
        let relative = SIMD3<Float>(
            worldPosition.x - worldOriginForMapOrigin.x,
            0,
            worldPosition.z - worldOriginForMapOrigin.z
        )
        let local = simd_transpose(rotation) * relative
        return SIMD2<Float>(
            local.x / metersPerMapUnit,
            local.z / metersPerMapUnit
        )
    }

    func worldYaw(for mapHeading: Float) -> Float {
        let localForward = SIMD3<Float>(sin(mapHeading), 0, cos(mapHeading))
        let worldForward = rotation * localForward
        return atan2(worldForward.x, worldForward.z)
    }
}

final class ContinuousAlignmentService {
    nonisolated deinit {}

    private(set) var alignment: ARMapAlignment?
    private(set) var lastCalibration: ARAlignmentSnapshot?
    private(set) var smoothedFloorY: Float?
    private(set) var needsMotionYawCalibrationHint = false
    private(set) var debugPhaseString: String = "WAIT_TRACKING"

    var isReadyForRouteDisplay: Bool {
        alignment != nil
    }

    private let floorSmoothingAlpha: Float
    private let originSmoothingAlpha: Float
    private var manualAlignment: ARMapAlignment?
    private var pendingManualReanchor: SIMD2<Float>?

    init(floorSmoothingAlpha: Float = 0.14, originSmoothingAlpha: Float = 0.18) {
        self.floorSmoothingAlpha = floorSmoothingAlpha
        self.originSmoothingAlpha = originSmoothingAlpha
    }

    func setManualAlignment(_ alignment: ARMapAlignment?) {
        manualAlignment = alignment
        self.alignment = alignment
        debugPhaseString = alignment == nil ? "WAIT_TRACKING" : "MANUAL"
        needsMotionYawCalibrationHint = alignment == nil
    }

    func queueManualReanchor(at mapPoint: SIMD2<Float>) {
        pendingManualReanchor = mapPoint
    }

    func updateFloorEstimate(rawFloorY: Float?) -> Float? {
        guard let rawFloorY else {
            return smoothedFloorY
        }

        if let existing = smoothedFloorY {
            smoothedFloorY = existing + (rawFloorY - existing) * floorSmoothingAlpha
        } else {
            smoothedFloorY = rawFloorY
        }

        if var active = alignment, let floor = smoothedFloorY {
            active.fallbackFloorY = floor
            active.worldOriginForMapOrigin.y = floor
            alignment = active
        }

        return smoothedFloorY
    }

    @discardableResult
    func forceAlignment(
        frame: ARFrame,
        userMapPoint: SIMD2<Float>,
        routeMapPoints: [SIMD2<Float>],
        userHeadingRadians _: Float? = nil,
        headingReliable _: Bool = false,
        metersPerMapUnit: Float = 1.0
    ) -> ARMapAlignment? {
        let floorY = smoothedFloorY ?? 0
        let userWorldGround = groundPosition(from: frame, floorY: floorY)
        let yaw = resolvedYaw(
            frame: frame,
            mapPoint: userMapPoint,
            routePolyline: routeMapPoints,
            fallbackYaw: alignment?.yawRadians
        ) ?? 0

        let target = buildAlignment(
            userMapPoint: userMapPoint,
            userWorldGround: userWorldGround,
            yaw: yaw,
            metersPerMapUnit: metersPerMapUnit,
            floorY: floorY
        )

        let solved = smoothAlignment(existing: alignment, target: target)
        alignment = solved
        pendingManualReanchor = nil
        lastCalibration = ARAlignmentSnapshot(
            mapPoint: userMapPoint,
            headingRadians: nil,
            timestamp: frame.timestamp,
            source: .manualConfirmation
        )
        debugPhaseString = "REANCHORED"
        needsMotionYawCalibrationHint = false
        return solved
    }

    @discardableResult
    func ensureAlignment(
        frame: ARFrame,
        userMapPoint: SIMD2<Float>?,
        trackingState: ARCamera.TrackingState,
        routePolyline: [SIMD2<Float>] = []
    ) -> ARMapAlignment? {
        if let manualAlignment {
            alignment = manualAlignment
            debugPhaseString = "MANUAL"
            needsMotionYawCalibrationHint = false
            return manualAlignment
        }

        guard trackingState.isNormal else {
            debugPhaseString = "WAIT_TRACKING"
            needsMotionYawCalibrationHint = alignment == nil
            return alignment
        }

        let floorY = smoothedFloorY ?? 0
        let userWorldGround = groundPosition(from: frame, floorY: floorY)

        if let reanchorPoint = pendingManualReanchor {
            return forceAlignment(
                frame: frame,
                userMapPoint: reanchorPoint,
                routeMapPoints: routePolyline,
                metersPerMapUnit: alignment?.metersPerMapUnit ?? 1.0
            )
        }

        guard let userMapPoint else {
            debugPhaseString = "WAIT_POSITION"
            needsMotionYawCalibrationHint = true
            return alignment
        }

        if let existing = alignment {
            let target = buildAlignment(
                userMapPoint: userMapPoint,
                userWorldGround: userWorldGround,
                yaw: existing.yawRadians,
                metersPerMapUnit: existing.metersPerMapUnit,
                floorY: floorY
            )
            let solved = smoothAlignment(existing: existing, target: target)
            alignment = solved
            lastCalibration = ARAlignmentSnapshot(
                mapPoint: userMapPoint,
                headingRadians: nil,
                timestamp: frame.timestamp,
                source: .liveEstimate
            )
            debugPhaseString = "LIVE"
            needsMotionYawCalibrationHint = false
            return solved
        }

        guard let yaw = resolvedYaw(
            frame: frame,
            mapPoint: userMapPoint,
            routePolyline: routePolyline,
            fallbackYaw: nil
        ) else {
            debugPhaseString = routePolyline.count >= 2 ? "WAIT_ROUTE" : "WAIT_ALIGNMENT"
            needsMotionYawCalibrationHint = true
            return nil
        }

        let solved = buildAlignment(
            userMapPoint: userMapPoint,
            userWorldGround: userWorldGround,
            yaw: yaw,
            metersPerMapUnit: 1.0,
            floorY: floorY
        )
        alignment = solved
        lastCalibration = ARAlignmentSnapshot(
            mapPoint: userMapPoint,
            headingRadians: nil,
            timestamp: frame.timestamp,
            source: .liveEstimate
        )
        debugPhaseString = "ALIGNED"
        needsMotionYawCalibrationHint = false
        return solved
    }

    private func resolvedYaw(
        frame: ARFrame,
        mapPoint: SIMD2<Float>,
        routePolyline: [SIMD2<Float>],
        fallbackYaw: Float?
    ) -> Float? {
        guard let cameraHeading = cameraHeadingRadians(frame: frame) else {
            return fallbackYaw
        }

        if let routeHeading = estimateMapHeading(routeMapPoints: routePolyline, around: mapPoint) {
            return normalizeAngle(routeHeading - cameraHeading)
        }

        return fallbackYaw
    }

    private func buildAlignment(
        userMapPoint: SIMD2<Float>,
        userWorldGround: SIMD3<Float>,
        yaw: Float,
        metersPerMapUnit: Float,
        floorY: Float
    ) -> ARMapAlignment {
        let rotation = yRotation(yaw)
        let local = SIMD3<Float>(userMapPoint.x * metersPerMapUnit, 0, userMapPoint.y * metersPerMapUnit)
        let rotatedLocal = rotation * local
        let worldOrigin = userWorldGround - rotatedLocal

        return ARMapAlignment(
            worldOriginForMapOrigin: worldOrigin,
            yawRadians: yaw,
            metersPerMapUnit: metersPerMapUnit,
            fallbackFloorY: floorY
        )
    }

    private func smoothAlignment(existing: ARMapAlignment?, target: ARMapAlignment) -> ARMapAlignment {
        guard let existing else {
            return target
        }

        return ARMapAlignment(
            worldOriginForMapOrigin: existing.worldOriginForMapOrigin
                + (target.worldOriginForMapOrigin - existing.worldOriginForMapOrigin) * originSmoothingAlpha,
            yawRadians: existing.yawRadians,
            metersPerMapUnit: target.metersPerMapUnit,
            fallbackFloorY: existing.fallbackFloorY + (target.fallbackFloorY - existing.fallbackFloorY) * floorSmoothingAlpha
        )
    }

    private func estimateMapHeading(routeMapPoints: [SIMD2<Float>], around userMapPoint: SIMD2<Float>) -> Float? {
        guard routeMapPoints.count >= 2 else {
            return nil
        }

        var closestSegment = 0
        var closestDistance = Float.greatestFiniteMagnitude

        for index in 0..<(routeMapPoints.count - 1) {
            let distance = pointToSegmentDistance(
                point: userMapPoint,
                segA: routeMapPoints[index],
                segB: routeMapPoints[index + 1]
            )
            if distance < closestDistance {
                closestDistance = distance
                closestSegment = index
            }
        }

        let segment = routeMapPoints[closestSegment + 1] - routeMapPoints[closestSegment]
        guard simd_length_squared(segment) > 0.0001 else {
            return nil
        }

        let direction = simd_normalize(segment)
        return atan2(direction.x, direction.y)
    }

    private func pointToSegmentDistance(point: SIMD2<Float>, segA: SIMD2<Float>, segB: SIMD2<Float>) -> Float {
        let ab = segB - segA
        let ap = point - segA
        let abLenSq = simd_length_squared(ab)
        guard abLenSq > 0.0001 else {
            return simd_length(ap)
        }

        let t = clamp(simd_dot(ap, ab) / abLenSq, 0, 1)
        let projection = segA + ab * t
        return simd_length(point - projection)
    }

    private func groundPosition(from frame: ARFrame, floorY: Float) -> SIMD3<Float> {
        let cameraWorld = frame.camera.transform.translation
        return SIMD3<Float>(cameraWorld.x, floorY, cameraWorld.z)
    }

    private func cameraHeadingRadians(frame: ARFrame) -> Float? {
        let forward = SIMD2<Float>(
            -frame.camera.transform.columns.2.x,
            -frame.camera.transform.columns.2.z
        )
        let length = simd_length(forward)
        guard length > 0.0001 else {
            return nil
        }

        let direction = forward / length
        return atan2(direction.x, direction.y)
    }

    private func yRotation(_ angle: Float) -> simd_float3x3 {
        let c = cos(angle)
        let s = sin(angle)
        return simd_float3x3(
            SIMD3<Float>(c, 0, -s),
            SIMD3<Float>(0, 1, 0),
            SIMD3<Float>(s, 0, c)
        )
    }

    private func normalizeAngle(_ angle: Float) -> Float {
        var value = angle
        while value > .pi {
            value -= 2 * .pi
        }
        while value < -.pi {
            value += 2 * .pi
        }
        return value
    }

    private func clamp(_ value: Float, _ lo: Float, _ hi: Float) -> Float {
        max(lo, min(hi, value))
    }
}

private extension ARCamera.TrackingState {
    var isNormal: Bool {
        if case .normal = self {
            return true
        }
        return false
    }
}

extension simd_float4x4 {
    var translation: SIMD3<Float> {
        SIMD3<Float>(columns.3.x, columns.3.y, columns.3.z)
    }
}
