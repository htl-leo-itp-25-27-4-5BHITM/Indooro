import Foundation

/// Beschreibt den Standort eines Produkts in Kundensprache: Regalbeschriftung, Boden und Position.
/// Der Kategorie-Code erscheint nie in `primary` oder `detail`; `debugCode` ist nur fuer die DEBUG-Anzeige.
struct ShelfLocationDescriptor: Equatable {
    /// Regalbeschriftung, sonst „Regal <meter>“.
    let primary: String
    /// „<fach>. Boden von unten · Position <reihe>“, nur wenn fach und reihe numerisch sind.
    let detail: String?
    /// layoutCode unveraendert (nur DEBUG).
    let debugCode: String

    static let notInTestAreaText = "Nicht im Testbereich – bitte Personal fragen"

    /// Waehlt das erste Regal, das zum layoutCode passt. nil, wenn kein Regal passt.
    static func make(layoutCode: String, shelves: [LayoutElement]) -> ShelfLocationDescriptor? {
        guard let shelf = shelves.first(where: { $0.matchesProductLayoutCode(layoutCode) }) else {
            return nil
        }
        return make(layoutCode: layoutCode, shelf: shelf)
    }

    /// nil, wenn kein Regal vorliegt oder der layoutCode nicht dem Format `kategorie/meter/fach/reihe` entspricht.
    static func make(layoutCode: String, shelf: LayoutElement?) -> ShelfLocationDescriptor? {
        guard let shelf else { return nil }

        let parts = layoutCode.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard parts.count >= 2,
              !parts[0].isEmpty,
              let meter = Int(parts[1]) else { return nil }

        let label = shelf.label?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let primary = label.isEmpty ? "Regal \(meter)" : label

        var detail: String?
        if parts.count >= 4, let fach = Int(parts[2]), let reihe = Int(parts[3]) {
            detail = "\(fach). Boden von unten · Position \(reihe)"
        }

        return ShelfLocationDescriptor(primary: primary, detail: detail, debugCode: layoutCode)
    }
}
