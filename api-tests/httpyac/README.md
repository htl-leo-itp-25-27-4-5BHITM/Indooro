# Indooro httpYac API Tests

Diese Tests pruefen die laufende Indooro-API von aussen gegen LeoCloud:

```text
https://it220209.cloud.htl-leonding.ac.at
```

Die Tests sind bewusst keine Quarkus-Unit-Tests. Sie verhalten sich wie ein echter
Client: HTTP Request raus, Response pruefen, Rollen und Auth gegen Keycloak testen.

## Welche Env-Datei brauche ich?

Du brauchst lokal die Datei:

```text
api-tests/httpyac/.env
```

Die Datei:

```text
api-tests/httpyac/.env.example
```

ist nur die Vorlage. Sie wird committed und zeigt, welche Variablen gebraucht
werden. Echte Passwoerter gehoeren nur in `.env`.

Die echte `.env` soll nicht committed werden.

## Setup

Vom Repository-Root aus:

```bash
cp api-tests/httpyac/.env.example api-tests/httpyac/.env
```

Dann in `api-tests/httpyac/.env` die Passwoerter setzen:

```text
ADMIN_USERNAME=indooro-admin
ADMIN_PASSWORD=...

REGION_USERNAME=indooro-region
REGION_PASSWORD=...

STORE_USERNAME=indooro-store
STORE_PASSWORD=...
```

Die Basis-URLs sind fuer LeoCloud schon richtig vorbelegt:

```text
BASE_URL=https://it220209.cloud.htl-leonding.ac.at
KEYCLOAK_TOKEN_URL=https://it220209.cloud.htl-leonding.ac.at/keycloak/realms/indooro/protocol/openid-connect/token
OIDC_CLIENT_ID=indooro-admin-web
```

## Muss ich Tokens eintragen?

Normalerweise: nein.

Diese Felder bleiben leer:

```text
ADMIN_TOKEN=
REGION_TOKEN=
STORE_TOKEN=
```

Der normale Testlauf holt sich die Access Tokens automatisch bei Keycloak mit:

- `indooro-admin`
- `indooro-region`
- `indooro-store`

Dafuer muss beim Keycloak-Client `indooro-admin-web` Direct Access Grants aktiv
sein. Das ist aktuell so konfiguriert.

Tokens musst du nur dann manuell eintragen, wenn der automatische Login gegen
Keycloak nicht funktioniert und du kurzfristig mit kopierten Access Tokens testen
willst. Dann nutzt du die `:tokens` Scripts.

## Ausfuehren

Alle API-Smoke- und Rollen-Tests:

```bash
npm run api:test
```

Mit weniger Ausgabe, praktisch fuer schnelle Checks:

```bash
npm run api:test -- --output none --output-failed response
```

Erwarteter erfolgreicher Endstand:

```text
92 requests processed (92 succeeded)
```

## Was sind die 92 Tests?

Der Gesamtlauf `npm run api:test` fuehrt diese Dateien aus:

```text
00-auth.http
01-public-routes.http
02-admin-rbac.http
03-maintenance-smoke.http
04-role-route-matrix.http
05-recipes.http
06-upsell.http
```

Zusammen sind das 92 HTTP-Requests mit Assertions.

### 00-auth.http: 3 Auth-Checks

Diese Datei holt echte Access Tokens von Keycloak und speichert sie fuer die
folgenden Requests im httpYac-Kontext.

1. `POST {{KEYCLOAK_TOKEN_URL}}` fuer `indooro-admin`
2. `POST {{KEYCLOAK_TOKEN_URL}}` fuer `indooro-region`
3. `POST {{KEYCLOAK_TOKEN_URL}}` fuer `indooro-store`

Geprueft wird jeweils:

- Keycloak akzeptiert Username/Passwort.
- Der Client `indooro-admin-web` darf Direct Access Grants verwenden.
- Ein Access Token wird geliefert.

### 01-public-routes.http: 12 Public-Checks

Diese Checks laufen ohne Login. Sie stellen sicher, dass die oeffentlichen APIs
weiterhin anonym erreichbar sind.

1. `GET /api/products?size=5`
2. `GET /api/products/search`
3. `GET /api/products/search?q=milch&size=5`
4. `GET /api/products/search?q=milch&size=5&storeId={ACTIVE_STORE_ID}`
5. `GET /api/products/{TEST_PRODUCT_ID}`
6. `GET /api/categories?size=20`
7. `GET /api/categories/{TEST_CATEGORY_CODE}`
8. `GET /api/mobile/stores`
9. `GET /api/mobile/stores/beacon-identities`
10. `GET /api/mobile/stores/by-beacon`
11. `GET /api/mobile/stores/by-beacon?uuid={ACTIVE_BEACON_UUID}`
12. `GET /api/mobile/stores/{ACTIVE_STORE_ID}/layout/current`

Geprueft wird unter anderem:

- Public Routes brauchen keinen Bearer Token.
- Listen liefern JSON.
- Suchparameter werden validiert.
- Mobile Store Detection und Layout-Endpunkte bleiben anonym nutzbar.

### 02-admin-rbac.http: 17 RBAC-Kernchecks

Diese Datei prueft die wichtigsten Admin-Rollenregeln kompakt.

1. `GET /api/admin/me` anonym
2. `GET /api/admin/me` als `indooro-admin`
3. `GET /api/admin/me` als `indooro-region`
4. `GET /api/admin/me` als `indooro-store`
5. `GET /api/admin/logs?limit=5` als Admin
6. `GET /api/admin/logs?limit=5` als Store-Manager
7. `GET /api/admin/error-logs?limit=5` als Admin
8. `GET /api/admin/error-logs?limit=5` als Region-Manager
9. `GET /api/regions` als Admin
10. `GET /api/stores?size=20` als Admin
11. `GET /api/stores/{REGION_ALLOWED_STORE_ID}` als Region-Manager
12. `GET /api/stores/{REGION_FORBIDDEN_STORE_ID}` als Region-Manager
13. `GET /api/stores/{STORE_ALLOWED_STORE_ID}` als Store-Manager
14. `GET /api/stores/{STORE_FORBIDDEN_STORE_ID}` als Store-Manager
15. `GET /api/stores/{STORE_ALLOWED_STORE_ID}/layout/current` als Store-Manager
16. `GET /api/stores/{STORE_FORBIDDEN_STORE_ID}/layout/current` als Store-Manager
17. `GET /api/beacons` als Store-Manager

Geprueft wird unter anderem:

- Admin-Routen sind nicht frei als JSON-API nutzbar.
- `/api/admin/me` erkennt alle drei Rollen korrekt.
- Admin darf Logs und Error-Logs sehen.
- Region- und Store-Manager duerfen globale Logs nicht sehen.
- Store-Manager darf nur seine eigene Filiale und deren Layout sehen.

### 03-maintenance-smoke.http: 8 Maintenance-Checks

Diese Checks pruefen Operator- und Wartungsfunktionen als Smoke-Test. Sie sind
bewusst schlank, weil manche Endpunkte echte Daten oder Indexe veraendern.

1. `GET /api/admin/health`
2. `POST /api/admin/index/create`
3. `POST /api/products/bulk`
4. `POST /api/products`
5. `POST /api/categories/bulk` anonym
6. `POST /api/categories/bulk` als Store-Manager
7. `POST /api/categories/bulk` als Admin
8. `POST /api/export/pdf`

Geprueft wird:

- Backend-Health ist erreichbar.
- OpenSearch-Index-Erstellung ist grundsaetzlich aufrufbar.
- Produkt- und Kategorie-Import funktionieren als Smoke.
- Produkt-Import-Beispiele koennen optional eine Store-Zuordnung (`storeId`) schreiben, damit store-scoped Search verifiziert werden kann.
- Kategorie-Bulk-Import ist nicht anonym oder fuer Store-Manager offen.
- PDF-Export antwortet erfolgreich.

Hinweis: Das ist noch keine vollstaendige fachliche Import-/Export-Teststrecke.
Es ist ein Betriebs-Smoke fuer die wichtigsten Maintenance-Routen.

### 04-role-route-matrix.http: 39 Rollenmatrix-Checks

Diese Datei prueft viele Admin-GET-Routen systematisch mit den drei Rollen.
Sie ist breiter als `02-admin-rbac.http`.

1. `GET /api/admin/me` als Admin
2. `GET /api/admin/me` als Region-Manager
3. `GET /api/admin/me` als Store-Manager
4. `GET /api/admin/logs?limit=5` als Admin
5. `GET /api/admin/logs?limit=5` als Region-Manager
6. `GET /api/admin/logs?limit=5` als Store-Manager
7. `GET /api/admin/error-logs?limit=5` als Admin
8. `GET /api/admin/error-logs?limit=5` als Region-Manager
9. `GET /api/admin/error-logs?limit=5` als Store-Manager
10. `GET /api/regions` als Admin
11. `GET /api/regions` als Region-Manager
12. `GET /api/regions` als Store-Manager
13. `GET /api/stores?size=20` als Admin
14. `GET /api/stores?size=20` als Region-Manager
15. `GET /api/stores?size=20` als Store-Manager
16. `GET /api/stores/{ACTIVE_STORE_ID}` als Admin
17. `GET /api/stores/{REGION_ALLOWED_STORE_ID}` als Region-Manager
18. `GET /api/stores/{REGION_FORBIDDEN_STORE_ID}` als Region-Manager
19. `GET /api/stores/{STORE_ALLOWED_STORE_ID}` als Store-Manager
20. `GET /api/stores/{STORE_FORBIDDEN_STORE_ID}` als Store-Manager
21. `GET /api/beacons` als Admin
22. `GET /api/beacons` als Region-Manager
23. `GET /api/beacons` als Store-Manager
24. `GET /api/beacons/free` als Admin
25. `GET /api/beacons/free` als Region-Manager
26. `GET /api/beacons/free` als Store-Manager
27. `GET /api/stores/{ACTIVE_STORE_ID}/audit` als Admin
28. `GET /api/stores/{STORE_ALLOWED_STORE_ID}/audit` als Store-Manager
29. `GET /api/stores/{STORE_FORBIDDEN_STORE_ID}/audit` als Store-Manager
30. `GET /api/stores/{ACTIVE_STORE_ID}/beacons` als Admin
31. `GET /api/stores/{STORE_ALLOWED_STORE_ID}/beacons` als Store-Manager
32. `GET /api/stores/{STORE_FORBIDDEN_STORE_ID}/beacons` als Store-Manager
33. `GET /api/stores/{ACTIVE_STORE_ID}/layout/current` als Admin
34. `GET /api/stores/{STORE_ALLOWED_STORE_ID}/layout/current` als Store-Manager
35. `GET /api/stores/{STORE_FORBIDDEN_STORE_ID}/layout/current` als Store-Manager
36. `GET /api/stores/{STORE_ALLOWED_STORE_ID}/layout/versions` als Store-Manager
37. `GET /api/stores/{STORE_FORBIDDEN_STORE_ID}/layout/versions` als Store-Manager
38. `GET /api/stores/{STORE_ALLOWED_STORE_ID}/layout/editor-context` als Store-Manager
39. `GET /api/stores/{STORE_FORBIDDEN_STORE_ID}/layout/editor-context` als Store-Manager

Geprueft wird:

- Admin hat globale Leserechte.
- Region-Manager sieht nur seine Region und deren Stores.
- Store-Manager sieht nur seine eigene Filiale.
- Fremde Store-Details, Audits, Beacons und Layouts liefern fuer Store-Manager
  `403`.
- Rollenfehler sind echte Authorization-Fehler und keine kaputten Logins.

### 05-recipes.http: 8 Recipe-Smoke-Checks

Diese Datei prueft neue Recipe-Catalog-Routen, ohne Live-Daten hart
vorauszusetzen. Detail- und Mapping-Routen akzeptieren fuer unbekannte
Fixture-IDs deshalb `404`; mit einer echten publizierten `ACTIVE_RECIPE_ID`
liefern sie `200`.

1. `GET /api/mobile/recipes?page=0&size=5` anonym
2. `GET /api/mobile/recipes/search` anonym ohne `q`
3. `GET /api/mobile/recipes/search?q={RECIPE_SEARCH_QUERY}&size=5` anonym
4. `GET /api/mobile/recipes/{ACTIVE_RECIPE_ID}` anonym
5. `GET /api/mobile/recipes/{ACTIVE_RECIPE_ID}/product-mapping?storeId={ACTIVE_STORE_ID}` anonym
6. `GET /api/admin/recipes` anonym
7. `GET /api/admin/recipes?size=10` als Admin
8. `GET /api/admin/recipe-tags` als Admin

Geprueft wird:

- Mobile Recipe APIs bleiben oeffentlich/anonym.
- Recipe Search validiert den Pflichtparameter `q`.
- Admin Recipe APIs sind geschuetzt.
- Admin kann Recipes und Recipe Tags lesen.

### 06-upsell.http: 5 Upsell-Smoke-Checks

Diese Datei prueft die anonymen Mobile-Upsell-Routen. Sie verwendet keine
OpenAI-Secrets und setzt keinen OpenAI-Key auf dem Client voraus.

1. `POST /api/mobile/upsell/suggestions` mit `UPSELL_CHECKED_PRODUCT_ID`
2. `POST /api/mobile/upsell/suggestions` mit `UPSELL_UNKNOWN_PRODUCT_ID`
3. `POST /api/mobile/upsell/plan` mit station opportunity
4. `POST /api/mobile/upsell/events`
5. `POST /api/mobile/upsell/dismiss`

Geprueft wird:

- Suggestions liefern JSON fuer einen gueltigen Produktkontext.
- Unbekannte Produkt-IDs liefern einen sauberen Fehler.
- Station-based Upsell-Plans bleiben oeffentlich nutzbar.
- Events und Dismissals liefern `202` und geben keine sensitiven Details aus.

## Schema-Validierung gegen den Contract

- Dokumentierte 2xx-JSON-Antworten werden in `01`, `05` und `06` per `{{ }}`-Block gegen `openspec/specs/shared-api/openapi.yaml` geprueft (`support/contract.mjs`).
- Der Helper sucht die Operation ueber `operationId`, loest `$ref` im Dokument auf und wirft bei Abweichung einen Fehler mit den AJV-Meldungen.
- Ein Status, den die Operation nicht dokumentiert, ist ebenfalls ein Fehler; Routen mit `200|404` validieren nur den `200`-Zweig.
- Die Helper-Tests laufen offline mit `npm run contract:test` (`node --test`).
- Der Helper wird ueber `require` relativ zur `.http`-Datei geladen; das braucht Node 22.12 oder neuer (require(esm)).

## Einzelne Testbereiche

Public Routes, ohne Login:

```bash
npm run api:test:public -- --output none --output-failed response
```

Admin/RBAC-Kerntest:

```bash
npm run api:test:rbac -- --output none --output-failed response
```

Breite Rollenmatrix fuer alle drei Rollen:

```bash
npm run api:test:roles -- --output none --output-failed response
```

Maintenance-Smoke-Tests:

```bash
npm run api:test:maintenance -- --output none --output-failed response
```

Recipe-Smoke-Tests:

```bash
npm run api:test:recipes -- --output none --output-failed response
```

Upsell-Smoke-Tests:

```bash
npm run api:test:upsell -- --output none --output-failed response
```

## Token-Fallback

Nur verwenden, wenn du Access Tokens manuell in `.env` eingetragen hast:

```bash
npm run api:test:rbac:tokens -- --output none --output-failed response
npm run api:test:roles:tokens -- --output none --output-failed response
npm run api:test:maintenance:tokens -- --output none --output-failed response
```

Fuer den normalen Stand brauchst du diese Variante nicht.

## Was wird getestet?

- Public Product APIs bleiben anonym erreichbar.
- Public Category APIs bleiben anonym erreichbar.
- Public Mobile Store APIs bleiben anonym erreichbar.
- Public Mobile Recipe APIs bleiben anonym erreichbar.
- Public Mobile Upsell APIs bleiben anonym erreichbar.
- Admin APIs sind ohne Login nicht direkt als JSON-API nutzbar.
- Admin Recipe APIs brauchen Admin-Auth.
- `indooro-admin` darf globale Admin-Routen verwenden.
- `indooro-region` ist auf seine Region eingeschraenkt.
- `indooro-store` ist auf seine Filiale eingeschraenkt.
- Store-Manager bekommt bei fremden Filialen `403`.
- Maintenance-Endpunkte haben Smoke-Coverage.

## Manueller Layout-Fallback-Check

Wenn ein aktiver Demo-Store keine aktive Layout-Version hat, muss diese Route
weiterhin `200` liefern und den Fallback explizit markieren:

```bash
curl -i "$BASE_URL/api/mobile/stores/$ACTIVE_STORE_ID/layout/current"
```

Erwarteter JSON-Contract in diesem Fall: `layoutId` ist `null`, `source` ist
`DEFAULT`, `fallback` ist `true`, und `layout` enthaelt das Default-Layout.

## Wichtige Fixture-IDs

Diese IDs stehen in `.env` und muessen zur aktuellen Demo-Datenbank passen:

```text
ACTIVE_STORE_ID=ad61389a-7486-48fa-afa2-9b5e4132f6a8
ACTIVE_STORE_CODE=<storeCode zu ACTIVE_STORE_ID, wird fuer Produkt-Schreibzugriffe benoetigt>
REGION_ALLOWED_STORE_ID=ad61389a-7486-48fa-afa2-9b5e4132f6a8
REGION_FORBIDDEN_STORE_ID=00000000-0000-0000-0000-000000000000
STORE_ALLOWED_STORE_ID=ad61389a-7486-48fa-afa2-9b5e4132f6a8
STORE_FORBIDDEN_STORE_ID=8c45864d-5041-4b07-aca0-2405db5a2ca7
ACTIVE_RECIPE_ID=00000000-0000-0000-0000-000000000000
RECIPE_SEARCH_QUERY=pasta
UPSELL_CHECKED_PRODUCT_ID=990001
UPSELL_UNKNOWN_PRODUCT_ID=999999999
```

`ACTIVE_RECIPE_ID` darf fuer Smoke-Zwecke auf einer unbekannten UUID stehen;
dann werden Detail und Mapping als dokumentiertes `404` akzeptiert. Fuer eine
staerkere Live-Demo sollte hier eine publizierte Rezept-ID aus der Demo-DB
eingetragen werden.

Aktueller Live-Stand:

- `indooro-admin` sieht alle Stores.
- `indooro-region` ist Region `Oberoesterreich` zugeordnet.
- `indooro-store` ist Store `Eurospar Poststrasse` zugeordnet.

Wenn sich die Seed-/Demo-Daten aendern, muessen diese IDs angepasst werden.

## Wenn etwas fehlschlaegt

Bei `401` oder Keycloak-Fehler:

- Stimmen Username/Passwort in `.env`?
- Ist `KEYCLOAK_TOKEN_URL` korrekt?
- Ist Direct Access Grants beim Client `indooro-admin-web` aktiv?

Bei `302` auf Admin-Routen:

- Das Backend akzeptiert Bearer Tokens nicht korrekt.
- In Quarkus muss `quarkus.oidc.application-type=hybrid` aktiv sein.

Bei `403`:

- Meist ist die Auth ok, aber die Rolle darf diese Route nicht.
- Bei RBAC-Tests kann das auch das erwartete Ergebnis sein.

Bei `404` fuer Store-Details:

- Die Fixture-ID existiert in der aktuellen Datenbank nicht mehr.
- IDs in `api-tests/httpyac/.env` aktualisieren.
