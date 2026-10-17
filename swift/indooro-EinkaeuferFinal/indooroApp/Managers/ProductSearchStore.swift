import Foundation

final class ProductSearchStore: ObservableObject {
    @Published private(set) var searchResults: [Product] = []
    @Published private(set) var isSearching = false

    private let apiBase = IndooroAPI.baseURL
    private var latestSearchRequestID = UUID()

    /// Filialcode, der an jede Produktanfrage angehaengt wird (`nil` = keine Filiale bekannt).
    private(set) var activeStoreCode: String?

    func clearSearch() {
        latestSearchRequestID = UUID()
        isSearching = false
        searchResults = []
    }

    /// Setzt die aktive Filiale. Bei einer Aenderung werden Treffer und laufende Anfragen verworfen.
    func setActiveStore(code: String?) {
        let normalized = ProductEndpoint.normalizedStoreCode(code)
        guard normalized != activeStoreCode else { return }
        activeStoreCode = normalized
        clearSearch()
    }

    func searchURL(query: String, size: Int) -> URL? {
        ProductEndpoint.searchURL(base: apiBase, query: query, size: size, storeCode: activeStoreCode)
    }

    func listURL(size: Int) -> URL? {
        ProductEndpoint.listURL(base: apiBase, size: size, storeCode: activeStoreCode)
    }

    func searchProducts(query: String, size: Int = 50) {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuery.isEmpty else {
            clearSearch()
            return
        }

        let requestID = UUID()
        latestSearchRequestID = requestID
        isSearching = true

        let resultSize = max(1, size)

        guard let url = searchURL(query: trimmedQuery, size: resultSize) else {
            isSearching = false
            return
        }

        URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
            DispatchQueue.main.async {
                guard let self else { return }
                guard self.latestSearchRequestID == requestID else { return }

                self.isSearching = false

                if let error {
                    print("❌ Fehler bei Produktsuche: \(error.localizedDescription)")
                    self.searchResults = []
                    return
                }

                guard let data else {
                    self.searchResults = []
                    return
                }

                self.handleProductsResponse(data, requestID: requestID)
            }
        }.resume()
    }

    func searchProducts(layoutCodePrefixes: [String], size: Int = 500) {
        let prefixes = layoutCodePrefixes
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        guard !prefixes.isEmpty else {
            clearSearch()
            return
        }

        let requestID = UUID()
        latestSearchRequestID = requestID
        isSearching = true

        let resultSize = max(1, size)

        guard let url = listURL(size: resultSize) else {
            isSearching = false
            return
        }

        URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
            DispatchQueue.main.async {
                guard let self else { return }
                guard self.latestSearchRequestID == requestID else { return }

                self.isSearching = false

                if let error {
                    print("❌ Fehler beim Laden der Produkte: \(error.localizedDescription)")
                    self.searchResults = []
                    return
                }

                guard let data else {
                    self.searchResults = []
                    return
                }

                self.handleProductsResponse(data, requestID: requestID) { product in
                    prefixes.contains { prefix in
                        product.layoutCode == prefix || product.layoutCode.hasPrefix("\(prefix)/")
                    }
                }
            }
        }.resume()
    }

    private func handleProductsResponse(
        _ data: Data,
        requestID: UUID,
        filter: (Product) -> Bool = { _ in true }
    ) {
        guard latestSearchRequestID == requestID else { return }

        do {
            searchResults = try Self.decodeProducts(from: data).filter(filter)
        } catch {
            print("❌ JSON Fehler bei Produktsuche: \(error.localizedDescription)")
            searchResults = []
        }
    }

    private static func decodeProducts(from data: Data) throws -> [Product] {
        let decoder = JSONDecoder()

        if let products = try? decoder.decode([Product].self, from: data) {
            return products
        }

        let response = try decoder.decode(ProductCollectionResponse.self, from: data)
        if let content = response.content {
            return content
        }
        if let products = response.products {
            return products
        }
        if let items = response.items {
            return items
        }
        return []
    }
}

private struct ProductCollectionResponse: Decodable {
    let content: [Product]?
    let products: [Product]?
    let items: [Product]?
}
