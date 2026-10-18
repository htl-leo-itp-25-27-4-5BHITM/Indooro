import IndooroModels
import Foundation
import IndooroNetworking

@MainActor
final class RecipeStore: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var recipes: [RecipeSummary] = []
    @Published private(set) var selectedRecipe: RecipeDetail?
    @Published private(set) var mappingResponse: RecipeProductMappingResponse?
    @Published private(set) var isLoading = false
    @Published private(set) var isSearching = false
    @Published private(set) var isLoadingDetail = false
    @Published private(set) var isLoadingMapping = false
    @Published var errorMessage: String?

    private let client: any APIClientProtocol
    private var latestListRequestID = UUID()
    private var latestDetailRequestID = UUID()
    private var latestMappingRequestID = UUID()

    init(client: any APIClientProtocol = AppEnvironment.apiClient) {
        self.client = client
    }

    func loadRecipes(page: Int = 0, size: Int = 20, tag: String? = nil) {
        latestListRequestID = UUID()
        let requestID = latestListRequestID
        isLoading = true
        isSearching = false
        errorMessage = nil

        // Ein leerer oder nur aus Leerzeichen bestehender Tag wird nicht gesendet; sonst bleibt er unverändert.
        let activeTag = tag.flatMap { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0 }
        fetchRecipePage(RecipeListEndpoint(page: page, size: size, tag: activeTag), requestID: requestID)
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

        fetchRecipePage(RecipeSearchEndpoint(searchText: trimmed, page: page, size: size), requestID: requestID)
    }

    func loadRecipe(id: UUID) {
        latestDetailRequestID = UUID()
        let requestID = latestDetailRequestID
        isLoadingDetail = true
        errorMessage = nil

        let client = client
        Task { @MainActor [weak self] in
            let result = await client.sendResult(RecipeDetailEndpoint(recipeID: id).asRaw)
            guard let self, self.latestDetailRequestID == requestID else { return }
            self.isLoadingDetail = false
            self.handleDetailResponse(result)
        }
    }

    func loadMapping(recipeId: UUID, store: MobileStoreSummary?) {
        latestMappingRequestID = UUID()
        let requestID = latestMappingRequestID
        isLoadingMapping = true
        mappingResponse = nil

        let endpoint = RecipeProductMappingEndpoint(recipeID: recipeId, storeID: store?.id, storeCode: store?.storeCode)
        let client = client
        Task { @MainActor [weak self] in
            let result = await client.sendResult(endpoint.asRaw)
            guard let self, self.latestMappingRequestID == requestID else { return }
            self.isLoadingMapping = false
            self.handleMappingResponse(result)
        }
    }

    func clearSelectedRecipe() {
        selectedRecipe = nil
        mappingResponse = nil
    }

    private func fetchRecipePage<E: Endpoint>(_ endpoint: E, requestID: UUID) {
        let client = client
        Task { @MainActor [weak self] in
            let result = await client.sendResult(endpoint.asRaw)
            guard let self, self.latestListRequestID == requestID else { return }
            self.isLoading = false
            self.isSearching = false
            self.handleListResponse(result)
        }
    }

    private func handleListResponse(_ result: Result<RawJSON, APIError>) {
        switch result {
        case .failure(let error):
            recipes = []
            errorMessage = PilotHTTP.message(for: error)
        case .success(let raw):
            do {
                recipes = try Self.decodeRecipeSummaries(from: raw.data)
            } catch {
                recipes = []
                errorMessage = "Rezepte konnten nicht gelesen werden."
            }
        }
    }

    private func handleDetailResponse(_ result: Result<RawJSON, APIError>) {
        switch result {
        case .failure(let error):
            errorMessage = PilotHTTP.message(for: error)
        case .success(let raw):
            do {
                selectedRecipe = try JSONDecoder.indooro.decode(RecipeDetail.self, from: raw.data)
            } catch {
                errorMessage = "Rezeptdetails konnten nicht gelesen werden."
            }
        }
    }

    private func handleMappingResponse(_ result: Result<RawJSON, APIError>) {
        switch result {
        case .failure(let error):
            errorMessage = PilotHTTP.message(for: error)
        case .success(let raw):
            do {
                mappingResponse = try JSONDecoder.indooro.decode(RecipeProductMappingResponse.self, from: raw.data)
            } catch {
                errorMessage = "Produktzuordnung konnte nicht gelesen werden."
            }
        }
    }

    private static func decodeRecipeSummaries(from data: Data) throws -> [RecipeSummary] {
        let decoder = JSONDecoder.indooro
        if let recipes = try? decoder.decode([RecipeSummary].self, from: data) {
            return recipes
        }
        return try decoder.decode(RecipePageResponse<RecipeSummary>.self, from: data).content
    }
}
