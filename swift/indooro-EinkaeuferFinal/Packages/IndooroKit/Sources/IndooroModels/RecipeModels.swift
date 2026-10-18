import Foundation

private func recipeDisplayText(_ value: String) -> String {
    let replacements = [
        ("Frueh", "Früh"),
        ("frueh", "früh"),
        ("Muesli", "Müsli"),
        ("muesli", "müsli"),
        ("Gemuese", "Gemüse"),
        ("gemuese", "gemüse"),
        ("Kaese", "Käse"),
        ("kaese", "käse"),
        ("Kuehl", "Kühl"),
        ("kuehl", "kühl"),
        ("Kraeuter", "Kräuter"),
        ("kraeuter", "kräuter"),
        ("Suesse", "Süße"),
        ("suesse", "süße"),
        ("Saett", "Sätt"),
        ("saett", "sätt"),
        ("Waerm", "Wärm"),
        ("waerm", "wärm"),
        ("ueber", "über"),
        ("Ueber", "Über"),
        ("ruehr", "rühr"),
        ("Ruehr", "Rühr"),
        ("wuerz", "würz"),
        ("Wuerz", "Würz"),
        ("gewuer", "gewür"),
        ("Gewuer", "Gewür"),
        ("Aepfel", "Äpfel"),
        ("aepfel", "äpfel"),
        ("Apfelstueck", "Apfelstück"),
        ("apfelstueck", "apfelstück"),
        ("fuer", "für")
    ]

    return replacements.reduce(value) { result, replacement in
        result.replacingOccurrences(of: replacement.0, with: replacement.1)
    }
}

public struct RecipeTag: Codable, Identifiable, Hashable, Sendable {
    public let id: UUID
    public let code: String
    public let name: String
    public let kind: String?
    public let status: String?

    public var displayName: String {
        recipeDisplayText(name)
    }

    public init(id: UUID, code: String, name: String, kind: String?, status: String?) {
        self.id = id
        self.code = code
        self.name = name
        self.kind = kind
        self.status = status
    }
}

public struct RecipeSummary: Codable, Identifiable, Hashable, Sendable {
    public let id: UUID
    public let slug: String
    public let title: String
    public let summary: String?
    public let imageUrl: String?
    public let servings: Int
    public let prepTimeMinutes: Int?
    public let cookTimeMinutes: Int?
    public let totalTimeMinutes: Int?
    public let status: String?
    public let publishedAt: String?
    public let mappedIngredientCount: Int?
    public let totalIngredientCount: Int?
    public let tags: [RecipeTag]

    public var displayTitle: String {
        recipeDisplayText(title)
    }

    public var displaySummary: String? {
        summary.map(recipeDisplayText)
    }

    public init(id: UUID, slug: String, title: String, summary: String?, imageUrl: String?, servings: Int, prepTimeMinutes: Int?, cookTimeMinutes: Int?, totalTimeMinutes: Int?, status: String?, publishedAt: String?, mappedIngredientCount: Int?, totalIngredientCount: Int?, tags: [RecipeTag]) {
        self.id = id
        self.slug = slug
        self.title = title
        self.summary = summary
        self.imageUrl = imageUrl
        self.servings = servings
        self.prepTimeMinutes = prepTimeMinutes
        self.cookTimeMinutes = cookTimeMinutes
        self.totalTimeMinutes = totalTimeMinutes
        self.status = status
        self.publishedAt = publishedAt
        self.mappedIngredientCount = mappedIngredientCount
        self.totalIngredientCount = totalIngredientCount
        self.tags = tags
    }
}

public struct RecipeDetail: Codable, Identifiable, Hashable, Sendable {
    public let id: UUID
    public let slug: String
    public let title: String
    public let summary: String?
    public let description: String?
    public let imageUrl: String?
    public let imageAlt: String?
    public let servings: Int
    public let prepTimeMinutes: Int?
    public let cookTimeMinutes: Int?
    public let totalTimeMinutes: Int?
    public let status: String?
    public let publishedAt: String?
    public let archivedAt: String?
    public let createdAt: String?
    public let updatedAt: String?
    public let tags: [RecipeTag]
    public let ingredients: [RecipeIngredient]
    public let steps: [RecipeStep]

    public var displayTitle: String {
        recipeDisplayText(title)
    }

    public var displaySummary: String? {
        summary.map(recipeDisplayText)
    }

    public init(id: UUID, slug: String, title: String, summary: String?, description: String?, imageUrl: String?, imageAlt: String?, servings: Int, prepTimeMinutes: Int?, cookTimeMinutes: Int?, totalTimeMinutes: Int?, status: String?, publishedAt: String?, archivedAt: String?, createdAt: String?, updatedAt: String?, tags: [RecipeTag], ingredients: [RecipeIngredient], steps: [RecipeStep]) {
        self.id = id
        self.slug = slug
        self.title = title
        self.summary = summary
        self.description = description
        self.imageUrl = imageUrl
        self.imageAlt = imageAlt
        self.servings = servings
        self.prepTimeMinutes = prepTimeMinutes
        self.cookTimeMinutes = cookTimeMinutes
        self.totalTimeMinutes = totalTimeMinutes
        self.status = status
        self.publishedAt = publishedAt
        self.archivedAt = archivedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.tags = tags
        self.ingredients = ingredients
        self.steps = steps
    }
}

public struct RecipeIngredient: Codable, Identifiable, Hashable, Sendable {
    public let id: UUID
    public let position: Int
    public let displayName: String
    public let canonicalName: String?
    public let quantity: Double?
    public let quantityText: String?
    public let unitCode: String?
    public let unitDisplayName: String?
    public let preparationNote: String?
    public let optional: Bool

    public var localizedPreparationNote: String? {
        preparationNote.map(recipeDisplayText)
    }

    public var displayUnitForList: String? {
        guard let unitCode else {
            return nil
        }

        let trimmed = unitCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        switch trimmed.lowercased() {
        case "piece":
            return nil
        case "tbsp":
            return "EL"
        case "tsp":
            return "TL"
        case "pinch":
            return "Prise"
        default:
            return trimmed
        }
    }

    public var amountText: String? {
        if let quantityText, !quantityText.isEmpty {
            if let displayUnitForList {
                return "\(quantityText) \(displayUnitForList)"
            }
            return quantityText
        }
        if let quantity {
            let formatted = quantity.rounded() == quantity ? String(Int(quantity)) : String(quantity)
            if let displayUnitForList {
                return "\(formatted) \(displayUnitForList)"
            }
            return formatted
        }
        return nil
    }

    public var quantityTextForList: String? {
        if let quantityText, !quantityText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return quantityText
        }
        if let quantity {
            return quantity.rounded() == quantity ? String(Int(quantity)) : String(quantity)
        }
        return nil
    }

    public var cleanDisplayName: String {
        let trimmedName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let rawUnit = unitCode?.trimmingCharacters(in: .whitespacesAndNewlines)
        let amountCandidates = [
            amountText,
            [quantityTextForList, rawUnit]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .joined(separator: " "),
            [quantityTextForList, displayUnitForList]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .joined(separator: " "),
            quantityTextForList
        ]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .sorted { $0.count > $1.count }

        for amount in amountCandidates {
            let prefix = "\(amount) "
            if trimmedName.range(of: prefix, options: [.anchored, .caseInsensitive]) != nil {
                let start = trimmedName.index(trimmedName.startIndex, offsetBy: prefix.count)
                let cleaned = trimmedName[start...].trimmingCharacters(in: .whitespacesAndNewlines)
                if !cleaned.isEmpty {
                    return cleaned
                }
            }
        }

        return trimmedName
    }

    public var cleanLocalizedDisplayName: String {
        recipeDisplayText(cleanDisplayName)
    }

    public init(id: UUID, position: Int, displayName: String, canonicalName: String?, quantity: Double?, quantityText: String?, unitCode: String?, unitDisplayName: String?, preparationNote: String?, optional: Bool) {
        self.id = id
        self.position = position
        self.displayName = displayName
        self.canonicalName = canonicalName
        self.quantity = quantity
        self.quantityText = quantityText
        self.unitCode = unitCode
        self.unitDisplayName = unitDisplayName
        self.preparationNote = preparationNote
        self.optional = optional
    }
}

public struct RecipeStep: Codable, Identifiable, Hashable, Sendable {
    public var id: Int { position }
    public let position: Int
    public let instruction: String
    public let durationMinutes: Int?

    public var displayInstruction: String {
        recipeDisplayText(instruction)
    }

    public init(position: Int, instruction: String, durationMinutes: Int?) {
        self.position = position
        self.instruction = instruction
        self.durationMinutes = durationMinutes
    }
}

public struct RecipeProductMappingResponse: Codable, Hashable, Sendable {
    public let recipeId: UUID
    public let storeId: UUID?
    public let storeCode: String?
    public let ingredients: [RecipeIngredientMappingStatus]

    public init(recipeId: UUID, storeId: UUID?, storeCode: String?, ingredients: [RecipeIngredientMappingStatus]) {
        self.recipeId = recipeId
        self.storeId = storeId
        self.storeCode = storeCode
        self.ingredients = ingredients
    }
}

public struct RecipeIngredientMappingStatus: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID { ingredientId }
    public let ingredientId: UUID
    public let ingredientName: String
    public let status: RecipeMappingState
    public let product: MappedRecipeProduct?
    public let candidates: [MappedRecipeProduct]
    public let confidence: Double?
    public let manuallyConfirmed: Bool
    public let reason: String?

    public init(ingredientId: UUID, ingredientName: String, status: RecipeMappingState, product: MappedRecipeProduct?, candidates: [MappedRecipeProduct], confidence: Double?, manuallyConfirmed: Bool, reason: String?) {
        self.ingredientId = ingredientId
        self.ingredientName = ingredientName
        self.status = status
        self.product = product
        self.candidates = candidates
        self.confidence = confidence
        self.manuallyConfirmed = manuallyConfirmed
        self.reason = reason
    }
}

public enum RecipeMappingState: String, Codable, Hashable, Sendable {
    case mapped = "MAPPED"
    case unmapped = "UNMAPPED"
    case multipleCandidates = "MULTIPLE_CANDIDATES"
    case unavailableInStore = "UNAVAILABLE_IN_STORE"
    case productWithoutLayout = "PRODUCT_WITHOUT_LAYOUT"
}

public struct MappedRecipeProduct: Codable, Hashable, Sendable {
    public let id: Int
    public let name: String
    public let price: Double?
    public let layoutCode: String?
    public let storeId: String?
    public let storeCode: String?

    public var product: Product? {
        guard let price, let layoutCode, !layoutCode.isEmpty else {
            return nil
        }
        return Product(id: id, name: name, price: price, layoutCode: layoutCode)
    }

    public init(id: Int, name: String, price: Double?, layoutCode: String?, storeId: String?, storeCode: String?) {
        self.id = id
        self.name = name
        self.price = price
        self.layoutCode = layoutCode
        self.storeId = storeId
        self.storeCode = storeCode
    }
}

public struct RecipePageResponse<T: Codable>: Codable {
    public let content: [T]
    public let page: Int
    public let size: Int
    public let totalElements: Int

    public init(content: [T], page: Int, size: Int, totalElements: Int) {
        self.content = content
        self.page = page
        self.size = size
        self.totalElements = totalElements
    }
}

extension RecipePageResponse: Sendable where T: Sendable {}
