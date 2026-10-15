import Foundation
import simd

/// Ein Ziel der Navigation (Einkaufsstopp oder einzelnes Ziel). Die Planung (Reihenfolge)
/// liegt ausserhalb der Session; sie bekommt nur fertig geordnete Stopps.
struct NavigationStop: Equatable, Identifiable {
    let id: String
    var title: String
    var mapPoint: SIMD2<Float>

    init(id: String, title: String, mapPoint: SIMD2<Float>) {
        self.id = id
        self.title = title
        self.mapPoint = mapPoint
    }
}

enum NavigationSessionMode: Equatable {
    case idle
    case singleTarget
    case tour
}

/// Routen-Polylinie mit Bogenlaengen. Alle Fortschritts- und Abstandsrechnungen der Session laufen hier.
struct NavigationRoutePath: Equatable {
    let points: [SIMD2<Float>]
    private let cumulative: [Float]

    var totalLength: Float { cumulative.last ?? 0 }

    init(points: [SIMD2<Float>]) {
        var cleaned: [SIMD2<Float>] = []
        for point in points where cleaned.last != point {
            cleaned.append(point)
        }
        self.points = cleaned

        var running: [Float] = []
        running.reserveCapacity(cleaned.count)
        var total: Float = 0
        for index in cleaned.indices {
            if index > 0 {
                total += simd_length(cleaned[index] - cleaned[index - 1])
            }
            running.append(total)
        }
        self.cumulative = running
    }

    /// Naechster Punkt der Polylinie: Abstand und Bogenlaenge. Bei gleichem Abstand gewinnt
    /// die Bogenlaenge, die `preferredArc` am naechsten liegt (Routen, die sich selbst beruehren).
    func closestPoint(to point: SIMD2<Float>, preferredArc: Float = 0) -> (distance: Float, arc: Float) {
        guard points.count >= 2 else {
            return (points.first.map { simd_length($0 - point) } ?? 0, 0)
        }

        var bestDistance = Float.greatestFiniteMagnitude
        var bestArc: Float = 0
        for index in 0..<(points.count - 1) {
            let start = points[index]
            let segment = points[index + 1] - start
            let lengthSq = simd_length_squared(segment)
            let t = lengthSq > 1e-9 ? max(0, min(1, simd_dot(point - start, segment) / lengthSq)) : 0
            let projected = start + segment * t
            let distance = simd_length(projected - point)
            let arc = cumulative[index] + sqrt(lengthSq) * t
            let isCloser = distance < bestDistance - 1e-4
            let isTie = abs(distance - bestDistance) <= 1e-4
            if isCloser || (isTie && abs(arc - preferredArc) < abs(bestArc - preferredArc)) {
                bestDistance = distance
                bestArc = arc
            }
        }
        return (bestDistance, bestArc)
    }

    func point(atArc arc: Float) -> SIMD2<Float> {
        guard let first = points.first else { return .zero }
        guard points.count >= 2 else { return first }
        let clamped = max(0, min(totalLength, arc))
        for index in 1..<points.count where cumulative[index] >= clamped {
            let segmentLength = cumulative[index] - cumulative[index - 1]
            guard segmentLength > 1e-9 else { return points[index] }
            let t = (clamped - cumulative[index - 1]) / segmentLength
            return points[index - 1] + (points[index] - points[index - 1]) * t
        }
        return points[points.count - 1]
    }

    /// Polylinie vom Fortschrittspunkt bis zum Ziel.
    func remainingPolyline(from arc: Float) -> [SIMD2<Float>] {
        guard points.count >= 2 else { return points }
        let clamped = max(0, min(totalLength, arc))
        var remaining: [SIMD2<Float>] = [point(atArc: clamped)]
        for index in points.indices where cumulative[index] > clamped + 1e-4 {
            remaining.append(points[index])
        }
        return remaining
    }
}

/// Reine Logik der Navigations-Session (Ereignisse rein, Zustand raus; Zeit wird injiziert).
/// Besitzt Plan, aktiven Stopp, aktive Route, Fortschritt und Off-Route-Evidenz.
/// Positions-Updates aendern nur Fortschritt und Off-Route-Evidenz, nie den Plan.
struct NavigationSessionCore {
    static let lowConfidenceMessage = "Signal schwach - Kalibrierung empfohlen"
    static let singleTargetStopID = "single-target"

    private(set) var mode: NavigationSessionMode = .idle
    private(set) var plan: [NavigationStop] = []
    private(set) var activeStopID: String?
    private(set) var activeRoute: NavigationRoutePath?
    private(set) var routeProgress: Float = 0
    private(set) var maxRouteProgress: Float = 0
    private(set) var offRouteSince: TimeInterval?
    private(set) var isLowConfidence = false
    private(set) var statusMessage: String?
    private(set) var lastPosition: SIMD2<Float>?
    /// Anzahl gebauter Routen seit Start (fuer Tests und Replay-Metriken).
    private(set) var routeBuildCount = 0

    private var graph: IndoorGraph?
    private var needsRoute = false
    private let routeConfig: RouteStabilityConfig
    private let confidenceConfig: ConfidenceConfig

    init(
        graph: IndoorGraph? = nil,
        routeConfig: RouteStabilityConfig = StabilizedNavigationConfig.default.route,
        confidenceConfig: ConfidenceConfig = StabilizedNavigationConfig.default.confidence
    ) {
        self.graph = graph
        self.routeConfig = routeConfig
        self.confidenceConfig = confidenceConfig
    }

    // MARK: - Abgeleitete Werte

    var activeStop: NavigationStop? {
        guard let activeStopID else { return nil }
        return plan.first { $0.id == activeStopID }
    }

    var remainingRoutePolyline: [SIMD2<Float>] {
        activeRoute?.remainingPolyline(from: routeProgress) ?? []
    }

    var remainingRouteLength: Float {
        guard let activeRoute else { return 0 }
        return max(0, activeRoute.totalLength - routeProgress)
    }

    // MARK: - Ereignisse

    /// Merkt eine bekannte Position, ohne Fortschritt oder Off-Route zu bewerten
    /// (Startpunkt fuer Routen, bevor der erste Tick eintrifft).
    mutating func seedPosition(_ position: SIMD2<Float>?) {
        if lastPosition == nil {
            lastPosition = position
        }
    }

    mutating func startTour(plan newPlan: [NavigationStop]) {
        guard let first = newPlan.first else {
            stopTour()
            return
        }
        mode = .tour
        plan = newPlan
        activeStopID = first.id
        beginRoute()
    }

    /// Setzt ein einzelnes Ziel. Dasselbe Ziel erneut zu setzen aendert nichts (kein Route-Flattern).
    mutating func setSingleTarget(_ point: SIMD2<Float>, title: String = "Ziel") {
        if mode == .singleTarget, let activeStop, activeStop.mapPoint == point {
            return
        }
        let stop = NavigationStop(id: Self.singleTargetStopID, title: title, mapPoint: point)
        mode = .singleTarget
        plan = [stop]
        activeStopID = stop.id
        beginRoute()
    }

    /// Ein Positionierungs-Tick: mit Position wie `positionUpdated`, ohne Loesung nur die Konfidenz.
    mutating func tickUpdated(projected: SIMD2<Float>?, confidence: Float, at now: TimeInterval) {
        if let projected {
            positionUpdated(projected, confidence: confidence, at: now)
        } else {
            confidenceUpdated(confidence)
        }
    }

    mutating func positionUpdated(_ projected: SIMD2<Float>, confidence: Float, at now: TimeInterval) {
        lastPosition = projected
        confidenceUpdated(confidence)

        if needsRoute {
            buildRoute(from: projected)
            return
        }

        guard let route = activeRoute else { return }

        let closest = route.closestPoint(to: projected, preferredArc: maxRouteProgress)
        updateProgress(arc: closest.arc)
        evaluateOffRoute(distance: closest.distance, position: projected, at: now)
    }

    mutating func confidenceUpdated(_ confidence: Float) {
        if isLowConfidence {
            if confidence >= confidenceConfig.recoverThreshold {
                isLowConfidence = false
                statusMessage = nil
            }
        } else if confidence < confidenceConfig.lowThreshold {
            isLowConfidence = true
            statusMessage = Self.lowConfidenceMessage
            offRouteSince = nil
        }
    }

    /// Stopp erledigt: der naechste Stopp des gespeicherten Plans wird aktiv.
    mutating func stopCompleted() {
        advanceToNextStop()
    }

    /// Stopp uebersprungen: gleiche Wirkung auf den Plan wie `stopCompleted`.
    mutating func stopSkipped() {
        advanceToNextStop()
    }

    /// Liste geaendert: Der aktive Stopp bleibt, solange er im neuen Plan vorkommt. Die Route wird
    /// nur neu gebaut, wenn sich der aktive Stopp geaendert hat oder verschoben wurde.
    mutating func listChanged(plan newPlan: [NavigationStop]) {
        guard mode == .tour else { return }
        guard !newPlan.isEmpty else {
            stopTour()
            return
        }

        if let active = activeStop, let index = newPlan.firstIndex(where: { $0.id == active.id }) {
            let updated = newPlan[index]
            var ordered = newPlan
            ordered.remove(at: index)
            ordered.insert(updated, at: 0)
            plan = ordered
            if updated.mapPoint != active.mapPoint {
                beginRoute()
            }
            return
        }

        plan = newPlan
        activeStopID = newPlan[0].id
        beginRoute()
    }

    /// Fahrmodus umgeschaltet: neu planen, der aktive Stopp darf wechseln. Route nur bei Wechsel.
    mutating func routeModeToggled(plan newPlan: [NavigationStop]) {
        replace(plan: newPlan, forceRoute: false)
    }

    /// „Neu planen“: neue Reihenfolge ab der aktuellen Position, Route wird immer neu gebaut.
    mutating func replanRequested(plan newPlan: [NavigationStop]) {
        replace(plan: newPlan, forceRoute: true)
    }

    /// Neues Layout: Graph ersetzen, Route und Fortschritt zuruecksetzen. Ohne neuen Plan wird ein
    /// einzelnes Ziel verworfen (Store/Layout gewechselt), eine Tour behaelt ihren Plan.
    mutating func layoutChanged(graph newGraph: IndoorGraph?, plan newPlan: [NavigationStop]? = nil) {
        graph = newGraph
        clearRoute()

        if let newPlan {
            if newPlan.isEmpty {
                stopTour()
            } else {
                mode = .tour
                plan = newPlan
                activeStopID = newPlan[0].id
                beginRoute()
            }
            return
        }

        switch mode {
        case .idle:
            break
        case .singleTarget:
            stopTour()
        case .tour:
            beginRoute()
        }
    }

    /// Manuelle Kalibrierung: nur die Route zum aktiven Stopp wird von der kalibrierten Position neu
    /// gebaut. Plan und aktiver Stopp bleiben unveraendert.
    mutating func manualCalibration(at projected: SIMD2<Float>) {
        lastPosition = projected
        offRouteSince = nil
        guard activeStop != nil else { return }
        buildRoute(from: projected)
    }

    mutating func stopTour() {
        mode = .idle
        plan = []
        activeStopID = nil
        clearRoute()
    }

    /// Ziel entfernt (Produktwechsel, Storewechsel, Layoutfehler): alles verwerfen.
    mutating func clearTarget() {
        stopTour()
    }

    // MARK: - Intern

    private mutating func replace(plan newPlan: [NavigationStop], forceRoute: Bool) {
        guard mode == .tour else { return }
        guard let first = newPlan.first else {
            stopTour()
            return
        }
        let previous = activeStop
        plan = newPlan
        activeStopID = first.id
        if forceRoute || previous != first || activeRoute == nil {
            beginRoute()
        }
    }

    private mutating func advanceToNextStop() {
        guard mode == .tour, let activeStopID else {
            if mode == .singleTarget { stopTour() }
            return
        }
        plan.removeAll { $0.id == activeStopID }
        guard let next = plan.first else {
            stopTour()
            return
        }
        self.activeStopID = next.id
        beginRoute()
    }

    private mutating func clearRoute() {
        activeRoute = nil
        routeProgress = 0
        maxRouteProgress = 0
        offRouteSince = nil
        needsRoute = false
    }

    /// Route zum aktiven Stopp von der letzten bekannten Position bauen; ohne Position beim naechsten Tick.
    private mutating func beginRoute() {
        clearRoute()
        guard activeStop != nil else { return }
        if let lastPosition {
            buildRoute(from: lastPosition)
        } else {
            needsRoute = true
        }
    }

    private mutating func buildRoute(from start: SIMD2<Float>) {
        needsRoute = false
        offRouteSince = nil
        guard let route = makeRoute(from: start) else {
            activeRoute = nil
            routeProgress = 0
            maxRouteProgress = 0
            return
        }
        applyRoute(route)
    }

    private func makeRoute(from start: SIMD2<Float>) -> NavigationRoutePath? {
        guard let graph, let stop = activeStop,
              let route = graph.shortestRoute(
                from: start,
                to: stop.mapPoint,
                floor: 0,
                turnPenalty: routeConfig.turnPenaltyMeters
              ),
              // Start und Ziel im selben Graphknoten: keine Route.
              route.edgeIDs.isEmpty == false else {
            return nil
        }
        return NavigationRoutePath(points: route.polyline)
    }

    private mutating func applyRoute(_ route: NavigationRoutePath) {
        activeRoute = route
        routeProgress = 0
        maxRouteProgress = 0
        routeBuildCount += 1
    }

    private mutating func updateProgress(arc: Float) {
        if arc >= maxRouteProgress {
            maxRouteProgress = arc
            routeProgress = arc
        } else if maxRouteProgress - arc > routeConfig.progressBacktrackToleranceMeters {
            maxRouteProgress = arc
            routeProgress = arc
        }
    }

    private mutating func evaluateOffRoute(distance: Float, position: SIMD2<Float>, at now: TimeInterval) {
        guard distance > routeConfig.offRouteDistanceMeters, !isLowConfidence else {
            offRouteSince = nil
            return
        }

        guard let since = offRouteSince else {
            offRouteSince = now
            return
        }

        guard now - since >= routeConfig.offRouteHoldSeconds else { return }

        // Nur die Route zum aktiven Stopp wird von der projizierten Position neu gebaut.
        offRouteSince = nil
        if let route = makeRoute(from: position) {
            applyRoute(route)
        }
    }
}
