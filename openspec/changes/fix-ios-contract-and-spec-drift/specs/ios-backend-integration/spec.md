## MODIFIED Requirements

### Requirement: iOS app consumes a fixed set of anonymous routes
The iOS app SHALL consume only the following backend routes: `GET /mobile/stores`, `GET /mobile/stores/beacon-identities`, `GET /mobile/stores/by-beacon?uuid&major&minor`, `GET /mobile/stores/{storeId}/layout/current` with the lowercase store UUID, `GET /layout/current`, `GET /layout/history?limit`, `GET /layout/versions/{layoutId}` with a path-encoded id, `GET /products/search?q&size[&storeId&storeCode]`, `GET /products?size`, `GET /mobile/recipes?page&size[&tag]`, `GET /mobile/recipes/search?q&page&size`, `GET /mobile/recipes/{recipeId}`, `GET /mobile/recipes/{recipeId}/product-mapping[?storeId&storeCode]`, `POST /mobile/upsell/plan`, `POST /mobile/upsell/events`, and `POST /mobile/upsell/dismiss`. WHEN an active layout store or detected store is known, product searches SHALL include its `storeId` and `storeCode`.

#### Scenario: A new backend route is needed by the app
- **GIVEN** a feature requires data from a route not in this list
- **WHEN** the change is proposed
- **THEN** the proposal adds the route to this requirement and states whether the route is anonymous

#### Scenario: Backend changes a consumed route
- **GIVEN** a backend change alters the path, parameters, or response of a listed route
- **WHEN** the change is proposed
- **THEN** it lists the iOS models and call sites that must change

#### Scenario: Search inside a selected store
- **GIVEN** the active layout store has id `ad61389a-7486-48fa-afa2-9b5e4132f6a8` and code `SPAR-Leonding-001`
- **WHEN** the customer searches „milch“
- **THEN** the request contains `storeId=ad61389a-7486-48fa-afa2-9b5e4132f6a8` and `storeCode=SPAR-Leonding-001`

#### Scenario: Search without store context
- **GIVEN** no store is active or detected
- **WHEN** the customer searches „milch“
- **THEN** the request contains only `q` and `size`

### Requirement: Product responses accept array or page shapes
The iOS product search store SHALL decode product results from a bare array or from an object with `content`, `products`, or `items`, SHALL decode each product independently with `id`, `name`, `price`, and `layoutCode`, and SHALL skip products that cannot be decoded instead of discarding the whole result.

#### Scenario: Paged product response
- **GIVEN** the backend returns `{ "content": [ … ] }`
- **WHEN** the planning tab receives it
- **THEN** the products in `content` are shown

#### Scenario: One product lacks a price
- **GIVEN** the backend returns three products and the second has `"price": null`
- **WHEN** the response is decoded
- **THEN** the first and third products are shown

## ADDED Requirements

### Requirement: All iOS requests validate HTTP status
Every iOS request whose response is used by the UI SHALL treat transport errors, non-HTTP responses, status codes outside 200–299, and empty bodies as failures, and SHALL expose a German error message that includes the HTTP status code WHEN one is available.

#### Scenario: Recipe route returns 503
- **GIVEN** `GET /mobile/recipes` returns HTTP 503 with an HTML body
- **WHEN** the recipe tab loads
- **THEN** the error state shows a message containing „503“ instead of a decoding error

### Requirement: Dates are decoded with optional fractional seconds
The iOS app SHALL decode ISO-8601 timestamps from backend and transfer payloads both with and without fractional seconds and with a `Z` or numeric offset.

#### Scenario: Plan expiry with microseconds
- **GIVEN** a plan response with `"expiresAt": "2026-09-17T10:30:00.123456Z"`
- **WHEN** the response is decoded
- **THEN** decoding succeeds and the cached opportunities expire at that instant

### Requirement: Store and layout metadata fields are decoded
The iOS app SHALL decode `address` from mobile store summaries and use it as the store subtitle when present, and SHALL decode `source` and `fallback` from mobile layout responses and keep them with the applied layout.

#### Scenario: Store with address
- **GIVEN** a store with `"address": "Poststraße 10, 4060 Leonding"`
- **WHEN** the store card is rendered
- **THEN** the subtitle reads „Poststraße 10, 4060 Leonding“

#### Scenario: Layout response marked as fallback
- **GIVEN** `GET /mobile/stores/{id}/layout/current` returns `"fallback": true`
- **WHEN** the layout is applied
- **THEN** the app knows that the layout is not the store's persisted active layout

### Requirement: Upsell dismissal window is accepted by the backend
The backend SHALL accept `suppressMinutes` values from 1 to 43 200 in `POST /mobile/upsell/dismiss`, and the iOS app SHALL send 1 440 minutes WHEN the customer chooses „Nicht mehr für dieses Produkt“.

#### Scenario: One-day suppression
- **GIVEN** the customer taps „Nicht mehr für dieses Produkt“
- **WHEN** the dismissal request with `suppressMinutes=1440` is sent
- **THEN** the backend responds with a 2xx status and stores a suppression of 24 hours

#### Scenario: Excessive suppression
- **GIVEN** a client sends `suppressMinutes=43201`
- **WHEN** the backend validates the request
- **THEN** it responds with HTTP 400
