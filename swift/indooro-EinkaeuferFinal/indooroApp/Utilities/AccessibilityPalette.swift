import Foundation

/// Farbe in sRGB-Komponenten 0...1, unabhängig von SwiftUI für Kontrastprüfungen.
struct RGB: Equatable {
    let r: Double
    let g: Double
    let b: Double

    init(_ r: Double, _ g: Double, _ b: Double) {
        self.r = r
        self.g = g
        self.b = b
    }
}

/// Textfarben mit nachgewiesenem Kontrast (WCAG 2.x) gegen Weiß.
/// Die Werte sind per Skript geprüft; die Tests in AccessibilityPaletteTests halten die Schwelle fest.
enum AccessibilityPalette {

    /// Mindestkontrast für Text nach WCAG 2.x (AA, normaler Text).
    static let minimumTextContrast = 4.5

    static let white = RGB(1.00, 1.00, 1.00)

    /// Markengrün, bereits im Projekt als Akzent verwendet.
    static let brandGreen = RGB(0.00, 0.43, 0.36)

    /// Dunkleres Route-Blau. Das bisherige routeAccent (0.15, 0.57, 0.88) erreicht nur 3.37:1 auf Weiß.
    static let routeBlueText = RGB(0.05, 0.38, 0.70)

    /// Füllfarbe für Buttons mit weißer Schrift, identisch zu routeBlueText.
    static let whiteOnRouteButton = routeBlueText

    /// Dunkles Orange für Warnhinweise als Text.
    static let warningText = RGB(0.70, 0.33, 0.00)

    /// Neutrales Grau für Sekundärtext.
    static let secondaryText = RGB(0.36, 0.36, 0.38)

    /// Relative Leuchtdichte nach WCAG 2.x.
    static func relativeLuminance(_ color: RGB) -> Double {
        0.2126 * linearize(color.r) + 0.7152 * linearize(color.g) + 0.0722 * linearize(color.b)
    }

    /// Kontrastverhältnis von 1 bis 21 nach WCAG 2.x, unabhängig von der Reihenfolge der Farben.
    static func contrastRatio(_ a: RGB, _ b: RGB) -> Double {
        let luminanceA = relativeLuminance(a)
        let luminanceB = relativeLuminance(b)
        let lighter = max(luminanceA, luminanceB)
        let darker = min(luminanceA, luminanceB)
        return (lighter + 0.05) / (darker + 0.05)
    }

    private static func linearize(_ component: Double) -> Double {
        component <= 0.03928
            ? component / 12.92
            : pow((component + 0.055) / 1.055, 2.4)
    }
}
