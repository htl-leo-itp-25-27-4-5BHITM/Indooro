import Foundation
import CoreGraphics
import simd

enum IndoorEdgeType: String, Codable {
    case corridor
    case door
    case stairs
}

struct IndoorGraphNode: Hashable {
    let id: Int
    let mapPoint: SIMD2<Float>
    let floor: Int
}

struct IndoorGraphEdge: Hashable {
    let id: Int
    let from: Int
    let to: Int
    let polyline: [SIMD2<Float>]
    let type: IndoorEdgeType
    let cost: Float
}

struct IndoorEdgeProjection {
    let edgeID: Int
    let projectedPoint: SIMD2<Float>
    let distanceToPoint: Float
    let alongEdgeDistance: Float
    let edgeLength: Float
    let headingRadians: Float
}

struct IndoorRoute {
    let nodeIDs: [Int]
    let edgeIDs: [Int]
    let polyline: [SIMD2<Float>]
    let totalCost: Float
}

final class IndoorGraph {
    private let nodesByID: [Int: IndoorGraphNode]
    private let edgesByID: [Int: IndoorGraphEdge]
    private let adjacencyByNode: [Int: [(neighborNodeID: Int, edgeID: Int, cost: Float)]]
    private let neighboringEdgesByEdgeID: [Int: Set<Int>]

    var nodes: [IndoorGraphNode] {
        Array(nodesByID.values)
    }

    var edges: [IndoorGraphEdge] {
        Array(edgesByID.values)
    }

    init(nodes: [IndoorGraphNode], edges: [IndoorGraphEdge]) {
        self.nodesByID = Dictionary(uniqueKeysWithValues: nodes.map { ($0.id, $0) })
        self.edgesByID = Dictionary(uniqueKeysWithValues: edges.map { ($0.id, $0) })

        var adjacency: [Int: [(neighborNodeID: Int, edgeID: Int, cost: Float)]] = [:]
        var edgesTouchingNode: [Int: [Int]] = [:]

        for edge in edges {
            adjacency[edge.from, default: []].append((edge.to, edge.id, edge.cost))
            adjacency[edge.to, default: []].append((edge.from, edge.id, edge.cost))
            edgesTouchingNode[edge.from, default: []].append(edge.id)
            edgesTouchingNode[edge.to, default: []].append(edge.id)
        }

        self.adjacencyByNode = adjacency

        var neighboring: [Int: Set<Int>] = [:]
        for edge in edges {
            let touchingFrom = Set(edgesTouchingNode[edge.from] ?? [])
            let touchingTo = Set(edgesTouchingNode[edge.to] ?? [])
            neighboring[edge.id] = touchingFrom.union(touchingTo).subtracting([edge.id])
        }
        self.neighboringEdgesByEdgeID = neighboring
    }

    func node(id: Int) -> IndoorGraphNode? {
        nodesByID[id]
    }

    func edge(id: Int) -> IndoorGraphEdge? {
        edgesByID[id]
    }

    func degree(of nodeID: Int) -> Int {
        adjacencyByNode[nodeID]?.count ?? 0
    }

    func areEdgesConnected(_ edgeA: Int, _ edgeB: Int) -> Bool {
        if edgeA == edgeB {
            return true
        }
        return neighboringEdgesByEdgeID[edgeA]?.contains(edgeB) ?? false
    }

    func nearestNode(to mapPoint: SIMD2<Float>, floor: Int = 0, maxDistance: Float? = nil) -> IndoorGraphNode? {
        var best: IndoorGraphNode?
        var bestDistanceSq = Float.greatestFiniteMagnitude
        let maxDistanceSq = maxDistance.map { $0 * $0 }

        for node in nodesByID.values where node.floor == floor {
            let distanceSq = simd_length_squared(node.mapPoint - mapPoint)
            if let maxDistanceSq, distanceSq > maxDistanceSq {
                continue
            }
            if distanceSq < bestDistanceSq {
                bestDistanceSq = distanceSq
                best = node
            }
        }

        return best
    }

    func candidateEdges(
        near mapPoint: SIMD2<Float>,
        floor: Int = 0,
        within radius: Float
    ) -> [IndoorGraphEdge] {
        let radiusSq = radius * radius
        return edgesByID.values.filter { edge in
            guard let from = nodesByID[edge.from], let to = nodesByID[edge.to], from.floor == floor, to.floor == floor else {
                return false
            }

            let projection = project(point: mapPoint, onto: edge)
            return projection?.distanceToPoint ?? Float.greatestFiniteMagnitude <= radius
                || min(simd_length_squared(from.mapPoint - mapPoint), simd_length_squared(to.mapPoint - mapPoint)) <= radiusSq
        }
    }

    func nearestProjection(
        for mapPoint: SIMD2<Float>,
        floor: Int = 0,
        maxDistance: Float = .greatestFiniteMagnitude
    ) -> IndoorEdgeProjection? {
        let edges = candidateEdges(near: mapPoint, floor: floor, within: maxDistance)
        var best: IndoorEdgeProjection?

        for edge in edges {
            guard let projection = project(point: mapPoint, onto: edge), projection.distanceToPoint <= maxDistance else {
                continue
            }

            // Gleiche Distanz: kleinere Kanten-ID gewinnt, damit das Ergebnis nicht von der
            // Hash-Reihenfolge des Dictionarys abhaengt.
            if let current = best {
                let isCloser = projection.distanceToPoint < current.distanceToPoint - 1e-5
                let isTie = abs(projection.distanceToPoint - current.distanceToPoint) <= 1e-5
                if isCloser || (isTie && projection.edgeID < current.edgeID) {
                    best = projection
                }
            } else {
                best = projection
            }
        }

        return best
    }

    func project(point mapPoint: SIMD2<Float>, onto edgeID: Int) -> IndoorEdgeProjection? {
        guard let edge = edgesByID[edgeID] else { return nil }
        return project(point: mapPoint, onto: edge)
    }

    func project(point mapPoint: SIMD2<Float>, onto edge: IndoorGraphEdge) -> IndoorEdgeProjection? {
        guard edge.polyline.count >= 2 else { return nil }

        var bestPoint = edge.polyline[0]
        var bestDistanceSq = Float.greatestFiniteMagnitude
        var bestAlongDistance: Float = 0
        var accumulatedDistance: Float = 0
        var bestHeading: Float = 0

        for segmentIndex in 0..<(edge.polyline.count - 1) {
            let start = edge.polyline[segmentIndex]
            let end = edge.polyline[segmentIndex + 1]
            let segment = end - start
            let segmentLengthSq = simd_length_squared(segment)

            guard segmentLengthSq > 0.0001 else {
                continue
            }

            let t = simd_dot(mapPoint - start, segment) / segmentLengthSq
            let clampedT = max(0, min(1, t))
            let projected = start + segment * clampedT
            let distanceSq = simd_length_squared(projected - mapPoint)

            if distanceSq < bestDistanceSq {
                bestDistanceSq = distanceSq
                bestPoint = projected
                let segmentLength = sqrt(segmentLengthSq)
                bestAlongDistance = accumulatedDistance + segmentLength * clampedT
                let direction = simd_normalize(segment)
                bestHeading = atan2(direction.x, direction.y)
            }

            accumulatedDistance += sqrt(segmentLengthSq)
        }

        return IndoorEdgeProjection(
            edgeID: edge.id,
            projectedPoint: bestPoint,
            distanceToPoint: sqrt(bestDistanceSq),
            alongEdgeDistance: bestAlongDistance,
            edgeLength: max(0.001, accumulatedDistance),
            headingRadians: bestHeading
        )
    }

    func shortestRoute(
        from startPoint: SIMD2<Float>,
        to endPoint: SIMD2<Float>,
        floor: Int = 0,
        turnPenalty: Float = RouteStabilityConfig.defaultTurnPenaltyMeters
    ) -> IndoorRoute? {
        guard let startNode = nearestNode(to: startPoint, floor: floor),
              let endNode = nearestNode(to: endPoint, floor: floor) else {
            return nil
        }

        return shortestRoute(
            fromNodeID: startNode.id,
            toNodeID: endNode.id,
            startPoint: startPoint,
            endPoint: endPoint,
            turnPenalty: turnPenalty
        )
    }

    func plannedRoute(from startPoint: SIMD2<Float>, to endPoint: SIMD2<Float>, floor: Int = 0) -> IndoorRoute? {
        shortestRoute(from: startPoint, to: endPoint, floor: floor)
    }

    func plannedRouteCost(from startPoint: SIMD2<Float>, to endPoint: SIMD2<Float>, floor: Int = 0) -> Float {
        if let route = plannedRoute(from: startPoint, to: endPoint, floor: floor) {
            return route.totalCost
        }

        return simd_length(endPoint - startPoint)
    }

    /// A* ueber Zustaenden (Knoten, Eingangsrichtung). Jeder Richtungswechsel kostet
    /// `turnPenalty` zusaetzlich, damit lange Geraden bevorzugt werden. Gleiche Kosten werden
    /// ueber f, g, Knoten-ID und Richtungsreihenfolge entschieden: gleiche Eingabe, gleiche Route.
    func shortestRoute(
        fromNodeID startNodeID: Int,
        toNodeID endNodeID: Int,
        startPoint: SIMD2<Float>? = nil,
        endPoint: SIMD2<Float>? = nil,
        turnPenalty: Float = RouteStabilityConfig.defaultTurnPenaltyMeters
    ) -> IndoorRoute? {
        guard nodesByID[startNodeID] != nil, nodesByID[endNodeID] != nil else { return nil }

        struct State: Hashable {
            let node: Int
            let direction: Int // 0 = Start, 1...8 = Richtungssektor
        }
        struct OpenEntry {
            let f: Float
            let g: Float
            let state: State
        }
        struct Link {
            let previous: State
            let edgeID: Int
        }

        func isOrderedBefore(_ lhs: OpenEntry, _ rhs: OpenEntry) -> Bool {
            if lhs.f != rhs.f { return lhs.f < rhs.f }
            if lhs.g != rhs.g { return lhs.g < rhs.g }
            if lhs.state.node != rhs.state.node { return lhs.state.node < rhs.state.node }
            return lhs.state.direction < rhs.state.direction
        }

        var open = BinaryHeap<OpenEntry>(areInIncreasingOrder: isOrderedBefore)
        var gScore: [State: Float] = [:]
        var cameFrom: [State: Link] = [:]
        var closed: Set<State> = []

        let startState = State(node: startNodeID, direction: 0)
        gScore[startState] = 0
        open.push(OpenEntry(f: heuristicCost(from: startNodeID, to: endNodeID), g: 0, state: startState))

        while let entry = open.pop() {
            let current = entry.state
            if closed.contains(current) { continue }
            closed.insert(current)

            if current.node == endNodeID {
                var nodePath: [Int] = [current.node]
                var edgePath: [Int] = []
                var cursor = current
                while let link = cameFrom[cursor] {
                    edgePath.append(link.edgeID)
                    nodePath.append(link.previous.node)
                    cursor = link.previous
                }
                nodePath.reverse()
                edgePath.reverse()
                return buildRoute(
                    nodePath: nodePath,
                    edgePath: edgePath,
                    totalCost: entry.g,
                    startPoint: startPoint,
                    endPoint: endPoint
                )
            }

            let currentG = gScore[current] ?? .greatestFiniteMagnitude
            for neighbor in adjacencyByNode[current.node] ?? [] {
                let direction = directionSector(from: current.node, to: neighbor.neighborNodeID)
                let penalty = (current.direction != 0 && current.direction != direction) ? turnPenalty : 0
                let tentative = currentG + neighbor.cost + penalty
                let next = State(node: neighbor.neighborNodeID, direction: direction)
                if closed.contains(next) { continue }
                if tentative < (gScore[next] ?? .greatestFiniteMagnitude) {
                    gScore[next] = tentative
                    cameFrom[next] = Link(previous: current, edgeID: neighbor.edgeID)
                    open.push(
                        OpenEntry(
                            f: tentative + heuristicCost(from: next.node, to: endNodeID),
                            g: tentative,
                            state: next
                        )
                    )
                }
            }
        }

        return nil
    }

    /// Dijkstra ueber reine Kantenkosten (ohne Abbiegestrafe) von einem Startknoten zu allen
    /// erreichbaren Knoten. Grundlage der Distanzmatrix der Tourenplanung.
    func distances(fromNodeID startNodeID: Int) -> [Int: Float] {
        guard nodesByID[startNodeID] != nil else { return [:] }

        struct Entry {
            let cost: Float
            let node: Int
        }
        var open = BinaryHeap<Entry>(areInIncreasingOrder: { lhs, rhs in
            lhs.cost != rhs.cost ? lhs.cost < rhs.cost : lhs.node < rhs.node
        })
        var best: [Int: Float] = [startNodeID: 0]
        var settled: Set<Int> = []
        open.push(Entry(cost: 0, node: startNodeID))

        while let entry = open.pop() {
            if !settled.insert(entry.node).inserted { continue }
            for neighbor in adjacencyByNode[entry.node] ?? [] {
                let tentative = entry.cost + neighbor.cost
                if tentative < (best[neighbor.neighborNodeID] ?? .greatestFiniteMagnitude) {
                    best[neighbor.neighborNodeID] = tentative
                    open.push(Entry(cost: tentative, node: neighbor.neighborNodeID))
                }
            }
        }
        return best
    }

    /// Distanzen vom naechsten Knoten des Punktes zu allen erreichbaren Knoten.
    func distances(from point: SIMD2<Float>, floor: Int = 0) -> [Int: Float] {
        guard let node = nearestNode(to: point, floor: floor) else { return [:] }
        return distances(fromNodeID: node.id)
    }

    /// Richtung einer Kante als Sektor 1...8 (45-Grad-Raster, feste Reihenfolge).
    private func directionSector(from nodeID: Int, to otherNodeID: Int) -> Int {
        guard let a = nodesByID[nodeID], let b = nodesByID[otherNodeID] else { return 0 }
        let delta = b.mapPoint - a.mapPoint
        let angle = atan2(delta.y, delta.x) // -pi...pi
        let sector = Int((angle / (.pi / 4)).rounded())
        return ((sector % 8) + 8) % 8 + 1
    }

    private func heuristicCost(from nodeID: Int, to otherNodeID: Int) -> Float {
        guard let a = nodesByID[nodeID], let b = nodesByID[otherNodeID] else {
            return .greatestFiniteMagnitude
        }
        return simd_length(a.mapPoint - b.mapPoint)
    }

    private func buildRoute(
        nodePath: [Int],
        edgePath: [Int],
        totalCost: Float,
        startPoint: SIMD2<Float>?,
        endPoint: SIMD2<Float>?
    ) -> IndoorRoute? {
        guard !nodePath.isEmpty else { return nil }

        var polyline: [SIMD2<Float>] = []
        if let startPoint {
            polyline.append(startPoint)
        }

        for edgeIndex in edgePath.indices {
            let edgeID = edgePath[edgeIndex]
            guard let edge = edgesByID[edgeID] else { continue }

            let fromNode = nodePath[edgeIndex]
            let toNode = nodePath[edgeIndex + 1]

            let orientedPolyline: [SIMD2<Float>]
            if edge.from == fromNode && edge.to == toNode {
                orientedPolyline = edge.polyline
            } else {
                orientedPolyline = edge.polyline.reversed()
            }

            for point in orientedPolyline {
                if polyline.last != point {
                    polyline.append(point)
                }
            }
        }

        if let endPoint, polyline.last != endPoint {
            polyline.append(endPoint)
        }

        if polyline.isEmpty {
            for nodeID in nodePath {
                if let node = nodesByID[nodeID] {
                    polyline.append(node.mapPoint)
                }
            }
        }

        return IndoorRoute(nodeIDs: nodePath, edgeIDs: edgePath, polyline: polyline, totalCost: totalCost)
    }
}

enum IndoorGraphBuilder {
    static func fromLayout(gridWidth: Int, gridHeight: Int, elements: [LayoutElement]) -> IndoorGraph {
        var blockedCells: Set<GridPoint> = []

        for element in elements {
            // QR-Anker sind Positionsmarken auf dem Boden und blockieren keine Zellen.
            if element.type == "beacon" || element.type == "entrance" || element.isAnchor {
                continue
            }

            // Gedrehte Elemente blockieren nur die Zellen, die das gedrehte Rechteck wirklich ueberdeckt.
            if let rotation = element.rotation, !RotatedRectGeometry.isAxisAligned(rotation) {
                blockedCells.formUnion(
                    RotatedRectGeometry.blockedCells(
                        x: element.x,
                        y: element.y,
                        width: element.width,
                        height: element.height,
                        rotationDegrees: rotation,
                        gridWidth: gridWidth,
                        gridHeight: gridHeight
                    )
                )
                continue
            }

            let ex = Int(floor(element.x))
            let ey = Int(floor(element.y))
            let ew = max(1, Int(ceil(element.width ?? 1)))
            let eh = max(1, Int(ceil(element.height ?? 1)))

            for x in ex..<(ex + ew) {
                for y in ey..<(ey + eh) {
                    if x >= 0, x < gridWidth, y >= 0, y < gridHeight {
                        blockedCells.insert(GridPoint(x: x, y: y))
                    }
                }
            }
        }

        var nodes: [IndoorGraphNode] = []
        nodes.reserveCapacity(gridWidth * gridHeight)

        var nodeIDByGridPoint: [GridPoint: Int] = [:]

        for y in 0..<gridHeight {
            for x in 0..<gridWidth {
                let gp = GridPoint(x: x, y: y)
                if blockedCells.contains(gp) {
                    continue
                }

                let nodeID = (y * gridWidth) + x
                nodeIDByGridPoint[gp] = nodeID
                nodes.append(
                    IndoorGraphNode(
                        id: nodeID,
                        mapPoint: SIMD2<Float>(Float(x) + 0.5, Float(y) + 0.5),
                        floor: 0
                    )
                )
            }
        }

        var edges: [IndoorGraphEdge] = []
        var nextEdgeID = 0
        let nodeByID = Dictionary(uniqueKeysWithValues: nodes.map { ($0.id, $0) })

        for y in 0..<gridHeight {
            for x in 0..<gridWidth {
                let current = GridPoint(x: x, y: y)
                guard let fromNodeID = nodeIDByGridPoint[current],
                      let fromNode = nodeByID[fromNodeID] else {
                    continue
                }

                let right = GridPoint(x: x + 1, y: y)
                if let toNodeID = nodeIDByGridPoint[right],
                   let toNode = nodeByID[toNodeID] {
                    let cost = simd_length(toNode.mapPoint - fromNode.mapPoint)
                    edges.append(
                        IndoorGraphEdge(
                            id: nextEdgeID,
                            from: fromNodeID,
                            to: toNodeID,
                            polyline: [fromNode.mapPoint, toNode.mapPoint],
                            type: .corridor,
                            cost: cost
                        )
                    )
                    nextEdgeID += 1
                }

                let down = GridPoint(x: x, y: y + 1)
                if let toNodeID = nodeIDByGridPoint[down],
                   let toNode = nodeByID[toNodeID] {
                    let cost = simd_length(toNode.mapPoint - fromNode.mapPoint)
                    edges.append(
                        IndoorGraphEdge(
                            id: nextEdgeID,
                            from: fromNodeID,
                            to: toNodeID,
                            polyline: [fromNode.mapPoint, toNode.mapPoint],
                            type: .corridor,
                            cost: cost
                        )
                    )
                    nextEdgeID += 1
                }
            }
        }

        return IndoorGraph(nodes: nodes, edges: edges)
    }
}

/// Geometrie gedrehter Rechtecke auf dem Zellengitter. Rotation in Grad, im Uhrzeigersinn um den
/// Mittelpunkt, Karte mit y nach unten (wie SVG rotate in admin-ui/src/editor/geometry.ts).
enum RotatedRectGeometry {
    /// Ueberlappungen kleiner als dieser Wert (Flaeche/Kante beruehrt nur) zaehlen nicht.
    static let overlapEpsilon = 1e-6

    static func isAxisAligned(_ rotationDegrees: Double) -> Bool {
        rotationDegrees.truncatingRemainder(dividingBy: 360) == 0
    }

    /// Ecken des Rechtecks (x, y, width, height), um den Mittelpunkt um `rotationDegrees` gedreht.
    static func corners(
        x: Double,
        y: Double,
        width: Double,
        height: Double,
        rotationDegrees: Double
    ) -> [SIMD2<Double>] {
        let centerX = x + width / 2
        let centerY = y + height / 2
        let halfWidth = width / 2
        let halfHeight = height / 2
        let radians = rotationDegrees * .pi / 180
        let cosine = cos(radians)
        let sine = sin(radians)

        let local = [
            SIMD2(-halfWidth, -halfHeight),
            SIMD2(halfWidth, -halfHeight),
            SIMD2(halfWidth, halfHeight),
            SIMD2(-halfWidth, halfHeight)
        ]
        return local.map { point in
            SIMD2(
                centerX + point.x * cosine - point.y * sine,
                centerY + point.x * sine + point.y * cosine
            )
        }
    }

    /// Separating-Axis-Test: true, wenn Zelle und Rechteck eine Flaeche mit Ueberlappung > `overlapEpsilon` teilen.
    static func overlapsCell(_ cell: GridPoint, corners rectCorners: [SIMD2<Double>]) -> Bool {
        let cellX = Double(cell.x)
        let cellY = Double(cell.y)
        let cellCorners = [
            SIMD2(cellX, cellY),
            SIMD2(cellX + 1, cellY),
            SIMD2(cellX + 1, cellY + 1),
            SIMD2(cellX, cellY + 1)
        ]

        guard rectCorners.count == 4 else { return false }
        let rectEdgeA = rectCorners[1] - rectCorners[0]
        let rectEdgeB = rectCorners[3] - rectCorners[0]
        let lengthA = simd_length(rectEdgeA)
        let lengthB = simd_length(rectEdgeB)
        guard lengthA > 0, lengthB > 0 else { return false }

        let axes = [
            SIMD2(1.0, 0.0),
            SIMD2(0.0, 1.0),
            rectEdgeA / lengthA,
            rectEdgeB / lengthB
        ]

        for axis in axes {
            let cellRange = projectionRange(of: cellCorners, onto: axis)
            let rectRange = projectionRange(of: rectCorners, onto: axis)
            let overlap = min(cellRange.max, rectRange.max) - max(cellRange.min, rectRange.min)
            if overlap <= overlapEpsilon {
                return false
            }
        }
        return true
    }

    /// Alle Zellen, die das gedrehte Rechteck mit echter Flaeche ueberdeckt. Zellen ausserhalb des Gitters entfallen.
    static func blockedCells(
        x: Double,
        y: Double,
        width: Double?,
        height: Double?,
        rotationDegrees: Double,
        gridWidth: Int,
        gridHeight: Int
    ) -> Set<GridPoint> {
        let rectWidth = width ?? 1
        let rectHeight = height ?? 1
        guard rectWidth > 0, rectHeight > 0 else { return [] }

        let rectCorners = corners(
            x: x,
            y: y,
            width: rectWidth,
            height: rectHeight,
            rotationDegrees: rotationDegrees
        )
        let xs = rectCorners.map(\.x)
        let ys = rectCorners.map(\.y)
        let minCellX = max(0, Int(floor(xs.min() ?? 0)))
        let maxCellX = min(gridWidth, Int(ceil(xs.max() ?? 0)))
        let minCellY = max(0, Int(floor(ys.min() ?? 0)))
        let maxCellY = min(gridHeight, Int(ceil(ys.max() ?? 0)))

        var cells: Set<GridPoint> = []
        guard minCellX < maxCellX, minCellY < maxCellY else { return cells }

        for cellX in minCellX..<maxCellX {
            for cellY in minCellY..<maxCellY {
                let cell = GridPoint(x: cellX, y: cellY)
                if overlapsCell(cell, corners: rectCorners) {
                    cells.insert(cell)
                }
            }
        }
        return cells
    }

    private static func projectionRange(of points: [SIMD2<Double>], onto axis: SIMD2<Double>) -> (min: Double, max: Double) {
        var minimum = Double.greatestFiniteMagnitude
        var maximum = -Double.greatestFiniteMagnitude
        for point in points {
            let projected = simd_dot(point, axis)
            minimum = min(minimum, projected)
            maximum = max(maximum, projected)
        }
        return (minimum, maximum)
    }
}

extension CGPoint {
    init(_ vector: SIMD2<Float>) {
        self.init(x: CGFloat(vector.x), y: CGFloat(vector.y))
    }
}

/// Binaerer Min-Heap mit frei waehlbarer Ordnung.
struct BinaryHeap<Element> {
    private var storage: [Element] = []
    private let areInIncreasingOrder: (Element, Element) -> Bool

    init(areInIncreasingOrder: @escaping (Element, Element) -> Bool) {
        self.areInIncreasingOrder = areInIncreasingOrder
    }

    var isEmpty: Bool { storage.isEmpty }
    var count: Int { storage.count }

    mutating func push(_ element: Element) {
        storage.append(element)
        var child = storage.count - 1
        while child > 0 {
            let parent = (child - 1) / 2
            guard areInIncreasingOrder(storage[child], storage[parent]) else { break }
            storage.swapAt(child, parent)
            child = parent
        }
    }

    mutating func pop() -> Element? {
        guard let first = storage.first else { return nil }
        let last = storage.removeLast()
        if !storage.isEmpty {
            storage[0] = last
            var parent = 0
            while true {
                let left = 2 * parent + 1
                let right = left + 1
                var smallest = parent
                if left < storage.count, areInIncreasingOrder(storage[left], storage[smallest]) { smallest = left }
                if right < storage.count, areInIncreasingOrder(storage[right], storage[smallest]) { smallest = right }
                if smallest == parent { break }
                storage.swapAt(parent, smallest)
                parent = smallest
            }
        }
        return first
    }
}

struct GridPoint: Hashable, Equatable, CustomStringConvertible {
    let x: Int
    let y: Int

    var description: String {
        "(\(x), \(y))"
    }
}

extension IndoorGraph {
    /// Elemente (ohne Beacon und Eingang), deren Mittelpunkt auf einen Knoten projiziert wird, der vom Eingang
    /// aus nicht erreichbar ist. `shortestRoute` projiziert Start und Ziel selbst auf den naechsten freien Knoten;
    /// nil bedeutet: keine Route. Reine Funktion fuer die DEBUG-Diagnose.
    func unreachableShelves(in elements: [LayoutElement], from entrance: SIMD2<Float>) -> [LayoutElement] {
        elements.filter { element in
            guard element.type != "beacon", element.type != "entrance", !element.isAnchor else { return false }
            let center = SIMD2<Float>(
                Float(element.x + (element.width ?? 1) / 2),
                Float(element.y + (element.height ?? 1) / 2)
            )
            return shortestRoute(from: entrance, to: center, floor: 0, turnPenalty: 0) == nil
        }
    }
}
