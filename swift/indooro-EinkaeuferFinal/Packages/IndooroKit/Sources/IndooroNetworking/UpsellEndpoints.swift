import Foundation

// Upsell-Routen. Plan ist eine POST-Anfrage mit 25 s Timeout und ohne automatische Wiederholung;
// Events und Dismiss sind Fire-and-forget mit 3 s Timeout. Die begrenzte Plan-Wiederholung
// bleibt im UpsellModel (Phase 2c), nicht im Client.
//
// Jeder Endpoint akzeptiert entweder den generierten Request-Typ oder einen beliebigen
// Encodable-Body. Die App uebergibt ihre bisherigen Modelle (`UpsellPlanRequest` usw.), damit
// die gesendeten Bytes unveraendert bleiben.

/// `POST /mobile/upsell/plan`: Zusatzvorschlaege zur aktuellen Einkaufsliste.
public struct UpsellPlanEndpoint: Endpoint {
    public typealias Response = Components.Schemas.UpsellPlanResponse
    private let payload: any Encodable & Sendable

    public init(request: Components.Schemas.UpsellPlanRequest) {
        payload = request
    }

    /// Body in der Form, in der die App ihn bereits erzeugt.
    public init<Body: Encodable & Sendable>(body: Body) {
        payload = body
    }

    public var method: HTTPMethod { .post }
    public var path: String { "/mobile/upsell/plan" }
    public var body: (any Encodable & Sendable)? { payload }
    public var timeout: Duration { .seconds(25) }
    public var retry: RetryPolicy { .none }
}

/// `POST /mobile/upsell/events`: Telemetrie zu Hinweisen (`shown`, `accepted`, ...). Antwort wird ignoriert.
public struct UpsellEventEndpoint: Endpoint {
    public typealias Response = EmptyResponse
    private let payload: any Encodable & Sendable

    public init(event: Components.Schemas.UpsellEventRequest) {
        payload = event
    }

    /// Body in der Form, in der die App ihn bereits erzeugt.
    public init<Body: Encodable & Sendable>(body: Body) {
        payload = body
    }

    public var method: HTTPMethod { .post }
    public var path: String { "/mobile/upsell/events" }
    public var body: (any Encodable & Sendable)? { payload }
    public var timeout: Duration { .seconds(3) }
    public var retry: RetryPolicy { .none }
}

/// `POST /mobile/upsell/dismiss`: Hinweis wurde weggeklickt. Antwort wird ignoriert.
public struct UpsellDismissEndpoint: Endpoint {
    public typealias Response = EmptyResponse
    private let payload: any Encodable & Sendable

    public init(dismissal: Components.Schemas.UpsellDismissRequest) {
        payload = dismissal
    }

    /// Body in der Form, in der die App ihn bereits erzeugt.
    public init<Body: Encodable & Sendable>(body: Body) {
        payload = body
    }

    public var method: HTTPMethod { .post }
    public var path: String { "/mobile/upsell/dismiss" }
    public var body: (any Encodable & Sendable)? { payload }
    public var timeout: Duration { .seconds(3) }
    public var retry: RetryPolicy { .none }
}
