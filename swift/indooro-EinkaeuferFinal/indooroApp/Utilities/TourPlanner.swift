import Foundation
import simd

/// Ein Stopp, wie ihn die Tourenplanung sieht (ohne Artikel). Die Einkaufs-Session bildet
/// ihre `ShoppingStop`s darauf ab.
struct TourPlanStop: Equatable, Identifiable {
    let id: String
    var title: String
    var mapPoint: SIMD2<Float>
    var orderSeed: Int

    init(id: String, title: String, mapPoint: SIMD2<Float>, orderSeed: Int) {
        self.id = id
        self.title = title
        self.mapPoint = mapPoint
        self.orderSeed = orderSeed
    }

    var navigationStop: NavigationStop {
        NavigationStop(id: id, title: title, mapPoint: mapPoint)
    }
}

enum TourPlanningMode {
    case optimized
    case listOrder
}

/// Reine Tourenplanung (design.md D9): Distanzmatrix ueber den gemeinsamen Graphen, Nearest Neighbor
/// mit Tie-Break (orderSeed, Titel) und 2-opt auf dem offenen Pfad (Start fest, Ende frei).
/// Laeuft nur bei Planungsereignissen, nie bei Positionsupdates und nie im View-Body.
enum TourPlanner {
    /// Listenreihenfolge: orderSeed, dann Titel.
    static func listOrder(_ stops: [TourPlanStop]) -> [TourPlanStop] {
        stops.sorted(by: isListOrderedBefore)
    }

    /// Ordnet die Stopps. `.listOrder`, fehlender Startpunkt oder fehlender Graph liefern die Listenreihenfolge.
    static func order(
        stops: [TourPlanStop],
        start: SIMD2<Float>?,
        graph: IndoorGraph?,
        mode: TourPlanningMode,
        config: PlanningConfig = StabilizedNavigationConfig.default.planning
    ) -> [TourPlanStop] {
        let seeded = listOrder(stops)
        guard mode == .optimized, let start, let graph, seeded.count > 1 else {
            return seeded
        }

        let matrix = DistanceMatrix(start: start, stops: seeded, graph: graph)
        // Unerreichbare Stopps kommen ans Ende, in Listenreihenfolge.
        let reachable = seeded.indices.filter { matrix.fromStart[$0].isFinite }
        let unreachable = seeded.indices.filter { !matrix.fromStart[$0].isFinite }
        guard !reachable.isEmpty else { return seeded }

        var path = nearestNeighbor(reachable: reachable, seeded: seeded, matrix: matrix)
        twoOpt(&path, matrix: matrix, config: config)
        return (path + unreachable).map { seeded[$0] }
    }

    /// Nur Nearest Neighbor (fuer Vergleiche in Tests und Messungen).
    static func nearestNeighborOrder(
        stops: [TourPlanStop],
        start: SIMD2<Float>,
        graph: IndoorGraph
    ) -> [TourPlanStop] {
        let seeded = listOrder(stops)
        let matrix = DistanceMatrix(start: start, stops: seeded, graph: graph)
        let reachable = seeded.indices.filter { matrix.fromStart[$0].isFinite }
        let unreachable = seeded.indices.filter { !matrix.fromStart[$0].isFinite }
        let path = nearestNeighbor(reachable: reachable, seeded: seeded, matrix: matrix)
        return (path + unreachable).map { seeded[$0] }
    }

    /// Laenge des offenen Pfads Start -> Stopps in dieser Reihenfolge (unerreichbare Teilstrecken zaehlen nicht).
    static func pathLength(
        of ordered: [TourPlanStop],
        start: SIMD2<Float>,
        graph: IndoorGraph
    ) -> Float {
        let matrix = DistanceMatrix(start: start, stops: ordered, graph: graph)
        var total: Float = 0
        for index in ordered.indices {
            let leg = index == 0 ? matrix.fromStart[0] : matrix.between[index - 1][index]
            if leg.isFinite { total += leg }
        }
        return total
    }

    // MARK: - Listenaenderung

    /// Plan nach einer Listenaenderung. `nil`, wenn die Menge der Stopps gleich ist wie im gespeicherten Plan
    /// (Mengen-/Artikelaenderungen ohne neuen oder entfernten Stopp planen nichts neu).
    /// Der aktive Stopp bleibt vorn, solange er noch offene Artikel hat; die uebrigen Stopps werden ab
    /// seinem Kartenpunkt neu geplant. Hat er keine mehr, wird ab `projectedStart` (sonst Eingang) geplant.
    static func planAfterListChange(
        resolved: [TourPlanStop],
        storedPlanIDs: [String],
        activeStopID: String?,
        projectedStart: SIMD2<Float>?,
        entranceStart: SIMD2<Float>?,
        graph: IndoorGraph?,
        mode: TourPlanningMode,
        config: PlanningConfig = StabilizedNavigationConfig.default.planning
    ) -> [TourPlanStop]? {
        if Set(resolved.map(\.id)) == Set(storedPlanIDs) {
            return nil
        }

        if let activeStopID, let active = resolved.first(where: { $0.id == activeStopID }) {
            let others = resolved.filter { $0.id != activeStopID }
            let ordered = order(stops: others, start: active.mapPoint, graph: graph, mode: mode, config: config)
            return [active] + ordered
        }

        return order(stops: resolved, start: projectedStart ?? entranceStart, graph: graph, mode: mode, config: config)
    }

    // MARK: - Intern

    private static func isListOrderedBefore(_ lhs: TourPlanStop, _ rhs: TourPlanStop) -> Bool {
        if lhs.orderSeed == rhs.orderSeed {
            let comparison = lhs.title.localizedCaseInsensitiveCompare(rhs.title)
            if comparison == .orderedSame { return lhs.id < rhs.id }
            return comparison == .orderedAscending
        }
        return lhs.orderSeed < rhs.orderSeed
    }

    /// Distanzen aus je einem Dijkstra vom Start und von jedem Stopp (einfache Kantenkosten).
    private struct DistanceMatrix {
        var fromStart: [Float]
        var between: [[Float]]

        init(start: SIMD2<Float>, stops: [TourPlanStop], graph: IndoorGraph) {
            let nodeIDs = stops.map { graph.nearestNode(to: $0.mapPoint)?.id }
            let startDistances = graph.distances(from: start)
            fromStart = nodeIDs.map { nodeID in
                nodeID.flatMap { startDistances[$0] } ?? .infinity
            }

            var rows: [[Float]] = []
            rows.reserveCapacity(stops.count)
            for fromNode in nodeIDs {
                guard let fromNode else {
                    rows.append(Array(repeating: .infinity, count: stops.count))
                    continue
                }
                let distances = graph.distances(fromNodeID: fromNode)
                rows.append(nodeIDs.map { toNode in
                    toNode.flatMap { distances[$0] } ?? .infinity
                })
            }
            between = rows
        }
    }

    private static func nearestNeighbor(
        reachable: [Int],
        seeded: [TourPlanStop],
        matrix: DistanceMatrix
    ) -> [Int] {
        var remaining = reachable
        var path: [Int] = []
        var current: Int?

        while !remaining.isEmpty {
            func distance(_ candidate: Int) -> Float {
                guard let current else { return matrix.fromStart[candidate] }
                return matrix.between[current][candidate]
            }
            // `remaining` bleibt in Listenreihenfolge (orderSeed, Titel); der erste Treffer gewinnt Gleichstaende.
            var bestPosition = 0
            var bestDistance = distance(remaining[0])
            for position in remaining.indices.dropFirst() {
                let candidateDistance = distance(remaining[position])
                if candidateDistance < bestDistance - 1e-4 {
                    bestDistance = candidateDistance
                    bestPosition = position
                }
            }
            let next = remaining.remove(at: bestPosition)
            path.append(next)
            current = next
        }
        return path
    }

    /// 2-opt auf dem offenen Pfad: Start fest, Ende frei. Ein Zug kehrt das Segment i...j um.
    private static func twoOpt(_ path: inout [Int], matrix: DistanceMatrix, config: PlanningConfig) {
        let count = path.count
        guard count > 1 else { return }

        for _ in 0..<config.twoOptMaxPasses {
            var improved = false
            for i in 0..<(count - 1) {
                for j in (i + 1)..<count {
                    let before = i == 0 ? matrix.fromStart[path[i]] : matrix.between[path[i - 1]][path[i]]
                    let after = i == 0 ? matrix.fromStart[path[j]] : matrix.between[path[i - 1]][path[j]]
                    var removed = before
                    var added = after
                    if j < count - 1 {
                        removed += matrix.between[path[j]][path[j + 1]]
                        added += matrix.between[path[i]][path[j + 1]]
                    }
                    if removed - added > config.twoOptMinimumGainMeters {
                        path[i...j].reverse()
                        improved = true
                    }
                }
            }
            if !improved { break }
        }
    }
}
