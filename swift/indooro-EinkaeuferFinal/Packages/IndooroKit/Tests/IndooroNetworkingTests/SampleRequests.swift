import Foundation
@testable import IndooroNetworking

// Beispielkoerper fuer POST-Endpoints in den Tests.

extension Components.Schemas.UpsellPlanRequest {
    static var sample: Components.Schemas.UpsellPlanRequest {
        Components.Schemas.UpsellPlanRequest(
            storeId: "ad61389a-7486-48fa-afa2-9b5e4132f6a8",
            storeCode: "SPAR-Leonding-001",
            shoppingListId: "7f1c2a3e-0000-4000-8000-000000000001",
            currentListProductIds: [92],
            completedProductIds: [],
            source: "tour",
            opportunities: [
                Components.Schemas.UpsellOpportunityRequest(
                    opportunityId: "station:shelf-12",
                    triggerProductIds: [92],
                    triggerProductNames: ["Naturpur Bio-Milch 1L"]
                ),
            ]
        )
    }
}

extension Components.Schemas.UpsellEventRequest {
    static var sample: Components.Schemas.UpsellEventRequest {
        Components.Schemas.UpsellEventRequest(eventType: "shown", metadataJson: "{\"opportunityId\":\"station:shelf-12\"}")
    }
}

extension Components.Schemas.UpsellDismissRequest {
    static var sample: Components.Schemas.UpsellDismissRequest {
        Components.Schemas.UpsellDismissRequest(checkedProductId: 92)
    }
}
