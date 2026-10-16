import Foundation

final class ProductSearchStore: ObservableObject {
    @Published private(set) var searchResults: [Product] = []
    @Published private(set) var isSearching = false

    private var apiBase: String { AppEnvironment.apiBaseURL.absoluteString }
    private var latestSearchRequestID = UUID()

    func clearSearch() {
        latestSearchRequestID = UUID()
        isSearching = false
        searchResults = []
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

        let encoded = trimmedQuery.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let resultSize = max(1, size)
        let urlString = "\(apiBase)/products/search?q=\(encoded)&size=\(resultSize)"

        guard let url = URL(string: urlString) else {
            isSearching = false
            return
        }

        AppEnvironment.session.dataTask(with: url) { [weak self] data, _, error in
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
        let urlString = "\(apiBase)/products?size=\(resultSize)"

        guard let url = URL(string: urlString) else {
            isSearching = false
            return
        }

        AppEnvironment.session.dataTask(with: url) { [weak self] data, _, error in
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
