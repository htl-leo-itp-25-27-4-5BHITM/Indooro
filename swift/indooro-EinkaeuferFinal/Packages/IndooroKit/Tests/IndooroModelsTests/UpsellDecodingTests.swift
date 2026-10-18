import XCTest
@testable import IndooroModels

/// Upsell-Plan gegen die Fixture upsell-plan.json, dekodiert wie UpsellModel.
final class UpsellDecodingTests: XCTestCase {

    func testUpsellPlanDecodesWithISO8601ExpiresAt() throws {
        // Dekodierung wie UpsellModel (dateDecodingStrategy = .iso8601).
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let plan = try decoder.decode(UpsellPlanResponse.self, from: ModelFixtures.data("upsell-plan.json"))

        XCTAssertEqual(plan.source, "openai")
        XCTAssertEqual(try XCTUnwrap(plan.expiresAt).timeIntervalSince1970, 1_792_153_800, accuracy: 0.5)

        XCTAssertEqual(plan.opportunities.count, 1)
        let opportunity = try XCTUnwrap(plan.opportunities.first)
        XCTAssertEqual(opportunity.opportunityId, "opp-milch-muesli")
        XCTAssertEqual(opportunity.triggerProductIds, [92])
        XCTAssertEqual(opportunity.suggestions.count, 2)

        let first = opportunity.suggestions[0]
        XCTAssertEqual(first.id, 93)
        XCTAssertEqual(first.product.layoutCode, "520/2/1/2")
        XCTAssertTrue(first.product.hasLayoutPosition)
        XCTAssertEqual(first.product.product.price, 1.29, accuracy: 0.001)
        XCTAssertEqual(first.confidence, 0.72, accuracy: 0.001)

        // Vorschlag ohne Preis und ohne Regalposition: Defaults über die computed properties.
        let second = opportunity.suggestions[1]
        XCTAssertNil(second.product.price)
        XCTAssertNil(second.product.layoutCode)
        XCTAssertFalse(second.product.hasLayoutPosition)
        XCTAssertEqual(second.product.product.price, 0)
        XCTAssertEqual(second.product.detailText, "ohne Regalposition")

        XCTAssertEqual(plan.debug?.totalTokens, 406)
        XCTAssertEqual(plan.debug?.candidateCount, 2)
    }

    func testUpsellRequestEncodesOpportunities() throws {
        let request = UpsellPlanRequest(
            storeId: nil,
            storeCode: "SPAR-Leonding-001",
            shoppingListId: nil,
            currentListProductIds: [92],
            completedProductIds: [],
            source: "pilot",
            opportunities: [
                UpsellOpportunityRequest(opportunityId: "opp-milch-muesli", triggerProductIds: [92], triggerProductNames: ["Milch"])
            ]
        )
        let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any]

        XCTAssertEqual(object?["storeCode"] as? String, "SPAR-Leonding-001")
        XCTAssertEqual(object?["currentListProductIds"] as? [Int], [92])
        XCTAssertEqual((object?["opportunities"] as? [[String: Any]])?.first?["opportunityId"] as? String, "opp-milch-muesli")
    }
}
