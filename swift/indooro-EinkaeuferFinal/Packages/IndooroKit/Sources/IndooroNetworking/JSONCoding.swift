import Foundation

/// JSON-Kodierung der Mobile-API. Der Decoder entspricht `JSONDecoder.indooro` in der App
/// (`indooroApp/Utilities/PilotNetworking.swift`): ISO-8601 mit und ohne Sekundenbruchteile.
public enum JSONCoding {
    public static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: text) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: text) { return date }
            throw DecodingError.dataCorrupted(.init(
                codingPath: decoder.codingPath,
                debugDescription: "Ungültiges Datum"
            ))
        }
        return decoder
    }

    /// Encoder fuer Request-Bodies. Keine Datumsstrategie noetig: Die Upsell-Payloads enthalten keine Datumsfelder.
    public static func makeEncoder() -> JSONEncoder {
        JSONEncoder()
    }
}
