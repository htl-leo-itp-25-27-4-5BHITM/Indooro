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

    func shortestRoute(from startPoint: SIMD2<Float>, to endPoint: SIMD2<Float>, floor: Int = 0) -> IndoorRoute? {
        guard let startNode = nearestNode(to: startPoint, floor: floor),
              let endNode = nearestNode(to: endPoint, floor: floor) else {
            return nil
        }

        return shortestRoute(fromNodeID: startNode.id, toNodeID: endNode.id, startPoint: startPoint, endPoint: endPoint)
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

    func shortestRoute(
        fromNodeID startNodeID: Int,
        toNodeID endNodeID: Int,
        startPoint: SIMD2<Float>? = nil,
        endPoint: SIMD2<Float>? = nil
    ) -> IndoorRoute? {
        guard nodesByID[startNodeID] != nil, nodesByID[endNodeID] != nil else { return nil }

        var openSet: Set<Int> = [startNodeID]
        var cameFromNode: [Int: Int] = [:]
        var cameFromEdge: [Int: Int] = [:]

        var gScore: [Int: Float] = [startNodeID: 0]
        var fScore: [Int: Float] = [startNodeID: heuristicCost(from: startNodeID, to: endNodeID)]

        while !openSet.isEmpty {
            guard let current = openSet.min(by: { (fScore[$0] ?? .greatestFiniteMagnitude) < (fScore[$1] ?? .greatestFiniteMagnitude) }) else {
                break
            }

            if current == endNodeID {
                return reconstructRoute(
                    cameFromNode: cameFromNode,
                    cameFromEdge: cameFromEdge,
                    endNodeID: endNodeID,
                    totalCost: gScore[endNodeID] ?? 0,
                    startPoint: startPoint,
                    endPoint: endPoint
                )
            }

            openSet.remove(current)
            for neighbor in adjacencyByNode[current] ?? [] {
                let tentative = (gScore[current] ?? .greatestFiniteMagnitude) + neighbor.cost
                if tentative < (gScore[neighbor.neighborNodeID] ?? .greatestFiniteMagnitude) {
                    cameFromNode[neighbor.neighborNodeID] = current
                    cameFromEdge[neighbor.neighborNodeID] = neighbor.edgeID
                    gScore[neighbor.neighborNodeID] = tentative
                    fScore[neighbor.neighborNodeID] = tentative + heuristicCost(from: neighbor.neighborNodeID, to: endNodeID)
                    openSet.insert(neighbor.neighborNodeID)
                }
            }
        }

        return nil
    }

    private func heuristicCost(from nodeID: Int, to otherNodeID: Int) -> Float {
        guard let a = nodesByID[nodeID], let b = nodesByID[otherNodeID] else {
            return .greatestFiniteMagnitude
        }
        return simd_length(a.mapPoint - b.mapPoint)
    }

    private func reconstructRoute(
        cameFromNode: [Int: Int],
        cameFromEdge: [Int: Int],
        endNodeID: Int,
        totalCost: Float,
        startPoint: SIMD2<Float>?,
        endPoint: SIMD2<Float>?
    ) -> IndoorRoute? {
        var nodePath: [Int] = [endNodeID]
        var edgePath: [Int] = []

        var current = endNodeID
        while let parent = cameFromNode[current] {
            nodePath.append(parent)
            if let edgeID = cameFromEdge[current] {
                edgePath.append(edgeID)
            }
            current = parent
        }

        nodePath.reverse()
        edgePath.reverse()

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
            if element.type == "beacon" || element.type == "entrance" {
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

extension CGPoint {
    init(_ vector: SIMD2<Float>) {
        self.init(x: CGFloat(vector.x), y: CGFloat(vector.y))
    }
}
