import Foundation

/// Price in customer notation (Austrian German, euro).
public enum PriceText {
    public static func format(_ price: Double) -> String {
        price.formatted(.currency(code: "EUR").locale(Locale(identifier: "de_AT")))
    }
}
