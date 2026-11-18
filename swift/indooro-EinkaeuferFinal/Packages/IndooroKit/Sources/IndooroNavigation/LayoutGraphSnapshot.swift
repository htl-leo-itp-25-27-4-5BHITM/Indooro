import CoreGraphics
import Foundation
import IndooroModels
import simd

/// Unveraenderliche, `Sendable` Huelle um den begehbaren Graphen einer Layout-Revision (Task 5.5).
/// Der Graph wird einmal je Revision gebaut (`stabilize-ios-navigation-pipeline`); Ortung und
/// Einkaufs-Session lesen denselben Snapshot. Es gibt keine neue Graph- oder Planerlogik.
public struct LayoutGraphSnapshot: Sendable {
    /// Zaehler der Layout-Revision, aus der der Graph stammt.
    public let revision: Int
    public let gridWidth: Int
    public let gridHeight: Int
    /// Mittelpunkt des Eingangs-Elements; `nil`, wenn das Layout keinen Eingang hat.
    public let entrance: SIMD2<Float>?
    public let graph: IndoorGraph

    /// Umhuellt einen bereits gebauten Graphen (zum Beispiel den von `BeaconManager`).
    public init(revision: Int, graph: IndoorGraph, gridWidth: Int, gridHeight: Int, entrance: SIMD2<Float>?) {
        self.revision = revision
        self.graph = graph
        self.gridWidth = gridWidth
        self.gridHeight = gridHeight
        self.entrance = entrance
    }

    /// Baut den Graphen mit demselben Builder wie die App und `NavigationReplay`.
    public init(revision: Int, gridWidth: Int, gridHeight: Int, elements: [LayoutElement]) {
        self.init(
            revision: revision,
            graph: IndoorGraphBuilder.fromLayout(gridWidth: gridWidth, gridHeight: gridHeight, elements: elements),
            gridWidth: gridWidth,
            gridHeight: gridHeight,
            entrance: IndoorGraph.entrancePoint(in: elements)
        )
    }

    public init(revision: Int, layout: LayoutData) {
        self.init(
            revision: revision,
            gridWidth: Int(layout.gridSize.width),
            gridHeight: Int(layout.gridSize.height),
            elements: layout.elements
        )
    }

    /// Kartenrahmen in Metern (Ursprung links oben).
    public var bounds: CGRect {
        CGRect(x: 0, y: 0, width: gridWidth, height: gridHeight)
    }
}
