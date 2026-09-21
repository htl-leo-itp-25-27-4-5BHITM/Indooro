## ADDED Requirements

### Requirement: iOS app targets the LeoCloud API base URL
The iOS app SHALL send all backend requests over HTTPS to the base URL `https://it220209.cloud.htl-leonding.ac.at/api` and SHALL NOT send authentication headers, cookies set by the Admin Platform, device identifiers, or customer identifiers with any request.

#### Scenario: Any backend call is made
- **GIVEN** the app performs a store, layout, product, recipe, or upsell request
- **WHEN** the request URL is built
- **THEN** it starts with `https://it220209.cloud.htl-leonding.ac.at/api/`

#### Scenario: Request headers are inspected
- **GIVEN** a request produced by the iOS app
- **WHEN** its headers are inspected
- **THEN** it contains no `Authorization` header and no customer or device identifier

### Requirement: iOS app consumes a fixed set of anonymous routes
The iOS app SHALL consume only the following backend routes: `GET /mobile/stores`, `GET /mobile/stores/beacon-identities`, `GET /mobile/stores/by-beacon?uuid&major&minor`, `GET /mobile/stores/{storeId}/layout/current` with the lowercase store UUID, `GET /layout/current`, `GET /layout/history?limit`, `GET /layout/versions/{layoutId}` with a path-encoded id, `GET /products/search?q&size`, `GET /products?size`, `GET /mobile/recipes?page&size[&tag]`, `GET /mobile/recipes/search?q&page&size`, `GET /mobile/recipes/{recipeId}`, `GET /mobile/recipes/{recipeId}/product-mapping[?storeId&storeCode]`, `POST /mobile/upsell/plan`, `POST /mobile/upsell/events`, and `POST /mobile/upsell/dismiss`.

#### Scenario: A new backend route is needed by the app
- **GIVEN** a feature requires data from a route not in this list
- **WHEN** the change is proposed
- **THEN** the proposal adds the route to this requirement and states whether the route is anonymous

#### Scenario: Backend changes a consumed route
- **GIVEN** a backend change alters the path, parameters, or response of a listed route
- **WHEN** the change is proposed
- **THEN** it lists the iOS models and call sites that must change

### Requirement: Store and layout responses are decoded tolerantly
The iOS app SHALL decode store lists from a bare array or from an envelope with `stores`, `items`, or `data`; SHALL decode store coordinates from `latitude`/`lat`, `longitude`/`lng`/`lon`, nested `coordinate` or `location` objects, and numeric or string values; SHALL decode layouts from a bare layout object, from `MobileLayoutResponse.layout`, or from an envelope with `layout`, `data`, `current`, or `version`; and SHALL decode layout history from a bare array or an envelope with `versions`, `history`, `items`, or `data`.

#### Scenario: Coordinates arrive as strings
- **GIVEN** a store response contains `"latitude": "48.2680495"`
- **WHEN** the app decodes the store
- **THEN** `latitude` equals 48.2680495

#### Scenario: Layout is wrapped
- **GIVEN** `/mobile/stores/{id}/layout/current` returns `{ "storeId": …, "layoutId": …, "layout": { … } }`
- **WHEN** the app decodes the response
- **THEN** the nested layout is applied

#### Scenario: Layout id is numeric
- **GIVEN** a layout history entry has `"layoutId": 1718000000000`
- **WHEN** the app decodes it
- **THEN** the id is stored as the string `"1718000000000"`

### Requirement: Layout elements accept beacon identity aliases
The iOS app SHALL decode layout element beacon identity from `beaconUUID`, `uuid`, or the first segment of `identityKey`; major from `beaconMajor`, `major`, or the second segment of `identityKey`; minor from `beaconMinor`, `minor`, or the third segment of `identityKey`; and the beacon label from `beaconId` or `beaconCode`. Beacon UUIDs SHALL be normalized to lowercase hyphenated form from hyphenated, braced, or 32-character hexadecimal input, and invalid UUIDs SHALL decode as absent.

#### Scenario: Identity key only
- **GIVEN** a beacon element has `"identityKey": "e2c56db5dffb48d2b060d0f5a71096e0:1:7"`
- **WHEN** the element is decoded
- **THEN** UUID is `e2c56db5-dffb-48d2-b060-d0f5a71096e0`, major is 1, and minor is 7

#### Scenario: Malformed UUID
- **GIVEN** a beacon element has `"beaconUUID": "not-a-uuid"`
- **WHEN** the element is decoded
- **THEN** the element has no beacon UUID and is not used as an iBeacon ranging constraint

### Requirement: Layout meter is derived from category when missing
WHEN a layout element has no `meter` value and its `category` contains a slash-separated second segment, the iOS app SHALL use the integer value of that segment as the element meter.

#### Scenario: Category carries meter
- **GIVEN** an element with `"category": "310/2"` and no `meter`
- **WHEN** it is decoded
- **THEN** `effectiveMeter` is 2 and `resolvedCategoryCode` is `310/2`

### Requirement: Product responses accept array or page shapes
The iOS product search store SHALL decode product results from a bare array or from an object with `content`, `products`, or `items`, and SHALL decode each product with `id`, `name`, `price`, and `layoutCode`.

#### Scenario: Paged product response
- **GIVEN** the backend returns `{ "content": [ … ] }`
- **WHEN** the planning tab receives it
- **THEN** the products in `content` are shown

### Requirement: Recipe responses accept array or page shapes
The iOS recipe store SHALL decode recipe lists from a bare array or from `RecipePageResponse` with `content`, `page`, `size`, and `totalElements`, SHALL decode timestamps of recipes as plain strings, and SHALL decode mapping states `MAPPED`, `UNMAPPED`, `MULTIPLE_CANDIDATES`, `UNAVAILABLE_IN_STORE`, and `PRODUCT_WITHOUT_LAYOUT`.

#### Scenario: Recipe page is returned
- **GIVEN** `/mobile/recipes` returns a page with two recipes
- **WHEN** the recipe tab loads
- **THEN** both recipes are listed

### Requirement: Stale responses never overwrite newer state
Every iOS store that issues repeatable requests SHALL tag each request with a fresh request identifier or load generation and SHALL discard a response whose identifier no longer matches the latest request. This applies to product search, recipe list, recipe detail, recipe mapping, upsell plans, and all layout loads.

#### Scenario: Customer types quickly
- **GIVEN** a search for „mil“ is in flight
- **WHEN** a search for „milch“ starts and the „mil“ response arrives later
- **THEN** the „mil“ response is ignored

#### Scenario: Store changes during layout load
- **GIVEN** a layout load for store A is in flight
- **WHEN** a layout load for store B starts
- **THEN** the late store A response is ignored and logged as an outdated generation

### Requirement: Layout requests validate HTTP status
The iOS positioning manager SHALL treat a layout, store, or history response as a failure WHEN there is a transport error, the response is not an HTTP response, the status is outside 200–299, or the body is empty, and SHALL expose the German error texts „Die Layout-Antwort ist ungueltig.“, „Der Server antwortete mit Status <code>.“, „Der Server hat kein Layout zurueckgegeben.“, and „Das Layout konnte nicht decodiert werden.“.

#### Scenario: Server returns 500
- **GIVEN** `/mobile/stores/{id}/layout/current` returns HTTP 500
- **WHEN** the response is processed
- **THEN** the layout load fails with „Der Server antwortete mit Status 500.“

### Requirement: Upsell requests use bounded timeouts
The iOS upsell store SHALL send `POST /mobile/upsell/plan` with JSON content type and a 25-second timeout, and SHALL send `POST /mobile/upsell/events` and `POST /mobile/upsell/dismiss` as fire-and-forget requests with a 3-second timeout whose results do not affect the UI.

#### Scenario: Event endpoint is unreachable
- **GIVEN** the network is unavailable
- **WHEN** the app reports a `shown` event
- **THEN** the prompt stays visible and no error is presented

#### Scenario: Plan request is slow
- **GIVEN** the backend needs 20 seconds for a plan
- **WHEN** the app waits for the response
- **THEN** the request is not aborted before 25 seconds

### Requirement: Upsell plan payload reflects local list state only
WHEN the iOS app requests an upsell plan, the request body SHALL contain `storeId`, `storeCode`, `shoppingListId` (local list UUID string), `currentListProductIds` (product ids of open items), `completedProductIds` (product ids of done, missing, or skipped items), `source`, and `opportunities` with `opportunityId`, `triggerProductIds`, and `triggerProductNames`, and SHALL contain no customer identity, device identity, or position.

#### Scenario: Plan request is inspected
- **GIVEN** an active tour with two stops
- **WHEN** the plan request is encoded
- **THEN** it contains two `station:shelf-<id>` opportunities and no position or device fields

### Requirement: Upsell events describe prompt interactions
The iOS app SHALL report upsell events with `eventType` values `shown`, `accepted`, `dismissed`, `suppressed`, and `failed`, SHALL set `sessionId` to null, and SHALL put `opportunityId`, comma-separated `triggerProductIds`, `responseSource`, `preloaded`, or failure `stage` and `reason` into a sorted-key JSON string in `metadataJson`.

#### Scenario: Plan request fails
- **GIVEN** the plan response cannot be decoded
- **WHEN** the failure is handled
- **THEN** a `failed` event with metadata `{"reason":"http_or_decode","stage":"plan"}` is sent

#### Scenario: Customer accepts a suggestion
- **GIVEN** a prompt is visible
- **WHEN** the customer adds a suggestion
- **THEN** an `accepted` event with `checkedProductId` and `suggestedProductId` is sent
