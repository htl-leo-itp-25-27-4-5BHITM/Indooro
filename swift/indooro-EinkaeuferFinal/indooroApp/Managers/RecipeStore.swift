import Foundation

@MainActor
final class RecipeStore: ObservableObject {
    @Published private(set) var recipes: [RecipeSummary] = []
    @Published private(set) var selectedRecipe: RecipeDetail?
    @Published private(set) var mappingResponse: RecipeProductMappingResponse?
    @Published private(set) var isLoading = false
    @Published private(set) var isSearching = false
    @Published private(set) var isLoadingDetail = false
    @Published private(set) var isLoadingMapping = false
    @Published var errorMessage: String?

    private let apiBase = IndooroAPI.baseURL
    private var latestListRequestID = UUID()
    private var latestDetailRequestID = UUID()
    private var latestMappingRequestID = UUID()

    func loadRecipes(page: Int = 0, size: Int = 20, tag: String? = nil) {
        latestListRequestID = UUID()
        let requestID = latestListRequestID
        isLoading = true
        isSearching = false
        errorMessage = nil

        var components = URLComponents(string: "\(apiBase)/mobile/recipes")
        components?.queryItems = [
            URLQueryItem(name: "page", value: String(max(0, page))),
            URLQueryItem(name: "size", value: String(max(1, size)))
        ]
        if let tag, !tag.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            components?.queryItems?.append(URLQueryItem(name: "tag", value: tag))
        }

        fetchRecipePage(components: components, requestID: requestID)
    }

    func searchRecipes(query: String, page: Int = 0, size: Int = 20) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else {
            loadRecipes(page: page, size: size)
            return
        }

        latestListRequestID = UUID()
        let requestID = latestListRequestID
        isLoading = false
        isSearching = true
        errorMessage = nil

        var components = URLComponents(string: "\(apiBase)/mobile/recipes/search")
        components?.queryItems = [
            URLQueryItem(name: "q", value: trimmed),
            URLQueryItem(name: "page", value: String(max(0, page))),
            URLQueryItem(name: "size", value: String(max(1, size)))
        ]

        fetchRecipePage(components: components, requestID: requestID)
    }

    func loadRecipe(id: UUID) {
        latestDetailRequestID = UUID()
        let requestID = latestDetailRequestID
        isLoadingDetail = true
        errorMessage = nil

        guard let url = URL(string: "\(apiBase)/mobile/recipes/\(id.uuidString)") else {
            isLoadingDetail = false
            errorMessage = "Rezept-URL ist ungültig."
            return
        }

        URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
            Task { @MainActor in
                guard let self, self.latestDetailRequestID == requestID else { return }
                self.isLoadingDetail = false
                self.handleDetailResponse(data: data, response: response, error: error)
            }
        }.resume()
    }

    func loadMapping(recipeId: UUID, store: MobileStoreSummary?) {
        latestMappingRequestID = UUID()
        let requestID = latestMappingRequestID
        isLoadingMapping = true
        mappingResponse = nil

        var components = URLComponents(string: "\(apiBase)/mobile/recipes/\(recipeId.uuidString)/product-mapping")
        var queryItems: [URLQueryItem] = []
        if let store {
            queryItems.append(URLQueryItem(name: "storeId", value: store.id.uuidString))
            queryItems.append(URLQueryItem(name: "storeCode", value: store.storeCode))
        }
        components?.queryItems = queryItems.isEmpty ? nil : queryItems

        guard let url = components?.url else {
            isLoadingMapping = false
            errorMessage = "Mapping-URL ist ungültig."
            return
        }

        URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
            Task { @MainActor in
                guard let self, self.latestMappingRequestID == requestID else { return }
                self.isLoadingMapping = false
                self.handleMappingResponse(data: data, response: response, error: error)
            }
        }.resume()
    }

    func clearSelectedRecipe() {
        selectedRecipe = nil
        mappingResponse = nil
    }

    private func fetchRecipePage(components: URLComponents?, requestID: UUID) {
        guard let url = components?.url else {
            isLoading = false
            isSearching = false
            errorMessage = "Rezept-URL ist ungültig."
            return
        }

        URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
            Task { @MainActor in
                guard let self, self.latestListRequestID == requestID else { return }
                self.isLoading = false
                self.isSearching = false
                self.handleListResponse(data: data, response: response, error: error)
            }
        }.resume()
    }

    private func handleListResponse(data: Data?, response: URLResponse?, error: Error?) {
        if let error {
            recipes = []
            errorMessage = error.localizedDescription
            return
        }

        guard let data else {
            recipes = []
            errorMessage = "Keine Rezeptdaten erhalten."
            return
        }

        do {
            recipes = try Self.decodeRecipeSummaries(from: data)
        } catch {
            recipes = []
            errorMessage = "Rezepte konnten nicht gelesen werden."
        }
    }

    private func handleDetailResponse(data: Data?, response: URLResponse?, error: Error?) {
        if let error {
            errorMessage = error.localizedDescription
            return
        }

        guard let data else {
            errorMessage = "Keine Rezeptdetails erhalten."
            return
        }

        do {
            selectedRecipe = try JSONDecoder().decode(RecipeDetail.self, from: data)
        } catch {
            errorMessage = "Rezeptdetails konnten nicht gelesen werden."
        }
    }

    private func handleMappingResponse(data: Data?, response: URLResponse?, error: Error?) {
        if let error {
            errorMessage = error.localizedDescription
            return
        }

        guard let data else {
            errorMessage = "Keine Produktzuordnung erhalten."
            return
        }

        do {
            mappingResponse = try JSONDecoder().decode(RecipeProductMappingResponse.self, from: data)
        } catch {
            errorMessage = "Produktzuordnung konnte nicht gelesen werden."
        }
    }

    private static func decodeRecipeSummaries(from data: Data) throws -> [RecipeSummary] {
        let decoder = JSONDecoder()
        if let recipes = try? decoder.decode([RecipeSummary].self, from: data) {
            return recipes
        }
        return try decoder.decode(RecipePageResponse<RecipeSummary>.self, from: data).content
    }
}
