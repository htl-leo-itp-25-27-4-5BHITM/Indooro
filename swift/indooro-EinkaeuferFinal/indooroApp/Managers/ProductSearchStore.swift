import IndooroModels
import Foundation
import IndooroNetworking

final class ProductSearchStore: ObservableObject {
    @Published private(set) var searchResults: [Product] = []
    @Published private(set) var isSearching = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var lastQuery: String?
    @Published private(set) var hasCompletedSearch = false

    // Installed by ContentView, so map callers keep their existing interface.
    var storeProvider: (() -> MobileStoreSummary?)?
    private var latestSearchRequestID = UUID()
    private var task: URLSessionDataTask?
    private var retryAction: (() -> Void)?

    /// Filialcode der aktiven Filiale (`nil` = keine Filiale bekannt). Gilt, wenn die Anfrage keine
    /// eigene Filiale mitbringt (weder `store` noch `storeProvider`).
    private(set) var activeStoreCode: String?

    func clearSearch() {
        task?.cancel()
        latestSearchRequestID = UUID()
        isSearching = false
        searchResults = []
        errorMessage = nil
        hasCompletedSearch = false
        lastQuery = nil
        retryAction = nil
    }

    func retry() { retryAction?() }

    /// Setzt die aktive Filiale. Bei einer Aenderung werden Treffer und laufende Anfragen verworfen.
    func setActiveStore(code: String?) {
        let normalized = ProductEndpoint.normalizedStoreCode(code)
        guard normalized != activeStoreCode else { return }
        activeStoreCode = normalized
        clearSearch()
    }

    func searchURL(query: String, size: Int) -> URL? {
        ProductEndpoint.searchURL(base: AppEnvironment.apiBaseURL.absoluteString, query: query, size: size, storeCode: activeStoreCode)
    }

    func listURL(size: Int) -> URL? {
        ProductEndpoint.listURL(base: AppEnvironment.apiBaseURL.absoluteString, size: size, storeCode: activeStoreCode)
    }

    func searchProducts(query: String, size: Int = 50, store: MobileStoreSummary? = nil) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { clearSearch(); return }
        lastQuery = trimmed
        retryAction = { [weak self] in self?.searchProducts(query: trimmed, size: size, store: store) }
        load(query: trimmed, size: size, store: store ?? storeProvider?())
    }

    func searchProducts(layoutCodePrefixes: [String], size: Int = 500, store: MobileStoreSummary? = nil) {
        let prefixes = layoutCodePrefixes.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !prefixes.isEmpty else { clearSearch(); return }
        lastQuery = nil
        retryAction = { [weak self] in self?.searchProducts(layoutCodePrefixes: prefixes, size: size, store: store) }
        load(query: nil, size: size, store: store ?? storeProvider?()) { product in
            prefixes.contains { product.layoutCode == $0 || product.layoutCode.hasPrefix("\($0)/") }
        }
    }

    private func load(query: String?, size: Int, store: MobileStoreSummary?, filter: @escaping (Product) -> Bool = { _ in true }) {
        task?.cancel()
        let requestID = UUID()
        latestSearchRequestID = requestID
        isSearching = true
        errorMessage = nil
        hasCompletedSearch = false
        searchResults = []
        guard let url = PilotSearchURL.make(base: AppEnvironment.apiBaseURL, query: query, size: size, storeID: store?.id, storeCode: ProductEndpoint.normalizedStoreCode(store?.storeCode) ?? activeStoreCode) else {
            isSearching = false
            errorMessage = "Die Suchanfrage konnte nicht erstellt werden."
            return
        }
        task = AppEnvironment.session.dataTask(with: url) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self, self.latestSearchRequestID == requestID else { return }
                self.isSearching = false
                if let message = PilotHTTP.errorMessage(response: response, error: error) {
                    self.errorMessage = message
                    return
                }
                guard let data else { self.errorMessage = "Keine Produktdaten erhalten."; return }
                do {
                    self.searchResults = try Self.decodeProducts(from: data).filter(filter)
                    self.hasCompletedSearch = true
                } catch {
                    self.errorMessage = "Die Produktdaten konnten nicht gelesen werden."
                }
            }
        }
        task?.resume()
    }

    static func decodeProducts(from data: Data) throws -> [Product] {
        let decoder = JSONDecoder.indooro
        if let items = try? decoder.decode(LossyDecodableArray<Product>.self, from: data) { return items.elements }
        let response = try decoder.decode(ProductCollectionResponse.self, from: data)
        guard let items = response.content ?? response.products ?? response.items else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Keine Produktliste"))
        }
        return items.elements
    }
}

private struct ProductCollectionResponse: Decodable {
    let content: LossyDecodableArray<Product>?
    let products: LossyDecodableArray<Product>?
    let items: LossyDecodableArray<Product>?
}
