import IndooroModels
import Foundation
import simd

/// Ein Ziel der Navigation (Einkaufsstopp oder einzelnes Ziel). Die Planung (Reihenfolge)
/// liegt ausserhalb der Session; sie bekommt nur fertig geordnete Stopps.
public struct NavigationStop: Equatable, Identifiable {
    public let id: String
    public var title: String
    public var mapPoint: SIMD2<Float>

    public init(id: String, title: String, mapPoint: SIMD2<Float>) {
        self.id = id
        self.title = title
        self.mapPoint = mapPoint
    }
}

public enum NavigationSessionMode: Equatable {
    case idle
    case singleTarget
    case tour
}

/// Routen-Polylinie mit Bogenlaengen. Alle Fortschritts- und Abstandsrechnungen der Session laufen hier.
public struct NavigationRoutePath: Equatable {
    public let points: [SIMD2<Float>]
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

/// Herkunft des Routenursprungs: vertrauenswuerdige Position, Eingang oder zuletzt erledigter Stopp.
public enum NavigationRouteOriginKind: Equatable {
    case position
    case entrance
    case lastStop(String)
}

extension IndoorGraph {
    /// Mittelpunkt des ersten Layout-Elements vom Typ `entrance`; nil, wenn es keinen Eingang gibt.
    public static func entrancePoint(in elements: [LayoutElement]) -> SIMD2<Float>? {
        guard let entrance = elements.first(where: { $0.type == "entrance" }) else { return nil }
        return SIMD2(
            Float(entrance.x + (entrance.width ?? 1) / 2),
            Float(entrance.y + (entrance.height ?? 1) / 2)
        )
    }
}

/// Reine Logik der Navigations-Session (Ereignisse rein, Zustand raus; Zeit wird injiziert).
/// Besitzt Plan, aktiven Stopp, aktive Route, Fortschritt und Off-Route-Evidenz.
/// Positions-Updates aendern nur Fortschritt und Off-Route-Evidenz, nie den Plan.
public struct NavigationSessionCore {
    static let lowConfidenceMessage = "Signal schwach - Kalibrierung empfohlen"
    static let singleTargetStopID = "single-target"

    public private(set) var mode: NavigationSessionMode = .idle
    public private(set) var plan: [NavigationStop] = []
    public private(set) var activeStopID: String?
    public private(set) var activeRoute: NavigationRoutePath?
    public private(set) var routeProgress: Float = 0
    private(set) var maxRouteProgress: Float = 0
    private(set) var offRouteSince: TimeInterval?
    public private(set) var isLowConfidence = false
    public private(set) var statusMessage: String?
    private(set) var lastPosition: SIMD2<Float>?
    /// Anzahl gebauter Routen seit Start (fuer Tests und Replay-Metriken).
    public private(set) var routeBuildCount = 0
    /// Routen-Neubauten durch die Off-Route-Regel (nur bei erfolgreich gebauter Route).
    public private(set) var rerouteCount = 0
    /// Wechsel des aktiven Stopps bei Positionsereignissen ohne Stopp-Ereignis (Invariante: stets 0).
    public private(set) var stopChangeWithoutEventCount = 0
    /// Manuelle Kalibrierungen seit Start.
    public private(set) var manualPositionCount = 0
    /// Eine vertrauenswuerdige Position liegt vor (Seed oder Tick mit `trusted`).
    private(set) var hasTrustedPosition = false
    /// Ersatz-Startpunkt ohne vertraute Position: Eingang oder zuletzt erledigter Stopp.
    private(set) var fallbackOrigin: SIMD2<Float>?
    public private(set) var routeOriginKind: NavigationRouteOriginKind = .position

    private var fallbackOriginKind: NavigationRouteOriginKind?
    /// Manuell gesetzte Position gilt, bis ein vertrauter Tick eintrifft oder Tour/Layout endet.
    private var manualPositionHolds = false
    private var entrancePoint: SIMD2<Float>?
    private var graph: IndoorGraph?
    private var needsRoute = false
    private let routeConfig: RouteStabilityConfig
    private let confidenceConfig: ConfidenceConfig

    public init(
        graph: IndoorGraph? = nil,
        entrancePoint: SIMD2<Float>? = nil,
        routeConfig: RouteStabilityConfig = StabilizedNavigationConfig.default.route,
        confidenceConfig: ConfidenceConfig = StabilizedNavigationConfig.default.confidence
    ) {
        self.graph = graph
        self.entrancePoint = entrancePoint
        self.routeConfig = routeConfig
        self.confidenceConfig = confidenceConfig
    }

    // MARK: - Abgeleitete Werte

    public var activeStop: NavigationStop? {
        guard let activeStopID else { return nil }
        return plan.first { $0.id == activeStopID }
    }

    public var remainingRoutePolyline: [SIMD2<Float>] {
        activeRoute?.remainingPolyline(from: routeProgress) ?? []
    }

    public var remainingRouteLength: Float {
        guard let activeRoute else { return 0 }
        return max(0, activeRoute.totalLength - routeProgress)
    }

    // MARK: - Ereignisse

    /// Merkt eine bekannte Position, ohne Fortschritt oder Off-Route zu bewerten
    /// (Startpunkt fuer Routen, bevor der erste Tick eintrifft). Nur vertrauenswuerdige Positionen
    /// setzen den Startpunkt; unsichere lassen die Route auf dem Fallback-Ursprung.
    public mutating func seedPosition(_ position: SIMD2<Float>?, trusted: Bool = true) {
        if trusted, lastPosition == nil, let position {
            lastPosition = position
            hasTrustedPosition = true
        }
    }

    public mutating func startTour(plan newPlan: [NavigationStop]) {
        guard let first = newPlan.first else {
            stopTour()
            return
        }
        mode = .tour
        plan = newPlan
        activeStopID = first.id
        useEntranceAsFallback()
        beginRoute()
    }

    /// Setzt ein einzelnes Ziel. Dasselbe Ziel erneut zu setzen aendert nichts (kein Route-Flattern).
    public mutating func setSingleTarget(_ point: SIMD2<Float>, title: String = "Ziel") {
        if mode == .singleTarget, let activeStop, activeStop.mapPoint == point {
            return
        }
        let stop = NavigationStop(id: Self.singleTargetStopID, title: title, mapPoint: point)
        mode = .singleTarget
        plan = [stop]
        activeStopID = stop.id
        useEntranceAsFallback()
        beginRoute()
    }

    /// Ein Positionierungs-Tick: mit Position wie `positionUpdated`, ohne Loesung nur die Konfidenz
    /// (ohne Position bleibt nur eine noch gueltige manuelle Kalibrierung vertraut).
    public mutating func tickUpdated(projected: SIMD2<Float>?, confidence: Float, at now: TimeInterval, trusted: Bool = true) {
        let stopBefore = activeStopID
        if let projected {
            applyPosition(projected, confidence: confidence, at: now, trusted: trusted)
        } else {
            hasTrustedPosition = manualPositionHolds
            applyConfidence(confidence)
        }
        countStopChangeWithoutEvent(since: stopBefore)
    }

    /// `trusted: false`: nur die Konfidenz wird aktualisiert; Position, Fortschritt und Off-Route bleiben unberuehrt.
    mutating func positionUpdated(_ projected: SIMD2<Float>, confidence: Float, at now: TimeInterval, trusted: Bool = true) {
        let stopBefore = activeStopID
        applyPosition(projected, confidence: confidence, at: now, trusted: trusted)
        countStopChangeWithoutEvent(since: stopBefore)
    }

    mutating func confidenceUpdated(_ confidence: Float) {
        let stopBefore = activeStopID
        applyConfidence(confidence)
        countStopChangeWithoutEvent(since: stopBefore)
    }

    /// Stopp erledigt: der naechste Stopp des gespeicherten Plans wird aktiv.
    public mutating func stopCompleted() {
        advanceToNextStop()
    }

    /// Stopp uebersprungen: gleiche Wirkung auf den Plan wie `stopCompleted`.
    public mutating func stopSkipped() {
        advanceToNextStop()
    }

    /// Liste geaendert: Der aktive Stopp bleibt, solange er im neuen Plan vorkommt. Die Route wird
    /// nur neu gebaut, wenn sich der aktive Stopp geaendert hat oder verschoben wurde.
    public mutating func listChanged(plan newPlan: [NavigationStop]) {
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
    public mutating func routeModeToggled(plan newPlan: [NavigationStop]) {
        replace(plan: newPlan, forceRoute: false)
    }

    /// „Neu planen“: neue Reihenfolge ab der aktuellen Position, Route wird immer neu gebaut.
    public mutating func replanRequested(plan newPlan: [NavigationStop]) {
        replace(plan: newPlan, forceRoute: true)
    }

    /// Neues Layout: Graph und Eingang ersetzen, Route und Fortschritt zuruecksetzen. Ohne neuen Plan wird
    /// ein einzelnes Ziel verworfen (Store/Layout gewechselt), eine Tour behaelt ihren Plan.
    /// Ein erledigter Stopp bleibt als Fallback-Ursprung erhalten, sonst gilt der neue Eingang.
    public mutating func layoutChanged(graph newGraph: IndoorGraph?, entrance: SIMD2<Float>? = nil, plan newPlan: [NavigationStop]? = nil) {
        manualPositionHolds = false
        graph = newGraph
        entrancePoint = entrance
        clearRoute()

        if let newPlan {
            if newPlan.isEmpty {
                stopTour()
            } else {
                mode = .tour
                plan = newPlan
                activeStopID = newPlan[0].id
                useEntranceAsFallback()
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
            if !isStopFallback {
                useEntranceAsFallback()
            }
            beginRoute()
        }
    }

    /// Manuelle Kalibrierung: nur die Route zum aktiven Stopp wird von der kalibrierten Position neu
    /// gebaut. Plan und aktiver Stopp bleiben unveraendert. Die Kalibrierung gilt als vertraut.
    public mutating func manualCalibration(at projected: SIMD2<Float>) {
        manualPositionCount += 1
        lastPosition = projected
        hasTrustedPosition = true
        manualPositionHolds = true
        fallbackOrigin = nil
        fallbackOriginKind = nil
        offRouteSince = nil
        guard activeStop != nil else { return }
        buildRoute(from: projected, origin: .position)
    }

    public mutating func stopTour() {
        manualPositionHolds = false
        mode = .idle
        plan = []
        activeStopID = nil
        fallbackOrigin = nil
        fallbackOriginKind = nil
        clearRoute()
    }

    /// Ziel entfernt (Produktwechsel, Storewechsel, Layoutfehler): alles verwerfen.
    public mutating func clearTarget() {
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

    /// Erledigt oder uebersprungen: der verlassene Stopp wird ohne vertraute Position zum Startpunkt.
    private mutating func advanceToNextStop() {
        guard mode == .tour, let activeStopID else {
            if mode == .singleTarget { stopTour() }
            return
        }
        let left = plan.first { $0.id == activeStopID }
        plan.removeAll { $0.id == activeStopID }
        guard let next = plan.first else {
            stopTour()
            return
        }
        self.activeStopID = next.id
        if !hasTrustedPosition, let left {
            fallbackOrigin = walkable(left.mapPoint)
            fallbackOriginKind = .lastStop(left.title)
        } else {
            fallbackOrigin = nil
            fallbackOriginKind = nil
        }
        beginRoute()
    }

    /// Ohne vertraute Position ist der Eingang der Startpunkt; mit vertrauter Position wird kein Fallback gebraucht.
    private mutating func useEntranceAsFallback() {
        guard !hasTrustedPosition, let entrancePoint else {
            fallbackOrigin = nil
            fallbackOriginKind = nil
            return
        }
        fallbackOrigin = walkable(entrancePoint)
        fallbackOriginKind = .entrance
    }

    private var isStopFallback: Bool {
        if case .lastStop? = fallbackOriginKind { return true }
        return false
    }

    /// Punkt auf den naechsten begehbaren Punkt des Graphen; ohne Graph bleibt der Punkt unveraendert.
    private func walkable(_ point: SIMD2<Float>) -> SIMD2<Float> {
        guard let graph, let projection = WalkableProjector(graph: graph).project(point) else { return point }
        return projection.projectedPoint
    }

    private mutating func clearRoute() {
        activeRoute = nil
        routeProgress = 0
        maxRouteProgress = 0
        offRouteSince = nil
        needsRoute = false
        routeOriginKind = .position
    }

    /// Route zum aktiven Stopp: von der vertrauten Position, sonst vom Fallback-Ursprung, sonst beim naechsten
    /// vertrauten Tick (ohne Ursprung keine Route, kein Fehler).
    private mutating func beginRoute() {
        clearRoute()
        guard activeStop != nil else { return }
        if hasTrustedPosition, let lastPosition {
            buildRoute(from: lastPosition, origin: .position)
        } else if let fallbackOrigin {
            buildRoute(from: fallbackOrigin, origin: fallbackOriginKind ?? .entrance)
            // Ohne baubare Fallback-Route wartet die Session auf die erste vertraute Position.
            if activeRoute == nil {
                needsRoute = true
            }
        } else {
            needsRoute = true
        }
    }

    private mutating func buildRoute(from start: SIMD2<Float>, origin: NavigationRouteOriginKind) {
        needsRoute = false
        offRouteSince = nil
        guard let route = makeRoute(from: start) else {
            activeRoute = nil
            routeProgress = 0
            maxRouteProgress = 0
            routeOriginKind = .position
            return
        }
        applyRoute(route, origin: origin)
    }

    /// Positionsereignis: vertraut oder nicht. Nur vertraute Positionen aendern Route und Fortschritt.
    private mutating func applyPosition(_ projected: SIMD2<Float>, confidence: Float, at now: TimeInterval, trusted: Bool) {
        guard trusted else {
            hasTrustedPosition = manualPositionHolds
            applyConfidence(confidence)
            return
        }

        // Sichere Solver-Aktualisierung ersetzt die manuelle Position als vertrauten Zustand.
        manualPositionHolds = false
        lastPosition = projected
        hasTrustedPosition = true
        fallbackOrigin = nil
        fallbackOriginKind = nil
        applyConfidence(confidence)

        // Route ist auf dem Fallback (oder fehlt): genau einmal von der vertrauten Position neu bauen.
        if needsRoute || routeOriginKind != .position {
            buildRoute(from: projected, origin: .position)
            return
        }

        guard let route = activeRoute else { return }

        let closest = route.closestPoint(to: projected, preferredArc: maxRouteProgress)
        updateProgress(arc: closest.arc)
        evaluateOffRoute(distance: closest.distance, position: projected, at: now)
    }

    private mutating func applyConfidence(_ confidence: Float) {
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

    /// Defensive Invariante: Positionsereignisse duerfen den aktiven Stopp nicht wechseln.
    private mutating func countStopChangeWithoutEvent(since stopBefore: String?) {
        if activeStopID != stopBefore {
            stopChangeWithoutEventCount += 1
        }
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

    private mutating func applyRoute(_ route: NavigationRoutePath, origin: NavigationRouteOriginKind) {
        activeRoute = route
        routeOriginKind = origin
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
            applyRoute(route, origin: .position)
            rerouteCount += 1
        }
    }
}
