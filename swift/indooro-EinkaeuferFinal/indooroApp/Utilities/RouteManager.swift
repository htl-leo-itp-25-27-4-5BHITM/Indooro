import Foundation
import simd

struct RouteUpdateResult {
    let routePolyline: [SIMD2<Float>]
    let routeChanged: Bool
    let distanceToRoute: Float
    let activeRouteEdgeID: Int?
    let nextTurnDistance: Float?
    let isOffRouteStable: Bool
    let triggeredReroute: Bool
}

/// Eingang von `RouteManager.update`: projizierte Position plus Rohschaetzung.
/// Wird mit der Navigations-Session (Gruppe 7) durch deren eigene Logik ersetzt.
struct RouteInputPose {
    let rawPosition: SIMD2<Float>
    let snappedPosition: SIMD2<Float>
    let edgeID: Int
    let distanceToRaw: Float

    init(projection: IndoorEdgeProjection, estimate: SIMD2<Float>) {
        rawPosition = estimate
        snappedPosition = projection.projectedPoint
        edgeID = projection.edgeID
        distanceToRaw = projection.distanceToPoint
    }
}

final class RouteManager {
    private let graph: IndoorGraph
    private let config: RouteStabilityConfig

    private(set) var currentRoute: IndoorRoute?
    private(set) var destinationMapPoint: SIMD2<Float>?

    private var routeFrozen = false
    private var offRouteSince: TimeInterval?
    private var lastRerouteAt: TimeInterval?
    private var currentRouteStartPoint: SIMD2<Float>?

    private var lockedRouteEdgeIndex: Int?
    private var maxProgressAlongRoute: Float = 0

    private var edgePrefixDistances: [Float] = []
    private var routeTurnDistances: [Float] = []
    private var routeTotalDistance: Float = 0

    init(graph: IndoorGraph, config: RouteStabilityConfig) {
        self.graph = graph
        self.config = config
    }

    func setRouteFrozen(_ frozen: Bool) {
        routeFrozen = frozen
    }

    func clearRoute() {
        currentRoute = nil
        destinationMapPoint = nil
        offRouteSince = nil
        lastRerouteAt = nil
        currentRouteStartPoint = nil
        lockedRouteEdgeIndex = nil
        maxProgressAlongRoute = 0
        edgePrefixDistances = []
        routeTurnDistances = []
        routeTotalDistance = 0
    }

    @discardableResult
    func setDestination(_ mapPoint: SIMD2<Float>, from startMapPoint: SIMD2<Float>) -> Bool {
        destinationMapPoint = mapPoint
        return buildRoute(from: startMapPoint, to: mapPoint)
    }

    @discardableResult
    func handleManualCalibration(at mapPoint: SIMD2<Float>, timestamp: TimeInterval) -> Bool {
        offRouteSince = nil
        lockedRouteEdgeIndex = nil
        maxProgressAlongRoute = 0

        guard config.manualCalibrationTriggersReroute, let destinationMapPoint else {
            return false
        }

        let didUpdate = buildRoute(from: mapPoint, to: destinationMapPoint)
        if didUpdate {
            lastRerouteAt = timestamp
        }
        return didUpdate
    }

    func update(with matchedPose: RouteInputPose, timestamp: TimeInterval) -> RouteUpdateResult {
        guard let route = currentRoute, !route.edgeIDs.isEmpty else {
            return RouteUpdateResult(
                routePolyline: [],
                routeChanged: false,
                distanceToRoute: 0,
                activeRouteEdgeID: nil,
                nextTurnDistance: nil,
                isOffRouteStable: false,
                triggeredReroute: false
            )
        }

        var nearestOnRoute = nearestRouteEdge(to: matchedPose)
        let distanceToRoute = nearestOnRoute.distance

        var lockedIndex = updateProgressLock(
            nearestRouteEdgeIndex: nearestOnRoute.edgeIndex,
            matchedPose: matchedPose,
            nearestDistance: distanceToRoute,
            progressAlongRoute: nearestOnRoute.progress
        )

        var activeEdgeID = route.edgeIDs[safe: lockedIndex]

        var routeChanged = false
        var triggeredReroute = false

        let alternativeGain = alternativeEdgeGain(
            matchedPose: matchedPose,
            activeEdgeID: activeEdgeID
        )

        let alternativeLooksBetter = alternativeGain >= config.rerouteRequiresAlternativeEdgeScoreGain
        let looksOffRoute = distanceToRoute > config.offRouteDistanceMeters && alternativeLooksBetter

        if looksOffRoute {
            if offRouteSince == nil {
                offRouteSince = timestamp
            }
        } else {
            offRouteSince = nil
        }

        let isStableOffRoute = {
            guard let offRouteSince else { return false }
            return timestamp - offRouteSince >= config.offRouteHoldSeconds
        }()

        if isStableOffRoute,
           !routeFrozen,
           canReroute(at: timestamp),
           hasMovedEnoughForReroute(from: matchedPose.snappedPosition),
           let destinationMapPoint,
           buildRoute(from: matchedPose.snappedPosition, to: destinationMapPoint, replacingOnlyIfRelevant: true) {
            routeChanged = true
            triggeredReroute = true
            offRouteSince = nil
            lastRerouteAt = timestamp

            nearestOnRoute = nearestRouteEdge(to: matchedPose)
            lockedIndex = updateProgressLock(
                nearestRouteEdgeIndex: nearestOnRoute.edgeIndex,
                matchedPose: matchedPose,
                nearestDistance: nearestOnRoute.distance,
                progressAlongRoute: nearestOnRoute.progress
            )
            activeEdgeID = currentRoute?.edgeIDs[safe: lockedIndex]
        } else if isStableOffRoute, !routeFrozen, canReroute(at: timestamp), hasMovedEnoughForReroute(from: matchedPose.snappedPosition) {
            lastRerouteAt = timestamp
        }

        let polyline = currentRoute?.polyline ?? []
        let progressForTurn = min(routeTotalDistance, maxProgressAlongRoute)

        return RouteUpdateResult(
            routePolyline: polyline,
            routeChanged: routeChanged,
            distanceToRoute: distanceToRoute,
            activeRouteEdgeID: activeEdgeID,
            nextTurnDistance: nextTurnDistance(from: progressForTurn),
            isOffRouteStable: isStableOffRoute,
            triggeredReroute: triggeredReroute
        )
    }

    private func canReroute(at timestamp: TimeInterval) -> Bool {
        guard let lastRerouteAt else {
            return true
        }
        return timestamp - lastRerouteAt >= config.rerouteCooldownSeconds
    }

    private func hasMovedEnoughForReroute(from mapPoint: SIMD2<Float>) -> Bool {
        guard let currentRouteStartPoint else {
            return true
        }
        return simd_length(mapPoint - currentRouteStartPoint) >= config.minReroutePositionChangeMeters
    }

    @discardableResult
    private func buildRoute(
        from startPoint: SIMD2<Float>,
        to endPoint: SIMD2<Float>,
        replacingOnlyIfRelevant: Bool = false
    ) -> Bool {
        guard let newRoute = graph.plannedRoute(from: startPoint, to: endPoint, floor: 0), !newRoute.edgeIDs.isEmpty else {
            return false
        }

        if replacingOnlyIfRelevant,
           let currentRoute,
           !isRouteReplacementRelevant(currentRoute: currentRoute, newRoute: newRoute) {
            return false
        }

        currentRoute = newRoute
        currentRouteStartPoint = startPoint
        offRouteSince = nil
        lockedRouteEdgeIndex = 0
        maxProgressAlongRoute = 0
        precomputeRouteCaches(for: newRoute)
        return true
    }

    private func precomputeRouteCaches(for route: IndoorRoute) {
        edgePrefixDistances = Array(repeating: 0, count: route.edgeIDs.count + 1)

        for index in route.edgeIDs.indices {
            let edgeLength = graph.edge(id: route.edgeIDs[index])?.cost ?? 0
            edgePrefixDistances[index + 1] = edgePrefixDistances[index] + edgeLength
        }

        routeTotalDistance = edgePrefixDistances.last ?? 0
        routeTurnDistances = computeTurnDistances(for: route.polyline)
    }

    private func computeTurnDistances(for polyline: [SIMD2<Float>], thresholdRadians: Float = .pi / 7) -> [Float] {
        guard polyline.count >= 3 else { return [] }

        var cumulative: [Float] = Array(repeating: 0, count: polyline.count)
        for index in 1..<polyline.count {
            cumulative[index] = cumulative[index - 1] + simd_length(polyline[index] - polyline[index - 1])
        }

        var turns: [Float] = []
        for index in 1..<(polyline.count - 1) {
            let incoming = polyline[index] - polyline[index - 1]
            let outgoing = polyline[index + 1] - polyline[index]
            guard simd_length_squared(incoming) > 0.0001,
                  simd_length_squared(outgoing) > 0.0001 else {
                continue
            }

            let a = simd_normalize(incoming)
            let b = simd_normalize(outgoing)
            let angle = acos(max(-1 as Float, min(1 as Float, simd_dot(a, b))))
            if angle > thresholdRadians {
                turns.append(cumulative[index])
            }
        }

        return turns
    }

    private func nextTurnDistance(from routeProgress: Float) -> Float? {
        if let turn = routeTurnDistances.first(where: { $0 > routeProgress }) {
            return max(0, turn - routeProgress)
        }

        if routeTotalDistance > 0 {
            return max(0, routeTotalDistance - routeProgress)
        }

        return nil
    }

    private func nearestRouteEdge(to matchedPose: RouteInputPose) -> (edgeIndex: Int, distance: Float, progress: Float) {
        guard let route = currentRoute, !route.edgeIDs.isEmpty else {
            return (0, 0, 0)
        }

        var bestEdgeIndex = 0
        var bestDistance = Float.greatestFiniteMagnitude
        var bestProgress: Float = 0

        for index in route.edgeIDs.indices {
            let edgeID = route.edgeIDs[index]
            guard let projection = graph.project(point: matchedPose.snappedPosition, onto: edgeID) else {
                continue
            }

            if projection.distanceToPoint < bestDistance {
                bestDistance = projection.distanceToPoint
                bestEdgeIndex = index
                let base = edgePrefixDistances[safe: index] ?? 0
                bestProgress = base + projection.alongEdgeDistance
            }
        }

        if bestDistance.isFinite == false {
            return (0, 0, 0)
        }

        return (bestEdgeIndex, bestDistance, bestProgress)
    }

    private func updateProgressLock(
        nearestRouteEdgeIndex: Int,
        matchedPose: RouteInputPose,
        nearestDistance: Float,
        progressAlongRoute: Float
    ) -> Int {
        guard let route = currentRoute, !route.edgeIDs.isEmpty else {
            lockedRouteEdgeIndex = nil
            return 0
        }

        maxProgressAlongRoute = max(maxProgressAlongRoute, progressAlongRoute)

        if lockedRouteEdgeIndex == nil {
            lockedRouteEdgeIndex = nearestRouteEdgeIndex
        }

        guard var lockedIndex = lockedRouteEdgeIndex else {
            return nearestRouteEdgeIndex
        }

        if nearestRouteEdgeIndex == lockedIndex {
            return lockedIndex
        }

        if nearestRouteEdgeIndex > lockedIndex {
            let lockedEdgeEndProgress = edgePrefixDistances[safe: lockedIndex + 1] ?? routeTotalDistance
            let closeToEdgeEnd = progressAlongRoute + config.decisionUnlockDistanceMeters >= lockedEdgeEndProgress
            let clearlyLeftEdge = distanceToEdge(index: lockedIndex, point: matchedPose.snappedPosition) > config.activeSegmentLockDistanceMeters
            if closeToEdgeEnd || clearlyLeftEdge {
                lockedIndex = min(nearestRouteEdgeIndex, lockedIndex + 1)
            }
        } else {
            let backtrack = maxProgressAlongRoute - progressAlongRoute
            if backtrack > config.progressBacktrackToleranceMeters && nearestDistance > config.activeSegmentLockDistanceMeters {
                lockedIndex = nearestRouteEdgeIndex
                maxProgressAlongRoute = progressAlongRoute
            }
        }

        lockedRouteEdgeIndex = lockedIndex
        return lockedIndex
    }

    private func distanceToEdge(index: Int, point: SIMD2<Float>) -> Float {
        guard let edgeID = currentRoute?.edgeIDs[safe: index],
              let projection = graph.project(point: point, onto: edgeID) else {
            return .greatestFiniteMagnitude
        }
        return projection.distanceToPoint
    }

    private func alternativeEdgeGain(matchedPose: RouteInputPose, activeEdgeID: Int?) -> Float {
        guard let activeEdgeID,
              matchedPose.edgeID != activeEdgeID,
              let activeProjection = graph.project(point: matchedPose.rawPosition, onto: activeEdgeID) else {
            return 0
        }

        return activeProjection.distanceToPoint - matchedPose.distanceToRaw
    }

    private func isRouteReplacementRelevant(currentRoute: IndoorRoute, newRoute: IndoorRoute) -> Bool {
        let routeCostDifference = abs(currentRoute.totalCost - newRoute.totalCost)
        let polylineLengthDifference = abs(polylineLength(currentRoute.polyline) - polylineLength(newRoute.polyline))

        if routeCostDifference >= config.minRouteDifferenceToReplace
            || polylineLengthDifference >= config.minRouteDifferenceToReplace {
            return true
        }

        guard currentRoute.edgeIDs == newRoute.edgeIDs else {
            return false
        }

        return maxPolylinePointDistance(currentRoute.polyline, newRoute.polyline) >= config.minRouteDifferenceToReplace
    }

    private func polylineLength(_ polyline: [SIMD2<Float>]) -> Float {
        guard polyline.count > 1 else {
            return 0
        }

        var length: Float = 0
        for index in 1..<polyline.count {
            length += simd_length(polyline[index] - polyline[index - 1])
        }
        return length
    }

    private func maxPolylinePointDistance(_ lhs: [SIMD2<Float>], _ rhs: [SIMD2<Float>]) -> Float {
        guard lhs.isEmpty == false || rhs.isEmpty == false else {
            return 0
        }

        if lhs.count != rhs.count {
            return .greatestFiniteMagnitude
        }

        var maxDistance: Float = 0
        for index in lhs.indices {
            maxDistance = max(maxDistance, simd_length(lhs[index] - rhs[index]))
        }
        return maxDistance
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        guard indices.contains(index) else {
            return nil
        }
        return self[index]
    }
}
