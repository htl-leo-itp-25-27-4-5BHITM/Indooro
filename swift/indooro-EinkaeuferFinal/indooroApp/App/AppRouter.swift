import IndooroModels
import Observation
import SwiftUI

/// Reiter der App.
enum AppSection: Hashable {
    case start
    case planning
    case recipes
    case shopping
    case map
}

/// Gewaehlter Reiter und Zustand, der Reiter verbindet (design.md D2). Ersetzt die `onOpen…`-Closures
/// zwischen `ContentView` und den Seiten: Views lesen den Router mit `@Environment(AppRouter.self)`.
/// Aktionen, die mehrere Modelle brauchen (Produkt auf der Karte zeigen, Einkauf starten), bleiben in
/// `ContentView`, bis `ShoppingSessionModel` und die uebrigen Modelle aus 10.1 stehen.
@Observable
@MainActor
final class AppRouter {
    var selectedSection: AppSection = .start
    /// Produkt, das die Karte hervorhebt.
    var targetProduct: Product?
    /// Aenderung loest auf der Karte das Oeffnen des letzten Store-Layouts aus.
    var pendingLastStoreLayoutOpenRequest: UUID?
    var pendingShoppingImportPackage: ShoppingTransferPackage?
    var shoppingImportErrorMessage: String?

    func open(_ section: AppSection) {
        selectedSection = section
    }

    /// Zeigt `product` auf der Karte.
    func showOnMap(_ product: Product) {
        withAnimation {
            targetProduct = product
            selectedSection = .map
        }
    }

    /// Karte fuer einen gestarteten Einkauf: kein Einzelziel, letztes Store-Layout oeffnen.
    func openMapForShoppingSession() {
        withAnimation {
            targetProduct = nil
            pendingLastStoreLayoutOpenRequest = UUID()
            selectedSection = .map
        }
    }

    /// Eingehende Einkaufsliste (`onOpenURL`): Ergebnis merken und den Einkaufs-Reiter oeffnen.
    func receiveShoppingTransfer(_ result: Result<ShoppingTransferPackage, any Error>) {
        switch result {
        case .success(let package):
            pendingShoppingImportPackage = package
            shoppingImportErrorMessage = nil
        case .failure(let error):
            pendingShoppingImportPackage = nil
            shoppingImportErrorMessage = error.localizedDescription
        }
        selectedSection = .shopping
    }
}
