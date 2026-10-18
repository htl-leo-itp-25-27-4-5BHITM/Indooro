import Foundation

/// Reine Textbausteine für VoiceOver-Labels und die Kartenzusammenfassung.
/// Keine UI-Abhängigkeit, damit die Formulierungen per SwiftPM getestet werden können.
enum AccessibilityText {

    static let noTargetText = "Kein Ziel gewählt."
    static let untrustedPositionText = "Position ungenau."

    /// Entfernungsangabe in ganzen Metern, z. B. „12 Meter entfernt“ oder „1 Meter entfernt“.
    /// Werte unter einem Meter werden als „weniger als 1 Meter“ ausgegeben.
    /// nil, wenn kein gültiger Wert vorliegt (nil, negativ, NaN oder unendlich).
    static func distancePhrase(meters: Double?) -> String? {
        guard let meters, meters.isFinite, meters >= 0 else { return nil }
        if meters < 1 {
            return "weniger als 1 Meter"
        }
        let rounded = Int(meters.rounded())
        return rounded == 1 ? "1 Meter entfernt" : "\(rounded) Meter entfernt"
    }

    /// Zusammenfassung der Karte für VoiceOver, z. B.
    /// „Ziel: Gang 4 links, 12 Meter entfernt. Route ab Standort.“
    /// Fehlende oder leere Teile werden weggelassen. Ohne Ziel steht nur „Kein Ziel gewählt.“;
    /// die Route-Angabe erscheint dann nicht. Bei unsicherer Position folgt „Position ungenau.“.
    static func mapSummary(
        targetText: String?,
        distanceMeters: Double?,
        routeOrigin: String?,
        positionTrusted: Bool
    ) -> String {
        var sentences: [String] = []

        if let target = nonEmpty(targetText) {
            var targetSentence = "Ziel: \(target)"
            if let distance = distancePhrase(meters: distanceMeters) {
                targetSentence += ", \(distance)"
            }
            sentences.append(targetSentence + ".")

            if let origin = nonEmpty(routeOrigin) {
                sentences.append("Route ab \(origin).")
            }
        } else {
            sentences.append(noTargetText)
        }

        if !positionTrusted {
            sentences.append(untrustedPositionText)
        }

        return sentences.joined(separator: " ")
    }

    /// Zeilenlabel für ein Produkt: „Milch, Regal 520“, ohne Regal nur der Name.
    /// `shelfText` wird unverändert übernommen (z. B. `ShelfLocationDescriptor.primary`).
    static func productRowLabel(name: String, shelfText: String?) -> String {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let shelf = nonEmpty(shelfText) else { return trimmedName }
        return "\(trimmedName), \(shelf)"
    }

    /// Aktionslabel für einen Button, z. B. „Einplanen: Milch“.
    /// Ist der Name leer, wird nur die Aktion ausgegeben.
    static func productActionLabel(_ action: String, name: String) -> String {
        let trimmedAction = action.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let trimmedName = nonEmpty(name) else { return trimmedAction }
        return "\(trimmedAction): \(trimmedName)"
    }

    /// Wert eines Einkaufslisten-Eintrags für VoiceOver: „Erledigt“ oder „Offen“.
    static func shoppingItemValue(isChecked: Bool) -> String {
        isChecked ? "Erledigt" : "Offen"
    }

    /// Label eines Stopp-Markers auf der Tour, z. B. „Stopp 3, Milch, aktuell“ oder „Stopp 3“.
    static func stopMarkerLabel(index: Int, name: String?, isActive: Bool) -> String {
        var parts = ["Stopp \(index)"]
        if let name = nonEmpty(name) {
            parts.append(name)
        }
        if isActive {
            parts.append("aktuell")
        }
        return parts.joined(separator: ", ")
    }

    private static func nonEmpty(_ text: String?) -> String? {
        guard let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else { return nil }
        return trimmed
    }
}
