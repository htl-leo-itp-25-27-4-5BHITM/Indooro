import Foundation
import simd

/// Projiziert eine Schaetzung auf den naechsten begehbaren Punkt des Graphen.
/// Ohne Distanzlimit, Verlauf, Blickrichtung oder Routen-Bias: gleicher Eingang,
/// gleiche Ausgabe. Kontinuitaet liefert der Schaetzer, nicht die Projektion.
struct WalkableProjector {
    let graph: IndoorGraph

    init(graph: IndoorGraph) {
        self.graph = graph
    }

    func project(_ point: SIMD2<Float>, floor: Int = 0) -> IndoorEdgeProjection? {
        guard point.x.isFinite, point.y.isFinite else {
            return nil
        }
        return graph.nearestProjection(for: point, floor: floor)
    }
}
