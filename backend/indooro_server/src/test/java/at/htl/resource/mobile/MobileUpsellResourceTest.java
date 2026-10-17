package at.htl.resource.mobile;

import at.htl.admin.dto.UpsellDtos;
import at.htl.admin.service.UpsellSuggestionService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.equalTo;
import static org.hamcrest.CoreMatchers.not;
import static org.hamcrest.CoreMatchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;

@QuarkusTest
class MobileUpsellResourceTest {

    private static final UUID STORE_ID = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    @InjectMock
    UpsellSuggestionService upsellSuggestionService;

    @Test
    void returnsValidatedSuggestions() {
        when(upsellSuggestionService.suggestions(any()))
                .thenReturn(new UpsellDtos.UpsellSuggestionResponse(
                        1,
                        List.of(new UpsellDtos.UpsellSuggestion(
                                new UpsellDtos.UpsellProductSummary(
                                        2,
                                        "Parmesan",
                                        2.99,
                                        "525/1/1/1",
                                        STORE_ID.toString(),
                                        "demo-store",
                                        null,
                                        "525",
                                        null,
                                        true
                                ),
                                "Passt gut dazu.",
                                0.88
                        )),
                        "fallback",
                        Instant.parse("2026-06-02T12:00:00Z")
                ));

        given()
                .contentType("application/json")
                .body("""
                        {
                          "storeId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                          "storeCode": "demo-store",
                          "checkedProductId": 1,
                          "shoppingListId": "local-list",
                          "currentListProductIds": [1],
                          "completedProductIds": [1],
                          "source": "shopping_session"
                        }
                        """)
                .when().post("/api/mobile/upsell/suggestions")
                .then()
                .statusCode(200)
                .body("checkedProductId", equalTo(1))
                .body("suggestions[0].product.id", equalTo(2))
                .body("suggestions[0].product.hasLayoutPosition", equalTo(true))
                .body("suggestions[0].reason", equalTo("Passt gut dazu."));
    }

    @Test
    void returnsPlannedStationSuggestions() {
        when(upsellSuggestionService.plan(any()))
                .thenReturn(new UpsellDtos.UpsellPlanResponse(
                        List.of(new UpsellDtos.UpsellOpportunityResponse(
                                "station:shelf-430",
                                List.of(1, 3),
                                List.of(new UpsellDtos.UpsellSuggestion(
                                        new UpsellDtos.UpsellProductSummary(
                                                2,
                                                "Parmesan",
                                                2.99,
                                                "525/1/1/1",
                                                STORE_ID.toString(),
                                                "demo-store",
                                                null,
                                                "525",
                                                null,
                                                true
                                        ),
                                        "Passt gut zur Station.",
                                        0.88
                                ))
                        )),
                        "fallback",
                        Instant.parse("2026-06-02T12:00:00Z"),
                        null
                ));

        given()
                .contentType("application/json")
                .body("""
                        {
                          "storeId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                          "storeCode": "demo-store",
                          "shoppingListId": "local-list",
                          "currentListProductIds": [1, 3],
                          "completedProductIds": [],
                          "source": "shopping_session",
                          "opportunities": [
                            {
                              "opportunityId": "station:shelf-430",
                              "triggerProductIds": [1, 3],
                              "triggerProductNames": ["Spaghetti", "Tomatensauce"]
                            }
                          ]
                        }
                        """)
                .when().post("/api/mobile/upsell/plan")
                .then()
                .statusCode(200)
                .body("source", equalTo("fallback"))
                .body("opportunities[0].opportunityId", equalTo("station:shelf-430"))
                .body("opportunities[0].triggerProductIds[1]", equalTo(3))
                .body("opportunities[0].suggestions[0].product.id", equalTo(2));
    }

    @Test
    void returnsMultiplePlannedOpportunities() {
        when(upsellSuggestionService.plan(any()))
                .thenReturn(new UpsellDtos.UpsellPlanResponse(
                        List.of(
                                new UpsellDtos.UpsellOpportunityResponse("station:shelf-430", List.of(1), List.of()),
                                new UpsellDtos.UpsellOpportunityResponse("station:shelf-525", List.of(3), List.of())
                        ),
                        "fallback",
                        Instant.parse("2026-06-02T12:00:00Z"),
                        null
                ));

        given()
                .contentType("application/json")
                .body("""
                        {
                          "shoppingListId": "local-list",
                          "source": "shopping_session",
                          "opportunities": [
                            { "opportunityId": "station:shelf-430", "triggerProductIds": [1] },
                            { "opportunityId": "station:shelf-525", "triggerProductIds": [3] }
                          ]
                        }
                        """)
                .when().post("/api/mobile/upsell/plan")
                .then()
                .statusCode(200)
                .body("opportunities.size()", equalTo(2))
                .body("opportunities[1].opportunityId", equalTo("station:shelf-525"));
    }

    @Test
    void invalidOpportunityRequestReturnsBadRequest() {
        when(upsellSuggestionService.plan(any()))
                .thenThrow(new WebApplicationException("Mindestens eine Upsell-Station ist erforderlich.", Response.Status.BAD_REQUEST));

        given()
                .contentType("application/json")
                .body("{\"opportunities\":[]}")
                .when().post("/api/mobile/upsell/plan")
                .then()
                .statusCode(400);
    }

    @Test
    void invalidCheckedProductReturnsNotFound() {
        when(upsellSuggestionService.suggestions(any()))
                .thenThrow(new WebApplicationException("Produkt nicht gefunden.", Response.Status.NOT_FOUND));

        given()
                .contentType("application/json")
                .body("{\"checkedProductId\":999}")
                .when().post("/api/mobile/upsell/suggestions")
                .then()
                .statusCode(404);
    }

    @Test
    void recordsEventsAndDismissals() {
        doNothing().when(upsellSuggestionService).recordEvent(any());
        doNothing().when(upsellSuggestionService).dismiss(any());

        given()
                .contentType("application/json")
                .body("{\"eventType\":\"dismissed\",\"checkedProductId\":1,\"suggestedProductId\":2}")
                .when().post("/api/mobile/upsell/events")
                .then()
                .statusCode(202)
                .body(not(containsString("openai")))
                .body(not(containsString("api")));

        given()
                .contentType("application/json")
                .body("{\"checkedProductId\":1,\"suggestedProductId\":2}")
                .when().post("/api/mobile/upsell/dismiss")
                .then()
                .statusCode(202)
                .body(not(containsString("openai")))
                .body(not(containsString("api")));
    }

    @Test
    void acceptsDismissalSuppressionUpToThirtyDays() {
        doNothing().when(upsellSuggestionService).dismiss(any());

        given()
                .contentType("application/json")
                .body("""
                        {
                          "checkedProductId": 1,
                          "suggestedProductId": 2,
                          "storeId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                          "sessionId": "s",
                          "suppressMinutes": 1440
                        }
                        """)
                .when().post("/api/mobile/upsell/dismiss")
                .then()
                .statusCode(202);
    }

    @Test
    void rejectsDismissalSuppressionAboveThirtyDays() {
        given()
                .contentType("application/json")
                .body("""
                        {
                          "checkedProductId": 1,
                          "suggestedProductId": 2,
                          "storeId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                          "sessionId": "s",
                          "suppressMinutes": 43201
                        }
                        """)
                .when().post("/api/mobile/upsell/dismiss")
                .then()
                .statusCode(400);
    }
}
