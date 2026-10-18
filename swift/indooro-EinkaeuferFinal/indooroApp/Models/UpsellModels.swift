import Foundation

struct UpsellProductSummary: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let price: Double?
    let layoutCode: String?
    let storeId: String?
    let storeCode: String?
    let brand: String?
    let category: String?
    let imageUrl: String?
    let hasLayoutPosition: Bool

    var product: Product {
        Product(
            id: id,
            name: name,
            price: price ?? 0,
            layoutCode: layoutCode ?? ""
        )
    }

    var detailText: String {
        var parts: [String] = []
        if let price, price > 0 {
            parts.append(String(format: "%.2f EUR", price))
        }
        if hasLayoutPosition {
            parts.append("im Markt auffindbar")
        } else {
            parts.append("ohne Regalposition")
        }
        return parts.joined(separator: " · ")
    }
}

struct UpsellSuggestion: Decodable, Identifiable, Hashable {
    var id: Int { product.id }

    let product: UpsellProductSummary
    let reason: String
    let confidence: Double
}

struct UpsellPlanRequest: Encodable {
    let storeId: UUID?
    let storeCode: String?
    let shoppingListId: String?
    let currentListProductIds: [Int]
    let completedProductIds: [Int]
    let source: String
    let opportunities: [UpsellOpportunityRequest]
}

struct UpsellOpportunityRequest: Encodable, Hashable {
    let opportunityId: String
    let triggerProductIds: [Int]
    let triggerProductNames: [String]
}

struct UpsellPlanResponse: Decodable {
    let opportunities: [UpsellOpportunityResponse]
    let source: String?
    let expiresAt: Date?
    let debug: UpsellPlanDebug?
}

struct UpsellOpportunityResponse: Decodable, Hashable {
    let opportunityId: String
    let triggerProductIds: [Int]
    let suggestions: [UpsellSuggestion]
}

struct UpsellPlanDebug: Decodable, Hashable {
    let requestId: String?
    let model: String?
    let responseSource: String?
    let elapsedMs: Int?
    let openAiElapsedMs: Int?
    let inputTokens: Int?
    let outputTokens: Int?
    let totalTokens: Int?
    let cachedInputTokens: Int?
    let reasoningTokens: Int?
    let fallbackReason: String?
    let opportunityCount: Int?
    let candidateCount: Int?
    /// Optional since backend version with retry metadata; missing means not retryable.
    let retryable: Bool?
}

struct UpsellEventRequest: Encodable {
    let eventType: String
    let checkedProductId: Int?
    let suggestedProductId: Int?
    let storeId: UUID?
    let storeCode: String?
    let sessionId: String?
    let source: String?
    let metadataJson: String?
}

struct UpsellDismissRequest: Encodable {
    let checkedProductId: Int
    let suggestedProductId: Int?
    let storeId: UUID?
    let storeCode: String?
    let sessionId: String?
    let suppressMinutes: Int?
}

struct UpsellPrompt: Identifiable, Hashable {
    let id = UUID()
    let opportunityId: String
    let checkedProductId: Int
    let checkedProductName: String
    let triggerProductIds: [Int]
    let listID: UUID
    let store: MobileStoreSummary?
    let source: String
    let suggestions: [UpsellSuggestion]
}
