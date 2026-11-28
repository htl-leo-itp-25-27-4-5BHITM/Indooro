import SwiftUI

extension Color {
    /// Erstellt eine SwiftUI-Farbe aus einer geprüften sRGB-Komponente (siehe AccessibilityPalette).
    init(_ rgb: RGB) {
        self.init(.sRGB, red: rgb.r, green: rgb.g, blue: rgb.b, opacity: 1)
    }

    /// Dunkleres Route-Blau für Text und Füllungen mit weißer Schrift (WCAG AA).
    static var a11yRouteBlueText: Color { Color(AccessibilityPalette.routeBlueText) }

    /// Dunkles Orange für Warnhinweise und Akzenttext auf hellem Hintergrund (WCAG AA).
    static var a11yWarningText: Color { Color(AccessibilityPalette.warningText) }

    /// Dark green text on pale tinted controls.
    static var a11yBrandGreenText: Color { Color(AccessibilityPalette.brandGreenText) }

    /// Secondary text on white and pale card surfaces.
    static var a11ySecondaryText: Color { Color(AccessibilityPalette.secondaryText) }
}
