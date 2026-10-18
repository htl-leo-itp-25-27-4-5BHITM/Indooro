import Foundation

public struct UpsellProductSummary: Decodable, Identifiable, Hashable, Sendable {
    public let id: Int
    public let name: String
    public let price: Double?
    public let layoutCode: String?
    public let storeId: String?
    public let storeCode: String?
    public let brand: String?
    public let category: String?
    public let imageUrl: String?
    public let hasLayoutPosition: Bool

    public var product: Product {
        Product(
            id: id,
            name: name,
            price: price ?? 0,
            layoutCode: layoutCode ?? ""
        )
    }

    public var detailText: String {
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

    public init(id: Int, name: String, price: Double?, layoutCode: String?, storeId: String?, storeCode: String?, brand: String?, category: String?, imageUrl: String?, hasLayoutPosition: Bool) {
        self.id = id
        self.name = name
        self.price = price
        self.layoutCode = layoutCode
        self.storeId = storeId
        self.storeCode = storeCode
        self.brand = brand
        self.category = category
        self.imageUrl = imageUrl
        self.hasLayoutPosition = hasLayoutPosition
    }
}

public struct UpsellSuggestion: Decodable, Identifiable, Hashable, Sendable {
    public var id: Int { product.id }

    public let product: UpsellProductSummary
    public let reason: String
    public let confidence: Double

    public init(product: UpsellProductSummary, reason: String, confidence: Double) {
        self.product = product
        self.reason = reason
        self.confidence = confidence
    }
}

public struct UpsellPlanRequest: Encodable, Sendable {
    public let storeId: UUID?
    public let storeCode: String?
    public let shoppingListId: String?
    public let currentListProductIds: [Int]
    public let completedProductIds: [Int]
    public let source: String
    public let opportunities: [UpsellOpportunityRequest]

    public init(storeId: UUID?, storeCode: String?, shoppingListId: String?, currentListProductIds: [Int], completedProductIds: [Int], source: String, opportunities: [UpsellOpportunityRequest]) {
        self.storeId = storeId
        self.storeCode = storeCode
        self.shoppingListId = shoppingListId
        self.currentListProductIds = currentListProductIds
        self.completedProductIds = completedProductIds
        self.source = source
        self.opportunities = opportunities
    }
}

public struct UpsellOpportunityRequest: Encodable, Hashable, Sendable {
    public let opportunityId: String
    public let triggerProductIds: [Int]
    public let triggerProductNames: [String]

    public init(opportunityId: String, triggerProductIds: [Int], triggerProductNames: [String]) {
        self.opportunityId = opportunityId
        self.triggerProductIds = triggerProductIds
        self.triggerProductNames = triggerProductNames
    }
}

public struct UpsellPlanResponse: Decodable, Sendable {
    public let opportunities: [UpsellOpportunityResponse]
    public let source: String?
    public let expiresAt: Date?
    public let debug: UpsellPlanDebug?

    public init(opportunities: [UpsellOpportunityResponse], source: String?, expiresAt: Date?, debug: UpsellPlanDebug?) {
        self.opportunities = opportunities
        self.source = source
        self.expiresAt = expiresAt
        self.debug = debug
    }
}

public struct UpsellOpportunityResponse: Decodable, Hashable, Sendable {
    public let opportunityId: String
    public let triggerProductIds: [Int]
    public let suggestions: [UpsellSuggestion]

    public init(opportunityId: String, triggerProductIds: [Int], suggestions: [UpsellSuggestion]) {
        self.opportunityId = opportunityId
        self.triggerProductIds = triggerProductIds
        self.suggestions = suggestions
    }
}

public struct UpsellPlanDebug: Decodable, Hashable, Sendable {
    public let requestId: String?
    public let model: String?
    public let responseSource: String?
    public let elapsedMs: Int?
    public let openAiElapsedMs: Int?
    public let inputTokens: Int?
    public let outputTokens: Int?
    public let totalTokens: Int?
    public let cachedInputTokens: Int?
    public let reasoningTokens: Int?
    public let fallbackReason: String?
    public let opportunityCount: Int?
    public let candidateCount: Int?
    /// Optional since backend version with retry metadata; missing means not retryable.
    public let retryable: Bool?

    public init(requestId: String?, model: String?, responseSource: String?, elapsedMs: Int?, openAiElapsedMs: Int?, inputTokens: Int?, outputTokens: Int?, totalTokens: Int?, cachedInputTokens: Int?, reasoningTokens: Int?, fallbackReason: String?, opportunityCount: Int?, candidateCount: Int?, retryable: Bool?) {
        self.requestId = requestId
        self.model = model
        self.responseSource = responseSource
        self.elapsedMs = elapsedMs
        self.openAiElapsedMs = openAiElapsedMs
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.totalTokens = totalTokens
        self.cachedInputTokens = cachedInputTokens
        self.reasoningTokens = reasoningTokens
        self.fallbackReason = fallbackReason
        self.opportunityCount = opportunityCount
        self.candidateCount = candidateCount
        self.retryable = retryable
    }
}

public struct UpsellEventRequest: Encodable, Sendable {
    public let eventType: String
    public let checkedProductId: Int?
    public let suggestedProductId: Int?
    public let storeId: UUID?
    public let storeCode: String?
    public let sessionId: String?
    public let source: String?
    public let metadataJson: String?

    public init(eventType: String, checkedProductId: Int?, suggestedProductId: Int?, storeId: UUID?, storeCode: String?, sessionId: String?, source: String?, metadataJson: String?) {
        self.eventType = eventType
        self.checkedProductId = checkedProductId
        self.suggestedProductId = suggestedProductId
        self.storeId = storeId
        self.storeCode = storeCode
        self.sessionId = sessionId
        self.source = source
        self.metadataJson = metadataJson
    }
}

public struct UpsellDismissRequest: Encodable, Sendable {
    public let checkedProductId: Int
    public let suggestedProductId: Int?
    public let storeId: UUID?
    public let storeCode: String?
    public let sessionId: String?
    public let suppressMinutes: Int?

    public init(checkedProductId: Int, suggestedProductId: Int?, storeId: UUID?, storeCode: String?, sessionId: String?, suppressMinutes: Int?) {
        self.checkedProductId = checkedProductId
        self.suggestedProductId = suggestedProductId
        self.storeId = storeId
        self.storeCode = storeCode
        self.sessionId = sessionId
        self.suppressMinutes = suppressMinutes
    }
}

public struct UpsellPrompt: Identifiable, Hashable, Sendable {
    public let id = UUID()
    public let opportunityId: String
    public let checkedProductId: Int
    public let checkedProductName: String
    public let triggerProductIds: [Int]
    public let listID: UUID
    public let store: MobileStoreSummary?
    public let source: String
    public let suggestions: [UpsellSuggestion]

    public init(opportunityId: String, checkedProductId: Int, checkedProductName: String, triggerProductIds: [Int], listID: UUID, store: MobileStoreSummary?, source: String, suggestions: [UpsellSuggestion]) {
        self.opportunityId = opportunityId
        self.checkedProductId = checkedProductId
        self.checkedProductName = checkedProductName
        self.triggerProductIds = triggerProductIds
        self.listID = listID
        self.store = store
        self.source = source
        self.suggestions = suggestions
    }
}
