import Foundation
import RealityKit
import simd
import UIKit

private func normalizeAngle(_ angle: Float) -> Float {
    var value = angle
    while value > .pi { value -= 2 * .pi }
    while value < -.pi { value += 2 * .pi }
    return value
}

final class RouteMarkerPool {
    nonisolated deinit {}

    let markers: [PooledRouteMarker]
    let breadcrumbs: [PooledBreadcrumb]

    init(maxMarkers: Int, rootAnchor: AnchorEntity, configuration: ARRouteRenderConfiguration) {
        let markerCount = max(0, maxMarkers)
        let breadcrumbCount = max(0, maxMarkers - 1)

        var markerBuffer: [PooledRouteMarker] = []
        markerBuffer.reserveCapacity(markerCount)

        for _ in 0..<markerCount {
            let marker = PooledRouteMarker()
            marker.rootEntity.components.set(OpacityComponent(opacity: 0))
            marker.rootEntity.isEnabled = false
            rootAnchor.addChild(marker.rootEntity)
            markerBuffer.append(marker)
        }
        self.markers = markerBuffer

        var breadcrumbBuffer: [PooledBreadcrumb] = []
        breadcrumbBuffer.reserveCapacity(breadcrumbCount)

        for _ in 0..<breadcrumbCount {
            let breadcrumb = PooledBreadcrumb(
                width: configuration.breadcrumbWidth,
                height: configuration.breadcrumbHeight
            )
            breadcrumb.rootEntity.components.set(OpacityComponent(opacity: 0))
            breadcrumb.rootEntity.isEnabled = false
            rootAnchor.addChild(breadcrumb.rootEntity)
            breadcrumbBuffer.append(breadcrumb)
        }
        self.breadcrumbs = breadcrumbBuffer
    }
}

final class PooledRouteMarker {
    nonisolated deinit {}

    let rootEntity = Entity()

    private let wingA: ModelEntity
    private let wingB: ModelEntity

    private let baseColor = UIColor(red: 0.12, green: 0.78, blue: 1.0, alpha: 1)
    private let highlightColor = UIColor(red: 1.0, green: 0.58, blue: 0.15, alpha: 1)

    private var currentPosition = SIMD3<Float>(repeating: 0)
    private var targetPosition = SIMD3<Float>(repeating: 0)

    private var currentYaw: Float = 0
    private var targetYaw: Float = 0

    private var currentScale: Float = 1
    private var targetScale: Float = 1

    private var currentOpacity: Float = 0
    private var targetOpacity: Float = 0

    private var highlighted = false

    init() {
        let wingMesh = MeshResource.generateBox(size: [0.03, 0.003, 0.16], cornerRadius: 0.001)
        let material = UnlitMaterial(color: baseColor)

        wingA = ModelEntity(mesh: wingMesh, materials: [material])
        wingB = ModelEntity(mesh: wingMesh, materials: [material])

        wingA.position = SIMD3<Float>(-0.035, 0, 0)
        wingB.position = SIMD3<Float>(0.035, 0, 0)

        wingA.orientation = simd_quatf(angle: .pi / 6, axis: [0, 1, 0])
        wingB.orientation = simd_quatf(angle: -.pi / 6, axis: [0, 1, 0])

        rootEntity.addChild(wingA)
        rootEntity.addChild(wingB)
    }

    func setTarget(
        position: SIMD3<Float>,
        yaw: Float,
        opacity: Float,
        scale: Float,
        highlighted: Bool
    ) {
        targetPosition = position
        targetYaw = yaw
        targetOpacity = max(0, min(1, opacity))
        targetScale = max(0.65, min(1.35, scale))

        if self.highlighted != highlighted {
            self.highlighted = highlighted
            applyMaterial(highlighted ? highlightColor : baseColor)
        }
    }

    func hide() {
        targetOpacity = 0
    }

    func step(positionAlpha: Float, orientationAlpha: Float, opacityAlpha: Float) {
        currentPosition += (targetPosition - currentPosition) * positionAlpha

        let yawDelta = normalizeAngle(targetYaw - currentYaw)
        currentYaw += yawDelta * orientationAlpha

        currentScale += (targetScale - currentScale) * positionAlpha
        currentOpacity += (targetOpacity - currentOpacity) * opacityAlpha

        rootEntity.position = currentPosition
        rootEntity.orientation = simd_quatf(angle: currentYaw, axis: [0, 1, 0])
        rootEntity.scale = SIMD3<Float>(repeating: currentScale)
        rootEntity.components.set(OpacityComponent(opacity: currentOpacity))

        rootEntity.isEnabled = currentOpacity > 0.02 || targetOpacity > 0.02
    }

    private func applyMaterial(_ color: UIColor) {
        let material = UnlitMaterial(color: color)
        wingA.model?.materials = [material]
        wingB.model?.materials = [material]
    }
}

final class PooledBreadcrumb {
    nonisolated deinit {}

    let rootEntity: ModelEntity

    private var currentPosition = SIMD3<Float>(repeating: 0)
    private var targetPosition = SIMD3<Float>(repeating: 0)

    private var currentYaw: Float = 0
    private var targetYaw: Float = 0

    private var currentLength: Float = 0.001
    private var targetLength: Float = 0.001

    private var currentOpacity: Float = 0
    private var targetOpacity: Float = 0

    init(width: Float, height: Float) {
        let mesh = MeshResource.generateBox(size: [width, height, 1.0], cornerRadius: 0.0005)
        let material = UnlitMaterial(color: UIColor(red: 0.11, green: 0.58, blue: 0.95, alpha: 1))
        rootEntity = ModelEntity(mesh: mesh, materials: [material])
    }

    func setTarget(start: SIMD3<Float>, end: SIMD3<Float>, opacity: Float) {
        let direction = end - start
        let length = max(0.001, simd_length(direction))
        let midpoint = (start + end) * 0.5

        targetPosition = midpoint
        targetYaw = atan2(direction.x, direction.z)
        targetLength = length
        targetOpacity = max(0, min(1, opacity))
    }

    func hide() {
        targetOpacity = 0
    }

    func step(positionAlpha: Float, orientationAlpha: Float, opacityAlpha: Float) {
        currentPosition += (targetPosition - currentPosition) * positionAlpha

        let yawDelta = normalizeAngle(targetYaw - currentYaw)
        currentYaw += yawDelta * orientationAlpha

        currentLength += (targetLength - currentLength) * positionAlpha
        currentOpacity += (targetOpacity - currentOpacity) * opacityAlpha

        rootEntity.position = currentPosition
        rootEntity.orientation = simd_quatf(angle: currentYaw, axis: [0, 1, 0])
        rootEntity.scale = SIMD3<Float>(1, 1, currentLength)
        rootEntity.components.set(OpacityComponent(opacity: currentOpacity))
        rootEntity.isEnabled = currentOpacity > 0.02 || targetOpacity > 0.02
    }
}
