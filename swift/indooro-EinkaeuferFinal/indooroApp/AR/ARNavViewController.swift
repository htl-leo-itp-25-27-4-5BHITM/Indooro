import UIKit
import ARKit
import RealityKit
import simd

final class ARNavViewController: UIViewController, ARSessionDelegate {
    private let arView = ARView(frame: .zero)
    private let hudModel: ARNavigationHUDModel
    private let motionYawCalibrationMessage = "Ausrichtung wird kalibriert... halte das iPhone kurz ruhig und richte es in Blickrichtung aus."

    private(set) var renderConfiguration: ARRouteRenderConfiguration
    private let alignmentService: ContinuousAlignmentService

    private let rootAnchor = AnchorEntity(world: .zero)
    private var markerPool: RouteMarkerPool?

    private var sourceRoute: NavigationRoute = .empty
    private var routeMapPoints: [SIMD2<Float>] = []
    private var sampledRoute: [SampledRoutePoint] = []

    private var userMapPoint: SIMD2<Float>?

    private var lastFrameTimestamp: TimeInterval?
    private var overlayOpacityFactor: Float = 1
    private var externalLowConfidence: Bool = false
    private var manualCalibrationFade: Float = 1
    private var lastManualCalibrationRevision: Int = -1
    private var lastWaypointDebugLogAt: TimeInterval = 0

    init(
        hudModel: ARNavigationHUDModel,
        renderConfiguration: ARRouteRenderConfiguration = ARRouteRenderConfiguration(),
        manualAlignment: ARMapAlignment? = nil
    ) {
        self.hudModel = hudModel
        self.renderConfiguration = renderConfiguration
        self.alignmentService = ContinuousAlignmentService(floorSmoothingAlpha: renderConfiguration.floorSmoothingAlpha)
        super.init(nibName: nil, bundle: nil)

        if let manualAlignment {
            alignmentService.setManualAlignment(manualAlignment)
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func loadView() {
        view = arView
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        arView.automaticallyConfigureSession = false
        arView.renderOptions.remove(.disableMotionBlur)
        arView.environment.sceneUnderstanding.options.insert(.receivesLighting)

        arView.session.delegate = self
        arView.scene.addAnchor(rootAnchor)

        markerPool = RouteMarkerPool(
            maxMarkers: renderConfiguration.maxMarkerCount,
            rootAnchor: rootAnchor,
            configuration: renderConfiguration
        )

        runSession(resetTracking: true)
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        runSession(resetTracking: false)
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        arView.session.pause()
    }

    func updateRoute(
        route: NavigationRoute,
        userMapPoint: SIMD2<Float>?
    ) {
        let routeChanged = route != sourceRoute
        sourceRoute = route
        self.routeMapPoints = RouteResampler.prepareVisualRoute(route.points)
        if let userMapPoint {
            self.userMapPoint = userMapPoint
        }

        if routeChanged {
            let sampled = RouteResampler.resample(
                routeMapPoints: self.routeMapPoints,
                defaultSpacing: renderConfiguration.markerSpacing,
                turnSpacing: renderConfiguration.curveMarkerSpacing
            )
            self.sampledRoute = sampled
        }
        publishRouteDebug(sourceRoute: route, sampledCount: sampledRoute.count, routeChanged: routeChanged)

        if routeChanged && route.pointCount == 0 {
            // Route cleared: no need to reset alignment, just hide markers
            publishNextTurnDistance(nil)
        }
    }

    func setManualAlignment(_ alignment: ARMapAlignment?) {
        if let alignment {
            alignmentService.setManualAlignment(alignment)
        }
        // If nil, we could reset to waiting mode but for simplicity, keep manual
    }

    func updateExternalLowConfidence(_ isLowConfidence: Bool) {
        externalLowConfidence = isLowConfidence
    }

    func applyManualCalibrationIfNeeded(revision: Int, mapPoint: SIMD2<Float>) {
        guard revision != lastManualCalibrationRevision else {
            return
        }

        lastManualCalibrationRevision = revision
        alignmentService.queueManualReanchor(at: mapPoint)
        userMapPoint = mapPoint
        manualCalibrationFade = 0
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        if !Thread.isMainThread {
            DispatchQueue.main.async { [weak self] in
                self?.session(session, didUpdate: frame)
            }
            return
        }

        guard let markerPool else { return }

        let frameDelta = frameDeltaSeconds(for: frame)
        let positionAlpha = smoothingAlpha(base: renderConfiguration.markerSmoothingAlpha, deltaTime: frameDelta)
        let opacityAlpha = smoothingAlpha(base: 0.33, deltaTime: frameDelta)

        manualCalibrationFade = min(1, manualCalibrationFade + frameDelta * 1.7)
        updateTrackingState(frame.camera.trackingState, externalLowConfidence: externalLowConfidence)

        let rawFloorY = raycastFloorY()
        let floorY = alignmentService.updateFloorEstimate(rawFloorY: rawFloorY)

        switch presentationState(for: frame, rawFloorY: rawFloorY) {
        case .ready:
            break
        case .blocked(let message):
            publishTrackingMessage(message, dim: true)
            hideAllRouteVisuals(markerPool)
            stepPool(markerPool: markerPool, positionAlpha: positionAlpha, opacityAlpha: opacityAlpha)
            return
        }

        if sampledRoute.isEmpty {
            hideAllRouteVisuals(markerPool)
            stepPool(markerPool: markerPool, positionAlpha: positionAlpha, opacityAlpha: opacityAlpha)
            return
        }

        let alignment = alignmentService.ensureAlignment(
            frame: frame,
            userMapPoint: userMapPoint,
            trackingState: frame.camera.trackingState,
            routePolyline: routeMapPoints
        )

        publishRouteDebug(sourceRoute: sourceRoute, sampledCount: sampledRoute.count, routeChanged: false)

        guard let alignment else {
            if alignmentService.needsMotionYawCalibrationHint {
                publishTrackingMessage(motionYawCalibrationMessage, dim: true)
            } else {
                publishTrackingMessage("Kalibrierung fehlt: Starte an einem bekannten Punkt und richte die Kamera kurz in Blickrichtung aus.", dim: true)
            }
            hideAllRouteVisuals(markerPool)
            stepPool(markerPool: markerPool, positionAlpha: positionAlpha, opacityAlpha: opacityAlpha)
            return
        }

        let cameraPosition = frame.camera.transform.translation
        // Sobald die Route im AR-Raum verankert ist, bestimmen wir den aktuellen Fortschritt
        // bevorzugt aus der AR-Kamerapose. Sonst wuerde Beacon-Rauschen die sichtbare Route
        // laufend verschieben oder auf einen falschen Segmentbereich springen lassen.
        let userMapEstimate = alignment.mapPoint(for: cameraPosition)

        let nearestIndex = nearestRouteIndex(to: userMapEstimate)
        let previewPlan = ARRoutePreviewPlanner.makePlan(
            sampledRoute: sampledRoute,
            nearestIndex: nearestIndex,
            maxDistance: renderConfiguration.previewDistanceMeters,
            maxWaypoints: renderConfiguration.maximumWaypointCount,
            stopAtNextDecision: renderConfiguration.stopPreviewAtNextDecision
        )

        guard !previewPlan.isEmpty else {
            hideAllRouteVisuals(markerPool)
            stepPool(markerPool: markerPool, positionAlpha: positionAlpha, opacityAlpha: opacityAlpha)
            return
        }

        publishNextTurnDistance(nextTurnDistance(from: nearestIndex))

        let cameraForward = frame.camera.forwardXZ
        let headingMismatch = userMapPoint.map { simd_length($0 - userMapEstimate) } ?? 0
        if headingMismatch > 1.4 {
            publishTrackingMessage("AR driftet zur Kartenposition. Tippe 'AR neu ausrichten'.", dim: true)
        } else {
            maybePublishMotionYawCalibrationHint(for: frame.camera.trackingState)
        }

        let activeMarkerCount = min(previewPlan.waypoints.count, markerPool.markers.count)

        for markerIndex in 0..<activeMarkerCount {
            let waypoint = previewPlan.waypoints[markerIndex]
            let routeIndex = waypoint.routeIndex
            let sampled = sampledRoute[routeIndex]

            var markerPosition = alignment.worldPosition(for: sampled.mapPoint, floorY: floorY)
            markerPosition.y += renderConfiguration.markerHeight

            let toMarker = markerPosition - cameraPosition
            let cameraDistance = simd_length(toMarker)

            let distanceFade = fadeForDistance(cameraDistance)
            let behindFade: Float
            if renderConfiguration.hideMarkersBehindUser {
                let flatToMarker = SIMD3<Float>(toMarker.x, 0, toMarker.z)
                let flatLength = simd_length(flatToMarker)
                if flatLength > 0.001 {
                    let direction = flatToMarker / flatLength
                    let dot = simd_dot(cameraForward, direction)
                    behindFade = dot < -0.2 ? 0 : 1
                } else {
                    behindFade = 1
                }
            } else {
                behindFade = 1
            }

            let alreadyPassedFade: Float
            if routeIndex + 1 < nearestIndex {
                let gap = min(6, nearestIndex - routeIndex)
                alreadyPassedFade = max(0, 1 - Float(gap) / 6)
            } else {
                alreadyPassedFade = 1
            }

            var opacity = distanceFade * behindFade * alreadyPassedFade * overlayOpacityFactor * manualCalibrationFade
            let highlighted = routeIndex == previewPlan.highlightedRouteIndex
            let distanceScale = clamp(0.9 + cameraDistance * 0.018, minValue: 0.9, maxValue: 1.2)
            let scale = renderConfiguration.markerBaseScale * distanceScale * (highlighted ? 1.2 : 1.0)

            if highlighted {
                opacity = max(opacity, 0.95 * overlayOpacityFactor * manualCalibrationFade)
            }

            let worldYaw = markerWorldYaw(
                alignment: alignment,
                routeIndex: routeIndex,
                floorY: floorY
            )

            markerPool.markers[markerIndex].setTarget(
                position: markerPosition,
                yaw: worldYaw,
                opacity: opacity,
                scale: scale,
                highlighted: highlighted
            )

            if markerIndex == 0 {
                debugLogWaypoint(
                    frame: frame,
                    routeIndex: routeIndex,
                    mapHeadingRadians: sampled.headingRadians,
                    worldYawRadians: worldYaw,
                    worldPosition: markerPosition
                )
            }
        }

        if activeMarkerCount < markerPool.markers.count {
            for index in activeMarkerCount..<markerPool.markers.count {
                markerPool.markers[index].hide()
            }
        }

        let activeBreadcrumbCount: Int
        if renderConfiguration.breadcrumbEnabled {
            activeBreadcrumbCount = min(max(0, previewPlan.pathRouteIndices.count - 1), markerPool.breadcrumbs.count)
            for index in 0..<activeBreadcrumbCount {
                let startIndex = previewPlan.pathRouteIndices[index]
                let endIndex = previewPlan.pathRouteIndices[index + 1]
                var start = alignment.worldPosition(for: sampledRoute[startIndex].mapPoint, floorY: floorY)
                var end = alignment.worldPosition(for: sampledRoute[endIndex].mapPoint, floorY: floorY)
                start.y += renderConfiguration.markerHeight * 0.18
                end.y += renderConfiguration.markerHeight * 0.18

                let midpoint = (start + end) * Float(0.5)
                let distance = simd_length(midpoint - cameraPosition)
                let opacity = fadeForDistance(distance) * overlayOpacityFactor * manualCalibrationFade * 0.6
                markerPool.breadcrumbs[index].setTarget(
                    start: start,
                    end: end,
                    opacity: opacity
                )
            }
        } else {
            activeBreadcrumbCount = 0
        }

        if activeBreadcrumbCount < markerPool.breadcrumbs.count {
            for index in activeBreadcrumbCount..<markerPool.breadcrumbs.count {
                markerPool.breadcrumbs[index].hide()
            }
        }

        stepPool(markerPool: markerPool, positionAlpha: positionAlpha, opacityAlpha: opacityAlpha)
    }

    func sessionShouldAttemptRelocalization(_ session: ARSession) -> Bool {
        true
    }

    private func runSession(resetTracking: Bool) {
        let configuration = ARWorldTrackingConfiguration()
        // Indoor ist `.gravityAndHeading` oft unruhig, weil der Magnetometer-Heading
        // im Raum stark stoeren kann. Wir nutzen daher die stabile VIO-Welt (`.gravity`)
        // und kalibrieren die Karten-/AR-Yaw einmalig aus Kamera-Yaw und App-Heading.
        configuration.worldAlignment = .gravity
        configuration.planeDetection = [.horizontal]

        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            configuration.sceneReconstruction = .mesh
            arView.environment.sceneUnderstanding.options.insert(.occlusion)
        }

        if ARWorldTrackingConfiguration.supportsFrameSemantics(.personSegmentationWithDepth) {
            configuration.frameSemantics.insert(.personSegmentationWithDepth)
        }

        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            configuration.frameSemantics.insert(.sceneDepth)
        }

        let options: ARSession.RunOptions = resetTracking ? [.resetTracking, .removeExistingAnchors] : []
        arView.session.run(configuration, options: options)
    }

    private func markerWorldYaw(
        alignment: ARMapAlignment,
        routeIndex: Int,
        floorY: Float?
    ) -> Float {
        guard sampledRoute.indices.contains(routeIndex) else {
            return 0
        }

        let currentWorld = alignment.worldPosition(for: sampledRoute[routeIndex].mapPoint, floorY: floorY)

        if routeIndex + 1 < sampledRoute.count {
            let nextWorld = alignment.worldPosition(for: sampledRoute[routeIndex + 1].mapPoint, floorY: floorY)
            let delta = nextWorld - currentWorld
            let length = simd_length(SIMD2<Float>(delta.x, delta.z))
            if length > 0.0005 {
                return atan2(delta.x, delta.z)
            }
        }

        if routeIndex > 0 {
            let previousWorld = alignment.worldPosition(for: sampledRoute[routeIndex - 1].mapPoint, floorY: floorY)
            let delta = currentWorld - previousWorld
            let length = simd_length(SIMD2<Float>(delta.x, delta.z))
            if length > 0.0005 {
                return atan2(delta.x, delta.z)
            }
        }

        return alignment.worldYaw(for: sampledRoute[routeIndex].headingRadians)
    }

    private func visibleRouteWindow(around focusIndex: Int, totalCount: Int, capacity: Int) -> Range<Int> {
        guard totalCount > 0, capacity > 0 else { return 0..<0 }
        if totalCount <= capacity { return 0..<totalCount }

        let clampedFocus = max(0, min(totalCount - 1, focusIndex))
        let forwardSlots = max(1, Int((Float(capacity) * 0.72).rounded()))
        let backwardSlots = max(0, capacity - forwardSlots - 1)

        var lowerBound = max(0, clampedFocus - backwardSlots)
        var upperBound = lowerBound + capacity

        if upperBound > totalCount {
            upperBound = totalCount
            lowerBound = max(0, upperBound - capacity)
        }

        return lowerBound..<upperBound
    }

    private func publishRouteDebug(sourceRoute: NavigationRoute, sampledCount: Int, routeChanged: Bool) {
        let consumedHash = routeSignature(for: routeMapPoints)
        let hashesMatch = consumedHash == sourceRoute.signature
        let markerCount = min(sampledCount, renderConfiguration.maxMarkerCount)
        let changedFlag = routeChanged ? "ja" : "nein"
        let calibState = alignmentService.debugPhaseString
        let readyFlag = alignmentService.isReadyForRouteDisplay ? "READY" : "WAITING"
        let text = "Route-Debug | Karte: \(sourceRoute.pointCount) | AR-Samples: \(sampledCount) | Marker: \(markerCount) | Hash: \(sourceRoute.signature.prefix(10)) | Sync: \(hashesMatch ? "OK" : "MISMATCH") | calib: \(calibState) | \(readyFlag) | changed: \(changedFlag)"

        if hudModel.routeDebugText != text {
            hudModel.routeDebugText = text
        }

        if routeChanged {
            print("🧭 AR Route Debug -> \(text)")
        }
    }

    private func routeSignature(for points: [SIMD2<Float>]) -> String {
        var hash: UInt64 = 1469598103934665603
        let prime: UInt64 = 1099511628211

        func mix(_ value: Int64) {
            var raw = UInt64(bitPattern: value)
            for _ in 0..<8 {
                hash ^= (raw & 0xFF)
                hash &*= prime
                raw >>= 8
            }
        }

        for point in points {
            let quantizedX = Int64((point.x * 1000).rounded())
            let quantizedY = Int64((point.y * 1000).rounded())
            mix(quantizedX)
            mix(quantizedY)
        }

        return String(hash, radix: 16, uppercase: false)
    }

    private func nearestRouteIndex(to mapPoint: SIMD2<Float>) -> Int {
        guard !sampledRoute.isEmpty else { return 0 }

        var bestIndex = 0
        var bestDistance = Float.greatestFiniteMagnitude

        for (index, sampled) in sampledRoute.enumerated() {
            let distance = simd_length_squared(sampled.mapPoint - mapPoint)
            if distance < bestDistance {
                bestDistance = distance
                bestIndex = index
            }
        }

        return bestIndex
    }

    private func nextTurnDistance(from currentIndex: Int) -> Float? {
        guard sampledRoute.indices.contains(currentIndex) else { return nil }

        if let turnIndex = sampledRoute.indices
            .dropFirst(currentIndex + 1)
            .first(where: { sampledRoute[$0].isTurnHint }) {
            let currentDistance = sampledRoute[currentIndex].cumulativeDistance
            let nextTurnDistance = sampledRoute[turnIndex].cumulativeDistance
            return max(0, nextTurnDistance - currentDistance)
        }

        if let last = sampledRoute.last {
            let currentDistance = sampledRoute[currentIndex].cumulativeDistance
            return max(0, last.cumulativeDistance - currentDistance)
        }

        return nil
    }

    private func publishNextTurnDistance(_ distance: Float?) {
        let text: String?
        if let distance {
            if distance < 1 {
                text = "Nächste Kurve: < 1 m"
            } else {
                text = String(format: "Nächste Kurve: %.0f m", distance)
            }
        } else {
            text = nil
        }

        if hudModel.nextTurnDistanceText != text {
            hudModel.nextTurnDistanceText = text
        }
    }

    private func updateTrackingState(_ state: ARCamera.TrackingState, externalLowConfidence: Bool) {
        if externalLowConfidence {
            overlayOpacityFactor = 0.32
            publishTrackingMessage("Signal schwach. Kalibrierung empfohlen (Position setzen).", dim: true)
            return
        }

        switch state {
        case .normal:
            overlayOpacityFactor = 1
            publishTrackingMessage(nil, dim: false)

        case .limited(let reason):
            overlayOpacityFactor = 0.45
            publishTrackingMessage(message(for: reason), dim: true)

        case .notAvailable:
            overlayOpacityFactor = 0.2
            publishTrackingMessage("AR-Tracking nicht verfügbar.", dim: true)
        }
    }

    private func message(for reason: ARCamera.TrackingState.Reason) -> String {
        switch reason {
        case .initializing:
            return "AR initialisiert... bewege das iPhone langsam."
        case .excessiveMotion:
            return "Zu schnelle Bewegung erkannt. Kurz stabil halten."
        case .insufficientFeatures:
            return "Zu wenig visuelle Features. Richte die Kamera auf strukturierte Flächen."
        case .relocalizing:
            return "Tracking wird neu lokalisiert. Kurz warten."
        @unknown default:
            return "Tracking eingeschränkt."
        }
    }

    private func publishTrackingMessage(_ message: String?, dim: Bool) {
        if hudModel.trackingMessage != message {
            hudModel.trackingMessage = message
        }
        if hudModel.dimOverlay != dim {
            hudModel.dimOverlay = dim
        }
    }

    private func maybePublishMotionYawCalibrationHint(for state: ARCamera.TrackingState) {
        guard !externalLowConfidence else { return }
        guard case .normal = state else { return }

        if alignmentService.needsMotionYawCalibrationHint {
            publishTrackingMessage(motionYawCalibrationMessage, dim: false)
        } else if hudModel.trackingMessage == motionYawCalibrationMessage {
            publishTrackingMessage(nil, dim: false)
        }
    }

    private func raycastFloorY() -> Float? {
        guard arView.bounds.width > 0, arView.bounds.height > 0 else { return nil }

        let center = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)

        if let query = arView.makeRaycastQuery(from: center, allowing: .existingPlaneGeometry, alignment: .horizontal),
           let result = arView.session.raycast(query).first {
            return result.worldTransform.translation.y
        }

        if let query = arView.makeRaycastQuery(from: center, allowing: .estimatedPlane, alignment: .horizontal),
           let result = arView.session.raycast(query).first {
            return result.worldTransform.translation.y
        }

        return nil
    }

    private func stepPool(markerPool: RouteMarkerPool, positionAlpha: Float, opacityAlpha: Float) {
        let orientationAlpha = min(0.45, max(0.12, positionAlpha))
        for marker in markerPool.markers {
            marker.step(
                positionAlpha: positionAlpha,
                orientationAlpha: orientationAlpha,
                opacityAlpha: opacityAlpha
            )
        }

        for breadcrumb in markerPool.breadcrumbs {
            breadcrumb.step(
                positionAlpha: positionAlpha,
                orientationAlpha: orientationAlpha,
                opacityAlpha: opacityAlpha
            )
        }
    }

    private func fadeForDistance(_ distance: Float) -> Float {
        let near = renderConfiguration.minVisibleDistance
        let far = renderConfiguration.maxVisibleDistance

        if distance <= near { return 1 }
        if distance >= far { return 0 }

        let t = (distance - near) / (far - near)
        return 1 - (t * t)
    }

    private func frameDeltaSeconds(for frame: ARFrame) -> Float {
        let previous = lastFrameTimestamp
        lastFrameTimestamp = frame.timestamp

        guard let previous else {
            return 1.0 / 60.0
        }

        let rawDelta = Float(frame.timestamp - previous)
        return clamp(rawDelta, minValue: 1.0 / 120.0, maxValue: 1.0 / 20.0)
    }

    private func smoothingAlpha(base: Float, deltaTime: Float) -> Float {
        let fpsNormalized = min(3.0, max(0.3, deltaTime / (1.0 / 60.0)))
        return clamp(base * fpsNormalized, minValue: 0.05, maxValue: 0.9)
    }

    private func presentationState(for frame: ARFrame, rawFloorY: Float?) -> ARPresentationState {
        switch frame.camera.trackingState {
        case .normal:
            break
        case .limited(let reason):
            return .blocked(message: message(for: reason))
        case .notAvailable:
            return .blocked(message: "AR-Tracking nicht verfügbar.")
        }

        switch frame.worldMappingStatus {
        case .mapped, .extending:
            break
        case .limited:
            return .blocked(message: "AR-Welt wird noch aufgebaut. Bewege das iPhone langsam durch den Gang.")
        case .notAvailable:
            return .blocked(message: "AR-Mapping nicht verfügbar. Richte die Kamera auf Boden und markante Strukturen.")
        @unknown default:
            return .blocked(message: "AR-Mapping noch nicht stabil genug.")
        }

        if rawFloorY == nil && alignmentService.smoothedFloorY == nil {
            return .blocked(message: "Boden nicht erkannt. Richte die Kamera kurz auf den Boden.")
        }

        return .ready
    }

    private func hideAllRouteVisuals(_ markerPool: RouteMarkerPool) {
        for marker in markerPool.markers { marker.hide() }
        for breadcrumb in markerPool.breadcrumbs { breadcrumb.hide() }
    }

    private func debugLogWaypoint(
        frame: ARFrame,
        routeIndex: Int,
        mapHeadingRadians: Float,
        worldYawRadians: Float,
        worldPosition: SIMD3<Float>
    ) {
        guard frame.timestamp - lastWaypointDebugLogAt >= 0.5 else {
            return
        }
        lastWaypointDebugLogAt = frame.timestamp

        let cameraForward = SIMD2<Float>(
            -frame.camera.transform.columns.2.x,
            -frame.camera.transform.columns.2.z
        )

        print(
            String(
                format: "➡️ AR Waypoint Debug | idx=%d | camForward=(%.3f, %.3f) | mapHeading=%.3f | worldYaw=%.3f | worldPos=(%.3f, %.3f, %.3f)",
                routeIndex,
                cameraForward.x,
                cameraForward.y,
                mapHeadingRadians,
                worldYawRadians,
                worldPosition.x,
                worldPosition.y,
                worldPosition.z
            )
        )
    }

    private func clamp(_ value: Float, minValue: Float, maxValue: Float) -> Float {
        max(minValue, min(maxValue, value))
    }
}

private extension ARCamera {
    var forwardXZ: SIMD3<Float> {
        let forward = SIMD3<Float>(-transform.columns.2.x, 0, -transform.columns.2.z)
        let length = simd_length(forward)
        if length < 0.0001 {
            return SIMD3<Float>(0, 0, 1)
        }
        return forward / length
    }
}
