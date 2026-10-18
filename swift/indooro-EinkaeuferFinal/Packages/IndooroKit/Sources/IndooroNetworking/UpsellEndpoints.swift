import Foundation

// Upsell-Routen. Plan ist eine POST-Anfrage mit 25 s Timeout und ohne automatische Wiederholung;
// Events und Dismiss sind Fire-and-forget mit 3 s Timeout. Die begrenzte Plan-Wiederholung
// bleibt im UpsellModel (Phase 2c), nicht im Client.

/// `POST /mobile/upsell/plan`: Zusatzvorschlaege zur aktuellen Einkaufsliste.
public struct UpsellPlanEndpoint: Endpoint {
    public typealias Response = Components.Schemas.UpsellPlanResponse
    public let request: Components.Schemas.UpsellPlanRequest

    public init(request: Components.Schemas.UpsellPlanRequest) {
        self.request = request
    }

    public var method: HTTPMethod { .post }
    public var path: String { "/mobile/upsell/plan" }
    public var body: (any Encodable & Sendable)? { request }
    public var timeout: Duration { .seconds(25) }
    public var retry: RetryPolicy { .none }
}

/// `POST /mobile/upsell/events`: Telemetrie zu Hinweisen (`shown`, `accepted`, ...). Antwort wird ignoriert.
public struct UpsellEventEndpoint: Endpoint {
    public typealias Response = EmptyResponse
    public let event: Components.Schemas.UpsellEventRequest

    public init(event: Components.Schemas.UpsellEventRequest) {
        self.event = event
    }

    public var method: HTTPMethod { .post }
    public var path: String { "/mobile/upsell/events" }
    public var body: (any Encodable & Sendable)? { event }
    public var timeout: Duration { .seconds(3) }
    public var retry: RetryPolicy { .none }
}

/// `POST /mobile/upsell/dismiss`: Hinweis wurde weggeklickt. Antwort wird ignoriert.
public struct UpsellDismissEndpoint: Endpoint {
    public typealias Response = EmptyResponse
    public let dismissal: Components.Schemas.UpsellDismissRequest

    public init(dismissal: Components.Schemas.UpsellDismissRequest) {
        self.dismissal = dismissal
    }

    public var method: HTTPMethod { .post }
    public var path: String { "/mobile/upsell/dismiss" }
    public var body: (any Encodable & Sendable)? { dismissal }
    public var timeout: Duration { .seconds(3) }
    public var retry: RetryPolicy { .none }
}
